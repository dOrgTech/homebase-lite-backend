const md5 = require('md5');
const mongoose = require("mongoose");

const { getPkhfromPk } = require("@taquito/utils");
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

function validateExternalLink(externalLink) {
  if (!externalLink || typeof externalLink !== 'string') {
    return '';
  }
  return externalLink.startsWith('https://') ? externalLink : '';
}

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
    const result = await PollModel.findById(id).lean();
    
    if (!result) {
      return response.status(404).json({
        message: "Poll not found",
      });
    }
    
    // No Sanitization for Tezos Ecosystem
    let shouldSkipSanitzation = result?.daoID === "64ef1c7d514de7b078cb8ed2"

    response.json({
      ...result,
      name: result.name?.replace(/<[^>]*>/g, ''),
      description: shouldSkipSanitzation ? result.description : result.description?.replace(/<[^>]*>/g, ''),
      externalLink: validateExternalLink(result.externalLink),
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
  let shouldSkipSanitzation = false;

  try {
    const polls = await PollModel.find({ daoID: id })
      .sort({ _id: -1 })
      .lean();

      const pollsFilltered = polls.map(poll => {
        return {
          ...poll,
          name: poll.name.replace(/<[^>]*>/g, ''),
          description: poll.description.replace(/<[^>]*>/g, ''),
          externalLink: validateExternalLink(poll.externalLink),
        }
      })

    response.json(pollsFilltered);
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
        externalLink: validateExternalLink(externalLink),
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
          { _id: daoID },
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
            votingAddressesCount: 0
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

      const dao = await DaoModel.findById(daoID);
      if (!dao) {
        throw new Error("DAO Does not exist");
      }

      const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
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
        throw new Error("Could not fetch total supply");
      }

      const doesPollExists = await PollModel.findOne({ payloadBytes });

      if (doesPollExists) {
        throw new Error("Invalid Signature, Poll already exists");
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const PollData = {
          name,
          description,
          externalLink: validateExternalLink(externalLink),
          startTime,
          endTime,
          daoID,
          referenceBlock: block,
          totalSupplyAtReferenceBlock: total,
          author,
          votingStrategy,
          isXTZ,
          payloadBytes,
          signature,
          cidLink: "",
        };

        const createdPoll = await PollModel.create([PollData], { session });
        const poll_id = createdPoll[0]._id;

        const choicesData = choices.map((element) => {
          return {
            name: element,
            pollID: poll_id,
            walletAddresses: [],
          };
        });

        const createdChoices = await ChoiceModel.insertMany(choicesData, { session });
        const choicesPoll = createdChoices.map((element) => element._id);

        await PollModel.updateOne(
          { _id: poll_id },
          { $set: { choices: choicesPoll } },
          { session }
        );

        await DaoModel.updateOne(
          { _id: daoID },
          { $push: { polls: poll_id } },
          { session }
        );

        await session.commitTransaction();
        response.json({ pollId: poll_id });
      } catch (e) {
        await session.abortTransaction();
        console.log(e);
        throw e;
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
