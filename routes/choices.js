const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const choicesRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/find").get(async (req, res) => {
    let db_connect = dbo.getDb();
    const choices = []
    const cursor = db_connect
        .collection("Choices")
        .find({ pollID: ObjectId(req.params.id) })

    await cursor.forEach(elem => choices.push(elem));
    return res.json(choices)
});

// This section will help you update a record by id.
choicesRoutes.route("/update/:id/choice").post(function (req, response) {
    let db_connect = dbo.getDb();
    let id = { _id: ObjectId(req.params.id) };
    let data = {
      $push: {
        walletAddresses: req.body
      },
    };
    db_connect
      .collection("Choices")
      .updateOne(id, data, { upsert: true }, function (err, res) {
        if (err) throw err;
        response.json(res);
      });
  });

// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/user").get(async (req, response) => {
  let db_connect = dbo.getDb();
  db_connect
      .collection("Choices")
      .findOne({ 'walletAddresses.address': req.params.id }, function (err, res) {
        if (err) throw err;
        response.json(res);
      })

});

// This section will help you create a new record.
choicesRoutes.route("/choices/:id/add").post(async function (req, response) {

  const mongoClient = dbo.getClient();
  const session = mongoClient.startSession();
  let db_connect = dbo.getDb();
  let id = { _id: ObjectId(req.params.id) };

  let data = {
    $push: {
      walletAddresses: req.body.newVote
    },
  };

  let remove = { $pull: { 'walletAddresses': {address: req.body.oldVote.walletAddresses[0].address} } }

  try {
    await session.withTransaction(async () => {
      const coll1 = db_connect.collection('Choices');
      // Important:: You must pass the session to the operations
      await coll1.updateOne({ _id: ObjectId(req.body.oldVote._id) }, remove, { remove: true }, { session });

      await coll1.updateOne(id, data, { session })
    }).then(res => response.json(res));
  } catch (e) {
    result = e.Message;
    console.warn(result);
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }

});

module.exports = choicesRoutes