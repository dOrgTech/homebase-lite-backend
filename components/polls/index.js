const md5 = require('md5');

// This will help us connect to the database
const { getPkhfromPk } = require("@taquito/utils");
const dbo = require("../../db/conn");
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getTotalSupplyAtCurrentBlock,
  getUserTotalVotingPowerAtReferenceBlock,
  getIPFSProofFromPayload,
} = require("../../utils");

const { uploadToIPFS } = require("../../services/ipfs.service");
const DaoModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const ChoiceModel = require("../../db/models/Choice.model");

const { getEthCurrentBlock, getEthTotalSupply } = require("../../utils-eth");

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
      message: error.message,
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
      message: error.message,
    });
  }
};

const addPoll = async (req, response) => {
  const { payloadBytes, publicKey, signature } = req.body;
  const network = req.body.network;

  if (network?.startsWith("etherlink")) {
    try {
      const payload = req.payloadObj;
      const {
        choices,
        daoID,
        name,
        description,
        externalLink,
        endTime,
        votingStrategy,
        isXTZ,
      } = payload;

      if (choices.length === 0) {
        throw new Error("No choices sent in the request");
      }

      const currentTime = new Date().valueOf();
      console.log({currentTime, endTime, daoID, payloadBytes})
      if (Number(endTime) <= currentTime) {
        throw new Error("End Time has to be in future");
      }

      const duplicates = choices.filter(
        (item, index) => choices.indexOf(item.trim()) !== index
      );
      if (duplicates.length > 0) {
        throw new Error("Duplicate choices found");
      }

      const dao = await DaoModel.findById(daoID);
      if (!dao) throw new Error("DAO Does not exist");

      const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
      if (!token) throw new Error("DAO Token Does not exist in system");

      const block = await getEthCurrentBlock(dao.network);
      const author = publicKey;
      const startTime = currentTime;
      const totalSupply = await getEthTotalSupply(
        dao.network,
        dao.tokenAddress,
        block
      );

      // TODO: @ashutoshpw To be Implemented
      // const userVotingPowerAtCurrentLevel =
      //   await getUserTotalVotingPowerAtReferenceBlock(
      //     dao.network,
      //     dao.tokenAddress,
      //     dao.daoContract,
      //     token.tokenID,
      //     block,
      //     author
      //   );

      // if (userVotingPowerAtCurrentLevel.eq(0) && dao.requiredTokenOwnership) {
      //   throw new Error(
      //     "User Doesnt have balance at this level to create proposal"
      //   );
      // }

      const payloadBytesHash = md5(payloadBytes);
      const doesPollExists = await PollModel.findOne({ payloadBytesHash });
      if (doesPollExists)
        throw new Error("Invalid Signature, Poll already exists");

      const PollData = {
        name,
        author,
        description,
        externalLink,
        startTime,
        endTime,
        daoID,
        referenceBlock: block,
        totalSupplyAtReferenceBlock: totalSupply,
        signature,
        votingStrategy,
        payloadBytes,
        payloadBytesHash,
        cidLink: "",
      };

      const createdPoll = await PollModel.create(PollData);
      const pollId = createdPoll._id;

      const choicesData = choices.map((element) => {
        return {
          name: element,
          walletAddresses: [],
          pollID: pollId,
        };
      });

      await ChoiceModel.insertMany(choicesData);

      await DaoModel.updateOne(
        { _id: ObjectId(daoID) },
        {
          $push: { polls: pollId },
        }
      );
      return response.status(200).send({
        message: "Poll Created Successfully",
        pollId,
      });
    } catch (error) {
      console.log("error: ", error);
      return response.status(400).send({
        message: error.message,
      });
    }
  } else {
    try {
      const values = getInputFromSigPayload(payloadBytes);

      const {
        choices,
        daoID,
        name,
        description,
        externalLink,
        endTime,
        votingStrategy,
        isXTZ,
      } = values;

      const author = getPkhfromPk(publicKey);

      const mongoClient = dbo.getClient();
      const session = mongoClient.startSession();
      let db_connect = dbo.getDb();

      const poll_id = ObjectId();

      const currentTime = new Date().valueOf();

      const startTime = currentTime;

      if (choices.length === 0) {
        throw new Error("No choices sent in the request");
      }

      if (Number(endTime) <= currentTime) {
        throw new Error("End Time has to be in future");
      }

      let duplicates = choices.filter(
        (item, index) => choices.indexOf(item.trim()) !== index
      );
      if (duplicates.length > 0) {
        throw new Error("Duplicate choices found");
      }

      const dao = await db_connect
        .collection("DAOs")
        .findOne({ _id: ObjectId(daoID) });
      if (!dao) {
        throw new Error("DAO Does not exist");
      }

      const token = await db_connect
        .collection("Tokens")
        .findOne({ tokenAddress: dao.tokenAddress });
      if (!token) {
        throw new Error("DAO Token Does not exist in system");
      }

      const block = await getCurrentBlock(dao.network);
      const total = await getTotalSupplyAtCurrentBlock(
        dao.network,
        dao.tokenAddress,
        token.tokenID
      );

      const userVotingPowerAtCurrentLevel =
        await getUserTotalVotingPowerAtReferenceBlock(
          dao.network,
          dao.tokenAddress,
          dao.daoContract,
          token.tokenID,
          block,
          author
        );

      if (userVotingPowerAtCurrentLevel.eq(0) && dao.requiredTokenOwnership) {
        throw new Error(
          "User Doesnt have balance at this level to create proposal"
        );
      }

      if (!total) {
        await session.abortTransaction();
      }

      const choicesData = choices.map((element) => {
        return {
          name: element,
          pollID: poll_id,
          walletAddresses: [],
          _id: ObjectId(),
        };
      });
      const choicesPoll = choicesData.map((element) => {
        return element._id;
      });

      const doesPollExists = await db_connect
        .collection("Polls")
        .findOne({ payloadBytes });

      if (doesPollExists) {
        throw new Error("Invalid Signature, Poll already exists");
      }

      // const cidLink = await uploadToIPFS(
      //   getIPFSProofFromPayload(payloadBytes, signature)
      // );
      // if (!cidLink) {
      //   throw new Error(
      //     "Could not upload proof to IPFS, Vote was not registered. Please try again later"
      //   );
      // }

      let PollData = {
        name,
        description,
        externalLink,
        startTime,
        endTime,
        daoID,
        referenceBlock: block,
        totalSupplyAtReferenceBlock: total,
        _id: poll_id,
        choices: choicesPoll,
        author,
        votingStrategy,
        isXTZ,
        payloadBytes,
        signature,
        cidLink: "",
      };

      let data = {
        $push: {
          polls: poll_id,
        },
      };

      let id = { _id: ObjectId(daoID) };

      try {
        await session
          .withTransaction(async () => {
            const coll1 = db_connect.collection("Polls");
            const coll2 = db_connect.collection("Choices");
            const coll3 = db_connect.collection("DAOs");
            // Important:: You must pass the session to the operations
            await coll1.insertOne(PollData, { session });

            await coll2.insertMany(choicesData, { session });

            await coll3.updateOne(id, data, { session });
          })
          .then((res) => response.json({ res, pollId: poll_id }));
      } catch (e) {
        result = e.Message;
        console.log(e);
        await session.abortTransaction();
        throw new Error(e);
      } finally {
        await session.endSession();
      }
    } catch (error) {
      console.log("error: ", error);
      response.status(400).send({
        message: error.message,
      });
    }
  }
};

module.exports = {
  getPollById,
  getPollsById,
  addPoll,
};
