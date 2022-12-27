const { bytes2Char } = require("@taquito/utils");
const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const daoRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");
const { requireSignature } = require("../middlewares");
const { getInputFromSigPayload } = require("../utils");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a list of all the records.
daoRoutes.route("/daos").post((req, res) => {
  const { network } = req.body;
  let db_connect = dbo.getDb("Lite");

  try {
    db_connect
      .collection("DAOs")
      .find({ network })
      .toArray((err, result) => {
        if (err) throw err;
        res.json(result);
      })
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving the list of communities ",
    });
  }

});

// This section will help you get a single record by id
daoRoutes.route("/daos/:id").get((req, res) => {
  try {
    let db_connect = dbo.getDb();
    let id = { _id: ObjectId(req.params.id) };
    db_connect.collection("DAOs").findOne(id, function (err, result) {
      if (err) throw err;
      res.json(result);
    })
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Community not found ",
    });
  }
});

// This section will help you update a record by id.
daoRoutes
  .route("/daos/join")
  .all(requireSignature)
  .post(function (req, response) {
    try {
      const { payloadBytes } = req.body;
      const values = getInputFromSigPayload(payloadBytes);
      const { address, daoId } = values;

      let db_connect = dbo.getDb();
      let id = { _id: ObjectId(daoId) };
      let data = [
        {
          $set: {
            members: {
              $cond: [
                {
                  $in: [address, "$members"],
                },
                {
                  $setDifference: ["$members", [address]],
                },
                {
                  $concatArrays: ["$members", [address]],
                },
              ],
            },
          },
        },
      ];
      db_connect.collection("DAOs").updateOne(id, data, function (err, res) {
        if (err) throw err;
        response.json(res);
      })
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: "Could not join community",
      });
    }
  })

// This section will help you create a new record.
daoRoutes
  .route("/dao/add")
  .all(requireSignature)
  .post(async function (req, response) {
    const { payloadBytes } = req.body;
    const values = getInputFromSigPayload(payloadBytes);

    const mongoClient = dbo.getClient();
    const session = mongoClient.startSession();
    let db_connect = dbo.getDb();

    const original_id = ObjectId();

    let DAOData = {
      name: values.name,
      description: values.description,
      linkToTerms: values.linkToTerms,
      picUri: values.picUri,
      members: values.members,
      polls: values.polls,
      tokenAddress: values.tokenAddress,
      tokenType: values.tokenType,
      requiredTokenOwnership: values.requiredTokenOwnership,
      allowPublicAccess: values.allowPublicAccess,
      _id: original_id,
      network: values.network,
    };

    try {
      await session
        .withTransaction(async () => {
          const coll1 = db_connect.collection("DAOs");
          const coll2 = db_connect.collection("Tokens");
          // Important:: You must pass the session to the operations
          await coll1.insertOne(DAOData, { session });

          await coll2.insertOne(
            {
              tokenAddress: values.tokenAddress,
              tokenType: values.tokenType,
              symbol: values.symbol,
              tokenID: values.tokenID,
              daoID: original_id,
              decimals: values.decimals,
            },
            { session }
          );
        })
        .then((res) => response.json(res));
    } catch (e) {
      result = e.Message;
      console.warn(result);
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }
  });

module.exports = daoRoutes;
