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
    return
  }
});

// This section will help you update a record by id.
choicesRoutes
  .route("/update/choice")
  .all(requireSignature)
  .post(async function (req, response) {
    try {
      let db_connect = dbo.getDb();
      const { payloadBytes } = req.body;
      const values = getInputFromSigPayload(payloadBytes);

      const poll = await db_connect
        .collection("Polls")
        .findOne({ _id: ObjectId(values[0].pollID) });

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

      console.log("empieza con estos values: ", values, values.length)
      values.forEach(async (value) => {

        const { address, choice: choiceName, choiceId } = value;

        let total = await getUserTotalSupplyAtReferenceBlock(
          dao.network,
          dao.tokenAddress,
          token.tokenID,
          block,
          address
        );

        if (total === 0) {
          throw "No balance at proposal level";
        }

        if (values.length > 1) {
          total = total / values.length
        }

        const choice = await db_connect
          .collection("Choices")
          .findOne({ _id: ObjectId(choiceId) });


        const walletVote = {
          address,
          balanceAtReferenceBlock: total,
          choiceId
        };

        const isVoted = await db_connect.collection("Polls").find({
          _id: poll._id,
          votes: { $elemMatch: { address: address } },
        }).toArray()

        if (isVoted.length > 0) {
          if (poll.votingStrategy === 0) {
            const mongoClient = dbo.getClient();
            const session = mongoClient.startSession();
            let db_connect = dbo.getDb();
            let id = choice._id

            let newData = {
              $push: {
                walletAddresses: walletVote,
              },
            };
            const oldVote = await db_connect
              .collection("Choices")
              .findOne({ _id: ObjectId(isVoted[0].votes[0].choiceId) });

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
                  await coll1.updateOne({ _id: ObjectId(choice._id) }, newData, { session });
                })
                .then((res) => response.json(res));
              return
            } catch (e) {
              result = e.Message;
              console.warn("error result", e);
              await session.abortTransaction();
            } finally {
              await session.endSession();
            }
          } else {
            console.log("entra aca")
            const mongoClient = dbo.getClient();
            const session = mongoClient.startSession();
            let db_connect = dbo.getDb();

            try {

              let remove = {
                $pull: {
                  walletAddresses: { address: address },
                }
              }

              console.log("address: ", address)
              console.log("choiceId: ", choiceId)

              let removePoll = {
                $pull: {
                  votes: { address: String(address) } & { choiceId: String(choiceId) }
                }
              }

              await session
                .withTransaction(async () => {
                  const coll1 = db_connect.collection("Choices");
                  const coll2 = db_connect.collection("Polls");

                  await coll1.updateOne(
                    { _id: ObjectId(choiceId) },
                    remove,
                    { remove: true },
                    { session }
                  );

                  await coll2.updateOne(
                    { _id: ObjectId(values[0].pollID) },
                    removePoll,
                    { remove: true },
                    { session },
                    function (err, res) {
                      console.log("res pullPoll", res)
                      if (err) throw err;
                    }
                  );

                  const updatedPoll = await db_connect
                    .collection("Polls")
                    .findOne({ _id: ObjectId(values[0].pollID) });

                  let totalVotes = updatedPoll.votes.length;
                  console.log(totalVotes);
                  const distributedWeight = total / totalVotes;

                  const walletDistributedVote = {
                    address,
                    balanceAtReferenceBlock: String(distributedWeight),
                    choiceId,
                  };

                  await coll2.updateOne(
                    {
                      _id: poll._id,
                    },
                    { $push: { votes: walletDistributedVote } },
                    { upsert: true },
                    { session },
                    function (err, res) {
                      if (err) throw err;
                    }
                  );

                  console.log("se ejecuta 1")

                  await coll1.updateOne(
                    {
                      _id: choice._id,
                    },
                    { $push: { walletAddresses: walletDistributedVote } },
                    { upsert: true },
                    { session },
                    function (err, res) {
                      if (err) throw err;
                    }
                  );
                  console.log("se ejecuta 2")

                  await coll2.updateMany(
                    {
                      _id: poll._id,
                      votes: { $elemMatch: { address: address } },
                    },
                    { $set: { "votes.$.balanceAtReferenceBlock": String(distributedWeight) } },
                    { session },
                    function (err, res) {
                      if (err) throw err;
                    }
                  );

                  console.log("se ejecuta 3")

                  // Important:: You must pass the session to the operations
                  await coll1.updateMany(
                    {
                      pollID: poll._id,
                      walletAddresses: { $elemMatch: { address: address } },
                    },
                    { $set: { "walletAddresses.$.balanceAtReferenceBlock": String(distributedWeight) } },
                    { session }
                  );

                  console.log("se ejecuta 4")

                })
                .then((res) => response.json(res));
            } catch (e) {
              result = e.Message;
              console.warn("entra 1", e);
              await session.abortTransaction();
            } finally {
              console.warn("entra 2");
              await session.endSession();
            }
          }
        } else {
          const mongoClient = dbo.getClient();
          const session = mongoClient.startSession();
          let db_connect = dbo.getDb();
          try {
            await session
              .withTransaction(async () => {
                await db_connect.collection("Polls").updateOne(
                  {
                    _id: poll._id,
                  },
                  { $push: { votes: walletVote } },
                  { upsert: true },
                  { session },
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
                await db_connect
                  .collection("Choices")
                  .updateOne(id, data, { upsert: true }, { session }, function (err, res) {
                    if (err) {
                      console.log("falla aqui", err)
                      throw err;
                    }
                  });
              }).then(res => response.json(res))

          } catch (error) {
            console.log("error: ", error);
            response.status(400).send({
              message: "Can't Vote",
            });
            return
          }
        }

      })
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: "Can't Vote",
      });
      return
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
          return
        }
      );
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving poll choices",
    });
    return
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
        return
      } catch (e) {
        result = e.Message;
        console.warn("res", result);
        await session.abortTransaction();
      } finally {
        await session.endSession();
      }
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: "Error creating choice",
      });
      return
    }
  });

module.exports = choicesRoutes;
