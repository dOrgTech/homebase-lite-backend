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

const axios = require("axios");
const { uploadToIPFS } = require("../../services/ipfs.service");
const DaoModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const ChoiceModel = require("../../db/models/Choice.model");

const { getEthCurrentBlockNumber, getEthTotalSupply } = require("../../utils-eth");

const ObjectId = require("mongodb").ObjectId;

async function _getPollData(mode="lite", {
  daoId, network, tokenAddress = null, authorAddress = null, payloadBytes = null
}){
  if(!network?.startsWith("etherlink"))
    throw new Error("Network is not supported");

  const currentTime = new Date().valueOf();

  if(mode == "onchain"){

    console.log("tokenAddress", tokenAddress)
    const [userTokenBalance, tokenTotalSupply, block] = await Promise.all([
      axios.get(`https://testnet.explorer.etherlink.com/api/v2/tokens/${tokenAddress}/holders`).then(res =>  res.data).catch(err => ({error: err.message})),
      axios.get(`https://testnet.explorer.etherlink.com/api/v2/tokens/${tokenAddress}`).then(res =>  res.data).catch(err => ({error: err.message})),
      getEthCurrentBlockNumber(network).catch(err => ({error: err.message}))
    ]);

    console.log(JSON.stringify({userTokenBalance, tokenTotalSupply, block}, null, 2));

    const payloadBytesHash = md5(payloadBytes);
    const doesPollExists = await PollModel.findOne({ payloadBytesHash });
    if (doesPollExists)
      throw new Error("Invalid Signature, Poll already exists");


    return {
      startTime: currentTime,
      referenceBlock: block,
      totalSupplyAtReferenceBlock: tokenTotalSupply.total_supply,
      payloadBytesHash,
      doesPollExists
    }
  }
  else{

    const dao = await DaoModel.findById(daoId);
    if(!dao) throw new Error("DAO Does not exist");

    const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
    if (!token) throw new Error("DAO Token Does not exist in system");

    const block = await getEthCurrentBlockNumber(dao.network);
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

    return {
      daoId,
      startTime: currentTime,
      referenceBlock: block,
      totalSupplyAtReferenceBlock: totalSupply,
      payloadBytesHash,
      doesPollExists
    }
  }
}

const getPollById = async (req, response) => {
  const { id } = req.params;

  try {
    let db_connect = dbo.getDb();
    let pollId = { _id: ObjectId(id) };

    const result = await db_connect.collection("Polls").findOne(pollId);
    response.json({
      ...result,
      name: result.name?.replace(/<[^>]*>/g, ''),
      description: result.description?.replace(/<[^>]*>/g, ''),
    });
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
      let payload = req.payloadObj;
      if(!payload){
        payload = getInputFromSigPayload(payloadBytes);
      }
      const {
        choices,
        name,
        description,
        externalLink,
        endTime,
        votingStrategy,
        isXTZ,
      } = payload;
      const daoID = payload?.daoID || payload?.daoId;
      console.log("Payload", payload)
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

      /**
       * @ashutoshpw
       * 
       * For Offchain Debate
       * - Get token Addresswithin the payload
       * = Get the User Token Balance by following API: https://testnet.explorer.etherlink.com/api/v2/tokens/0xBDAc0fBE8cf84eA51cB9436719f6074dA474ef5D/holders
       * - Get token Total Supplyw ith this: https://testnet.explorer.etherlink.com/api/v2/tokens/0xBDAc0fBE8cf84eA51cB9436719f6074dA474ef5D
       */

      const author = publicKey;

      const daoMode = daoID?.startsWith("0x") ? "onchain" : "lite";
      const { startTime, referenceBlock, totalSupplyAtReferenceBlock, payloadBytesHash, doesPollExists} = await _getPollData(daoMode, {
        daoId: daoID, 
        network, 
        authorAddress: publicKey,
        tokenAddress: payload?.tokenAddress,
        payloadBytes
      });

      if(doesPollExists)
        throw new Error("Invalid Signature, Poll already exists");
      
      const PollData = {
        name,
        author,
        description,
        externalLink,
        startTime,
        endTime,
        daoID,
        referenceBlock,
        totalSupplyAtReferenceBlock,
        signature,
        votingStrategy: payload?.votingStrategy || 0,
        isXTZ: payload?.isXTZ || false,
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

      const choicesObj = await ChoiceModel.insertMany(choicesData);
      const choicesIds = choicesObj.map(choice => choice._id);
      console.log({choicesIds})

      await PollModel.updateOne(
        { _id: pollId },
        { $set: { choices: choicesIds } }
      );

      if(daoMode == "lite"){
        await DaoModel.updateOne(
          { _id: ObjectId(daoID) },
          {
            $push: { polls: pollId },
          }
        );
      }else{
        await DaoModel.findOneAndUpdate(
          { address: daoID },
          {
            name: daoID,
            tokenAddress: payload?.tokenAddress,
            tokenType:"erc20",
            $push: { polls: pollId },
            votingAddressesCount: 0 // TODO: @ashutoshpw
          },
          { upsert: true, new: true }
        );
      }
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
