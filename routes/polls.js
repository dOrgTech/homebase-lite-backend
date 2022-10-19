const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const pollsRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id
pollsRoutes.route("/polls/:id").get(function (req, res) {
  let db_connect = dbo.getDb();
  let myquery = { _id: ObjectId(req.params.id) };
  db_connect
    .collection("Polls")
    .findOne(myquery, function (err, result) {
      if (err) throw err;
      res.json(result);
    });
});

// This section will help you create a new record.
pollsRoutes.route("/poll/add").post(async function (req, response) {

  const mongoClient = dbo.getClient();
  const session = mongoClient.startSession();
  let db_connect = dbo.getDb();
  
  const poll_id = ObjectId()

  const ChoicesData = req.body.choices.map(element => {
    return {
      name: element,
      pollID: poll_id,
      walletAddresses: [],
      _id: ObjectId()
    }
  })

  const choicesPoll = ChoicesData.map(element => {
    return element._id
  })

  let PollData = {
    name: req.body.name,
    description: req.body.description,
    externalLink: req.body.externalLink,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    daoID: req.body.daoID,
    referenceBlock: req.body.referenceBlock,
    totalSupplyAtReferenceBlock: req.body.totalSupplyAtReferenceBlock,
    _id: poll_id,
    choices: choicesPoll
  };

  try {
    await session.withTransaction(async () => {
      const coll1 = db_connect.collection('Polls');
      const coll2 = db_connect.collection('Choices');
      // Important:: You must pass the session to the operations
      await coll1.insertOne(PollData, { session });

      await coll2.insertMany(ChoicesData, { session })
    }).then(res => response.json(res));
  } catch (e) {
    result = e.Message;
    console.warn(result);
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }

});

module.exports = pollsRoutes