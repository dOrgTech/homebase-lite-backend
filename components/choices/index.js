const express = require("express");

// This will help us connect to the database
const dbo = require("../../db/conn");
const {
  getInputFromSigPayload,
  getUserTotalVotingPowerAtReferenceBlock,
} = require("../../utils");
const { default: BigNumber } = require("bignumber.js");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

const getChoiceById = async (req, response) => {
  const { id } = req.params;

  try {
    const choices = [];
    let db_connect = dbo.getDb("Lite");
    const cursor = await db_connect
      .collection("Choices")
      .find({ pollID: ObjectId(id) });

    await cursor.forEach((elem) => choices.push(elem));
    return response.json(choices);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const updateChoiceById = async (req, response) => {
  const { id } = req.params;
  const { payloadBytes } = req.body;

  let j = 0;
  let i = 0;

  try {
    const values = getInputFromSigPayload(payloadBytes);
    let db_connect = dbo.getDb("Lite");

    const pollID = values[0].pollID;

    const poll = await db_connect
      .collection("Polls")
      .findOne({ _id: ObjectId(pollID) });

    const timeNow = Number(new Date());

    if (timeNow > poll.endTime) {
      throw new Error("Proposal Already Ended");
    }

    const dao = await db_connect
      .collection("DAOs")
      .findOne({ _id: ObjectId(poll.daoID) });

    const token = await db_connect
      .collection("Tokens")
      .findOne({ tokenAddress: dao.tokenAddress });

    const block = poll.referenceBlock;

    const address = values[0].address;

    // Validate values
    values.forEach((value) => {
      if (value.address !== address) {
        throw new Error("Invalid Proposal Body, Invalid Address in choices");
      }
      if (value.pollID !== pollID) {
        throw new Error("Invalid Proposal Body, Invalid Poll ID in choices");
      }
    });

    const total = await getUserTotalVotingPowerAtReferenceBlock(
      dao.network,
      dao.tokenAddress,
      dao.daoContract,
      token.tokenID,
      block,
      address
    );

    if (!total) {
      throw new Error("Could not get total power at reference block");
    }

    if (total.eq(0)) {
      throw new Error("No balance at proposal level");
    }

    await Promise.all(
      values.map(async (value) => {
        const { address, choiceId } = value;

        let walletVote = {
          address,
          balanceAtReferenceBlock: total.toString(),
          choiceId,
        };

        const choice = await db_connect
          .collection("Choices")
          .findOne({ _id: ObjectId(choiceId) });

        const isVoted = await db_connect
          .collection("Choices")
          .find({
            pollID: poll._id,
            walletAddresses: { $elemMatch: { address: address } },
          })
          .toArray();
        if (isVoted.length > 0) {
          if (poll.votingStrategy === 0) {
            const mongoClient = dbo.getClient();
            const session = mongoClient.startSession();

            let newData = {
              $push: {
                walletAddresses: walletVote,
              },
            };
            const oldVote = await db_connect.collection("Choices").findOne({
              _id: ObjectId(isVoted[0].walletAddresses[0].choiceId),
            });

            let remove = {
              $pull: {
                walletAddresses: {
                  address,
                },
              },
            };

            try {
              await session.withTransaction(async () => {
                const coll1 = db_connect.collection("Choices");
                const coll2 = db_connect.collection("Polls");

                // await coll2.updateOne({_id: poll._id},  { $set: { "votes" : values.length }})
                // Important:: You must pass the session to the operations
                await coll1.updateOne(
                  { _id: ObjectId(oldVote._id) },
                  remove,
                  { remove: true },
                  { session }
                );

                await coll1.updateOne({ _id: ObjectId(choice._id) }, newData, {
                  session,
                });
              });
              // .then((res) => response.json({ success: true }));
            } catch (e) {
              result = e.Message;
              console.log(e);
              await session.abortTransaction();
              throw new Error(e);
            } finally {
              await session.endSession();
            }
          } else {
            const mongoClient = dbo.getClient();
            const session = mongoClient.startSession();

            const distributedWeight = total.div(new BigNumber(values.length));

            walletVote.balanceAtReferenceBlock = distributedWeight.toString();

            let remove = {
              $pull: {
                walletAddresses: { address: address },
              },
            };

            try {
              // FIRST REMOVE OLD ADDRESS VOTES
              // Fix All polls votes removed
              await db_connect
                .collection("Choices")
                .updateMany({ pollID: poll._id }, remove, { remove: true });

              await session
                .withTransaction(async () => {
                  const coll1 = db_connect.collection("Choices");
                  const coll2 = db_connect.collection("Polls");

                  await coll1.updateOne(
                    {
                      _id: choice._id,
                    },
                    { $push: { walletAddresses: walletVote } },
                    { upsert: true }
                  );

                  i++;
                })
                .then((res) => {
                  if (i === values.length) {
                    // response.json({ success: true });
                  }
                });
            } catch (e) {
              result = e.Message;
              console.log(e);
              await session.abortTransaction();
              throw new Error(e);
            } finally {
              await session.endSession();
            }
          }
        } else {
          let newId = { _id: ObjectId(choice._id) };

          if (values.length > 1) {
            const distributedWeight = total.div(new BigNumber(values.length));
            walletVote.balanceAtReferenceBlock = distributedWeight.toString();
          }
          let data = {
            $push: {
              walletAddresses: walletVote,
            },
          };
          const res = await db_connect
            .collection("Choices")
            .updateOne(newId, data, { upsert: true });

          j++;

          if (j === values.length) {
            // response.json({ success: true });
          } else {
            return;
          }
        }
      })
    );

    response.json({ success: true });
  } catch (error) {
    console.log("error: ", error.message);
    response.status(400).send({
      message: error.message,
    });
  }
};

const choicesByUser = async (req, response) => {
  const { id } = req.params.id;

  try {
    let db_connect = dbo.getDb();
    const res = await db_connect
      .collection("Choices")
      .findOne({ "walletAddresses.address": id });

    response.json(res);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const addChoice = async function (req, response) {
  const { id } = req.params.id;
  const { data } = req.body;

  try {
    let db_connect = dbo.getDb();
    const mongoClient = dbo.getClient();
    const session = mongoClient.startSession();
    let idObj = { _id: ObjectId(id) };

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

          await coll1.updateOne(idObj, newData, { session });
        })
        .then((res) => response.json(res));
    } catch (e) {
      result = e.Message;
      console.log(e);
      await session.abortTransaction();
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getPollVotes = async (req, response) => {
  const { id } = req.params;
  let total = 0;

  try {
    const choices = [];
    let db_connect = dbo.getDb("Lite");
    const cursor = await db_connect.collection("Choices").find({
      pollID: ObjectId(id),
    });

    await cursor.forEach((elem) => choices.push(elem));
    choices.forEach((choice) => (total += choice.walletAddresses.length));
    return response.json(total);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

module.exports = {
  getChoiceById,
  updateChoiceById,
  choicesByUser,
  addChoice,
  getPollVotes,
};
