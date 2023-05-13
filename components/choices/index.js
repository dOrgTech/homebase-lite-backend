const express = require("express");

// This will help us connect to the database
const dbo = require("../../db/conn");
const {
  getInputFromSigPayload,
  getUserTotalSupplyAtReferenceBlock,
} = require("../../utils");

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
      message: "Error retrieving poll ",
    });
  }
};

const updateChoiceById = async (req, response) => {
  const { id } = req.params;
  const { payloadBytes } = req.body;

  try {
    const values = getInputFromSigPayload(payloadBytes);
    let db_connect = dbo.getDb("Lite");

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

    const isVoted = await db_connect
      .collection("Polls")
      .find({
        _id: poll._id,
        votes: { $elemMatch: { address: address } },
      })
      .toArray();
    if (isVoted.length > 0) {
      console.log("isVoted.length: ", isVoted.length);
      if (poll.votingStrategy === 0) {
        const mongoClient = dbo.getClient();
        const session = mongoClient.startSession();
        let idObj = { _id: ObjectId(id) };

        let newData = {
          $push: {
            walletAddresses: walletVote,
          },
        };
        const oldVote = await db_connect
          .collection("Choices")
          .findOne({ _id: ObjectId(isVoted[0].votes[0].choiceId) });

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
              await db_connect.collection("Polls").updateOne(
                {
                  _id: poll._id,
                  // "votes.address": address,
                  votes: { $elemMatch: { address: address } },
                },
                { $set: { "votes.$": walletVote } },
                { upsert: true },
                { session }
              );
              // Important:: You must pass the session to the operations
              await coll1.updateOne(
                { _id: ObjectId(oldVote._id) },
                remove,
                { remove: true },
                { session }
              );

              await coll1.updateOne(idObj, newData, { session });
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
        const mongoClient = dbo.getClient();
        const session = mongoClient.startSession();

        let totalVotes = poll.choices.length + 1;
        console.log("totalVotes: ", totalVotes);
        const distributedWeight = total / totalVotes;
        console.log("distributedWeight: ", distributedWeight);

        const walletDistributedVote = {
          address,
          balanceAtReferenceBlock: String(distributedWeight),
          choiceId,
        };
        console.log("walletDistributedVote: ", walletDistributedVote);

        const isVotedOnChoice = await db_connect
          .collection("Choices")
          .find({
            _id: ObjectId(choiceId),
            walletAddresses: { $elemMatch: { address: address } },
          })
          .toArray();

        if (isVotedOnChoice && isVotedOnChoice.length > 0) {
          console.log("here");
          throw "Already Voted on this Choice";
        }

        try {
          await session
            .withTransaction(async () => {
              const coll1 = db_connect.collection("Choices");
              const coll2 = db_connect.collection("Polls");
              await coll2.updateOne(
                {
                  _id: poll._id,
                },
                { $push: { votes: walletDistributedVote } },
                { upsert: true }
              );

              await coll1.updateOne(
                {
                  _id: choice._id,
                },
                { $push: { walletAddresses: walletDistributedVote } },
                { upsert: true }
              );

              await coll2.updateMany(
                {
                  _id: poll._id,
                  votes: { $elemMatch: { address: address } },
                },
                {
                  $set: {
                    "votes.$.balanceAtReferenceBlock":
                      String(distributedWeight),
                  },
                },
                { session }
              );

              // Important:: You must pass the session to the operations
              await coll1.updateMany(
                {
                  pollID: poll._id,
                  walletAddresses: { $elemMatch: { address: address } },
                },
                {
                  $set: {
                    "walletAddresses.$.balanceAtReferenceBlock":
                      String(distributedWeight),
                  },
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
      }
    } else {
      await db_connect.collection("Polls").updateOne(
        {
          _id: poll._id,
        },
        { $push: { votes: walletVote } },
        { upsert: true }
      );

      let newId = { _id: choice._id };
      let data = {
        $push: {
          walletAddresses: walletVote,
        },
      };
      const res = await db_connect
        .collection("Choices")
        .updateOne(newId, data, { upsert: true });

      response.json(res);
    }
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Can't Vote",
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
      message: "Error retrieving poll choices",
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
};

module.exports = {
  getChoiceById,
  updateChoiceById,
  choicesByUser,
  addChoice,
};
