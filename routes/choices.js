const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const choicesRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");
const { requireSignature } = require("../middlewares");
const {
  getInputFromSigPayload,
  getUserTotalSupplyAtReferenceBlock,
} = require("../utils");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/find").get(async (req, res) => {
  try {
    let db_connect = dbo.getDb();
    const choices = [];
    const cursor = db_connect
      .collection("Choices")
      .find({ pollID: ObjectId(req.params.id) });

    await cursor.forEach((elem) => choices.push(elem));
    return res.json(choices);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving poll ",
    });
  }
});

// This section will help you update a record by id.
choicesRoutes
  .route("/update/:id/choice")
  .all(requireSignature)
  .post(async function (req, response) {
    try {
      let db_connect = dbo.getDb();
      const { payloadBytes } = req.body;
      const values = getInputFromSigPayload(payloadBytes);

      const { address, choice: choiceName, choiceId } = values;

      const choice = await db_connect
        .collection("Choices")
        .findOne({ _id: ObjectId(choiceId) });

      const poll = await db_connect
        .collection("Polls")
        .findOne({ _id: ObjectId(choice.pollID) });

      const timeNow = Number(new Date());

      if (timeNow > poll.endTime) {
        throw "Proposal Already Ended";
      }

      const dao = await db_connect
        .collection("DAOs")
        .findOne({ _id: ObjectId(poll.daoID) });

      const token = await db_connect
        .collection("Tokens")
        .findOne({ tokenAddress: dao.tokenAddress });

      const block = poll.referenceBlock;
      const total = await getUserTotalSupplyAtReferenceBlock(
        dao.network,
        dao.tokenAddress,
        token.tokenID,
        block,
        address
      );

      if (total === 0) {
        throw "No balance at proposal level";
      }

      const walletVote = {
        address,
        balanceAtReferenceBlock: total,
        choiceId,
      };

      const isVoted = await db_connect.collection("Polls").findOne({
        _id: poll._id,
        votes: { $elemMatch: { address: address } },
      });

      if (isVoted) {
        const mongoClient = dbo.getClient();
        const session = mongoClient.startSession();
        let db_connect = dbo.getDb();
        let id = { _id: ObjectId(req.params.id) };

        let newData = {
          $push: {
            walletAddresses: walletVote,
          },
        };
        const oldVote = await db_connect
          .collection("Choices")
          .findOne({ _id: ObjectId(isVoted.votes[0].choiceId) });

        // do seomthing here.

        let remove = {
          $pull: {
            walletAddresses: { address: oldVote.walletAddresses[0].address },
          },
        };

        try {
          await session
            .withTransaction(async () => {
              const coll1 = db_connect.collection("Choices");
              db_connect.collection("Polls").updateOne(
                {
                  _id: poll._id,
                  // "votes.address": address,
                  votes: { $elemMatch: { address: address } },
                },
                { $set: { "votes.$": walletVote } },
                { upsert: true },
                { session },
                function (err, res) {
                  if (err) throw err;
                }
              );
              // Important:: You must pass the session to the operations
              await coll1.updateOne(
                { _id: ObjectId(oldVote._id) },
                remove,
                { remove: true },
                { session }
              );

              await coll1.updateOne(id, newData, { session });
            })
            .then((res) => response.json(res));
        } catch (e) {
          result = e.Message;
          console.warn(result);
          await session.abortTransaction();
        } finally {
          await session.endSession();
        }
      } else {
        db_connect.collection("Polls").updateOne(
          {
            _id: poll._id,
          },
          { $push: { votes: walletVote } },
          { upsert: true },
          function (err, res) {
            if (err) throw err;
          }
        );

        let id = { _id: choice._id };
        let data = {
          $push: {
            walletAddresses: walletVote,
          },
        };
        db_connect
          .collection("Choices")
          .updateOne(id, data, { upsert: true }, function (err, res) {
            if (err) throw err;
            response.json(res);
          });
      }
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: "Can't Vote",
      });
    }
  });

// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/user").get(async (req, response) => {
  try {
    let db_connect = dbo.getDb();
    db_connect
      .collection("Choices")
      .findOne(
        { "walletAddresses.address": req.params.id },
        function (err, res) {
          if (err) throw err;
          response.json(res);
        }
      );
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving poll choices",
    });
  }
});

// This section will help you create a new record.
choicesRoutes
  .route("/choices/:id/add")
  .all(requireSignature)
  .post(async function (req, response) {
    try {
      const { data } = req.body;
      const mongoClient = dbo.getClient();
      const session = mongoClient.startSession();
      let db_connect = dbo.getDb();
      let id = { _id: ObjectId(req.params.id) };

      let newData = {
        $push: {
          walletAddresses: data.newVote,
        },
      };

      let remove = {
        $pull: {
          walletAddresses: { address: data.oldVote.walletAddresses[0].address },
        },
      };

      try {
        await session
          .withTransaction(async () => {
            const coll1 = db_connect.collection("Choices");
            // Important:: You must pass the session to the operations
            await coll1.updateOne(
              { _id: ObjectId(data.oldVote._id) },
              remove,
              { remove: true },
              { session }
            );

            await coll1.updateOne(id, newData, { session });
          })
          .then((res) => response.json(res));
      } catch (e) {
        result = e.Message;
        console.warn(result);
        await session.abortTransaction();
      } finally {
        await session.endSession();
      }
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: "Error creating choice",
      });
    }
  });

module.exports = choicesRoutes;
