const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const pollsRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");
const { requireSignature } = require("../middlewares");
const {
  getTotalSupplyAtReferenceBlock,
  getInputFromSigPayload,
  getCurrentBlock,
} = require("../utils");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id
pollsRoutes.route("/polls/:id/polls").get(function (req, res) {
  let db_connect = dbo.getDb();
  let myquery = { _id: ObjectId(req.params.id) };
  db_connect.collection("Polls").findOne(myquery, function (err, result) {
    if (err) throw err;
    res.json(result);
  });
});

// This section will help you create a new record.
pollsRoutes
  .route("/poll/add")
  .all(requireSignature)
  .post(async function (req, response) {
    const { payloadBytes } = req.body;
    const values = getInputFromSigPayload(payloadBytes);

    const mongoClient = dbo.getClient();
    const session = mongoClient.startSession();
    let db_connect = dbo.getDb();

    const poll_id = ObjectId();

    const ChoicesData = values.choices.map((element) => {
      return {
        name: element,
        pollID: poll_id,
        walletAddresses: [],
        _id: ObjectId(),
      };
    });

    const choicesPoll = ChoicesData.map((element) => {
      return element._id;
    });

    const dao = await db_connect
      .collection("DAOs")
      .findOne({ _id: ObjectId(values.daoID) });

    const block = await getCurrentBlock(dao.network);
    const total = await getTotalSupplyAtReferenceBlock(
      dao.network,
      dao.tokenAddress,
      block
    );

    if (!total) {
      await session.abortTransaction();
    }

    let PollData = {
      name: values.name,
      description: values.description,
      externalLink: values.externalLink,
      startTime: values.startTime,
      endTime: values.endTime,
      daoID: values.daoID,
      referenceBlock: block,
      totalSupplyAtReferenceBlock: total,
      _id: poll_id,
      choices: choicesPoll,
      author: values.author,
    };

    let data = {
      $push: {
        polls: poll_id,
      },
    };

    let id = { _id: ObjectId(values.daoID) };

    try {
      await session
        .withTransaction(async () => {
          const coll1 = db_connect.collection("Polls");
          const coll2 = db_connect.collection("Choices");
          const coll3 = db_connect.collection("DAOs");
          // Important:: You must pass the session to the operations
          await coll1.insertOne(PollData, { session });

          await coll2.insertMany(ChoicesData, { session });

          await coll3.updateOne(id, data, { session });
        })
        .then((res) => response.json(res));
    } catch (e) {
      result = e.Message;
      console.log(e);
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }
  });

module.exports = pollsRoutes;
