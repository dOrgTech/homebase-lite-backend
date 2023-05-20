// This will help us connect to the database
const dbo = require("../../db/conn");
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getTotalSupplyAtCurrentBlock,
} = require("../../utils");

const ObjectId = require("mongodb").ObjectId;

const getPollById = async (req, response) => {
  const { id } = req.params;

  try {
    let db_connect = dbo.getDb();
    let pollId = { _id: ObjectId(id) };

    const result = await db_connect.collection("Polls").findOne(pollId);
    response.json(result);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving poll",
    });
  }
};

const getPollsById = async (req, response) => {
  const { id } = req.params;

  try {
    let db_connect = dbo.getDb();

    const polls = await db_connect
      .collection("Polls")
      .find({ daoID: id })
      .sort({ _id: -1 })
      .toArray();

    response.json(polls);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving the list of polls",
    });
  }
};

const addPoll = async (req, response) => {
  const { payloadBytes } = req.body;

  try {
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

    const token = await db_connect
      .collection("Tokens")
      .findOne({ tokenAddress: dao.tokenAddress });

    const block = await getCurrentBlock(dao.network);
    const total = await getTotalSupplyAtCurrentBlock(
      dao.network,
      dao.tokenAddress,
      token.tokenID,
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
      votingStrategy: values.votingStrategy,
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
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Could not create new poll",
    });
  }
};

module.exports = {
  getPollById,
  getPollsById,
  addPoll,
};