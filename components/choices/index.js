const mongoose = require("mongoose");
const express = require("express");
const md5 = require("md5");
const {
  getInputFromSigPayload,
  getTimestampFromPayloadBytes,
  getIPFSProofFromPayload,
  getUserTotalVotingPowerAtReferenceBlock,
} = require("../../utils");
const { default: BigNumber } = require("bignumber.js");
const { getPkhfromPk } = require("@taquito/utils");
const { uploadToIPFS } = require("../../services/ipfs.service");
const DAOModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const ChoiceModel = require("../../db/models/Choice.model");
const { getEthUserBalanceAtLevel } = require("../../utils-eth");

const getChoiceById = async (req, response) => {
  const { id } = req.params;

  try {
    const choices = await ChoiceModel.find({ pollID: id }).lean();
    return response.json(choices);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const updateChoiceById = async (req, response) => {
  const { payloadBytes, publicKey, signature } = req.body;
  const network = req.body.network;
  const reqId = req.id || "no-reqid";
  console.log("[choices.update:start]", { reqId, network, path: req.originalUrl });
  let j = 0;
  let i = 0;
  const timeNow = new Date().valueOf();

  if (network?.startsWith("etherlink")) {
    try {
      console.log("[choices.update:eth:payload]", { reqId, length: Array.isArray(req.payloadObj) ? req.payloadObj.length : -1 });
      const castedChoices = req.payloadObj;
      if (castedChoices.length === 0) throw new Error("No choices sent in the request");
      const address = castedChoices[0].address
      const pollId = castedChoices[0].pollID
      console.log("[choices.update:eth:fetch-poll]", { reqId, pollId });
      const poll = await PollModel.findById(pollId)

      if(!poll) throw new Error("Poll not found")

      if (timeNow > Number(poll.endTime)) {
        throw new Error("Proposal Already Ended");
      }
      const daoFindQuery = {}
      if(mongoose.isValidObjectId(poll.daoID)){
        daoFindQuery._id = poll.daoID
      } else {
        daoFindQuery.address = { $regex: new RegExp(`^${poll.daoID}$`, 'i') };
      }
      console.log("[choices.update:eth:find-dao]", { reqId, daoFindQuery });
      const dao = await DAOModel.findOne(daoFindQuery)
      if (!dao) throw new Error(`DAO not found: ${poll.daoID}`)

      const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress })
      const block = poll.referenceBlock;

      castedChoices.forEach((value) => {
        if (value.address !== address) {
          throw new Error("Invalid Proposal Body, Invalid Address in choices");
        }
        if (value.pollID !== pollId) {
          throw new Error("Invalid Proposal Body, Invalid Poll ID in choices");
        }
      });

      const choiceIds = castedChoices.map((value) => value.choiceId);
      let duplicates = choiceIds.filter(
        (item, index) => choiceIds.indexOf(item.trim()) !== index
      );
      if (duplicates.length > 0) throw new Error("Duplicate choices found");

      console.log("[choices.update:eth:balance-request]", { reqId, net: dao.network || network, address, token: dao.tokenAddress, block });
      const total = await getEthUserBalanceAtLevel(dao.network || network, address, dao.tokenAddress, block)
      console.log("[choices.update:eth:balance-response]", { reqId, total: total?.toString?.() || total });

      if (!total) {
        throw new Error("Could not get total power at reference block");
      }

      // if (total.eq(0)) {
      //   throw new Error("No balance at proposal level");
      // }
      
      const isVoted = await ChoiceModel.find({
        pollId: poll._id,
        walletAddresses: { $elemMatch: { address: address } }
      });
      console.log("[choices.update:eth:is-voted]", { reqId, count: isVoted?.length || 0 });


      const walletVote = {
        address,
        balanceAtReferenceBlock: total.toString(),
        payloadBytes,
        payloadBytesHash: md5(payloadBytes),
        signature,
      };

      if (isVoted.length > 0) {
        const oldVoteObj = isVoted[0].walletAddresses.find(x => x.address === address);
        oldVote = await ChoiceModel.findById(oldVoteObj.choiceId);
        console.log("[choices.update:eth:old-vote]", { reqId, hasOld: Boolean(oldVote) });

        // TODO: Enable Repeat Vote
        // const oldSignaturePayload = oldVote.walletAddresses[0].payloadBytes
        // if (oldSignaturePayload) {
        //   const oldSignatureDate =
        //     getTimestampFromPayloadBytes(oldSignaturePayload);

        //   if (payloadDate <= oldSignatureDate) {
        //     throw new Error("Invalid Signature");
        //   }
        // }

        for (value of castedChoices) {
          const choiceId = value.choiceId
          const updatePayload = {
            $push: {
              walletAddresses: {
                ...walletVote,
                choiceId,
              }
            },
          }
          if (oldVote) updatePayload.$pull = { walletAddresses: { address: address } }

          if (poll.votingStrategy === 0) {
            await ChoiceModel.updateOne(
              { _id: choiceId },
              updatePayload
            )
            console.log("[choices.update:eth:update-one]", { reqId, choiceId });
          } else {
            await ChoiceModel.updateMany(
              { pollID: poll._id },
              { $pull: { walletAddresses: { address } } },
              { remove: true }
            )
            await ChoiceModel.updateOne(
              { _id: choiceId },
              updatePayload,
              { upsert: true }
            )
            console.log("[choices.update:eth:update-many-one]", { reqId, choiceId });
          }
        }

      } else {
        if (castedChoices.length > 1) {
          // const distributedWeight = total.div(new BigNumber(values.length));
          // walletVote.balanceAtReferenceBlock = distributedWeight.toString();
        }
        for(const choice of castedChoices){
          const choiceId = choice.choiceId
          await ChoiceModel.updateOne(
            {_id: choiceId},
            {$push: {walletAddresses: walletVote}
          })
          console.log("[choices.update:eth:initial-vote]", { reqId, choiceId });
        }
      }
      return response.json({ success: true });
    }
    catch (error) {
      console.error("[choices.update:eth:error]", { reqId, error: error?.message, stack: error?.stack });
      return response.status(400).send({
        message: error.message,
      });
    }
  }
  else {
    try {
      let oldVote = null;
      console.log("[choices.update:tz:parse]", { reqId, payloadBytesLen: payloadBytes?.length });
      const values = getInputFromSigPayload(payloadBytes);
      console.log("[choices.update:tz:values]", { reqId, count: values?.length || 0 });

      const payloadDate = getTimestampFromPayloadBytes(payloadBytes);
      console.log("[choices.update:tz:payload-date]", { reqId, payloadDate });

      const pollID = values[0].pollID;
      console.log("[choices.update:tz:poll-id]", { reqId, pollID });

      const poll = await PollModel.findById(pollID);
      console.log("[choices.update:tz:poll]", { reqId, found: Boolean(poll) });

      if (timeNow > poll.endTime) {
        throw new Error("Proposal Already Ended");
      }

      const dao = await DAOModel.findById(poll.daoID);
      console.log("[choices.update:tz:dao]", { reqId, found: Boolean(dao) });

      const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
      console.log("[choices.update:tz:token]", { reqId, tokenAddress: token?.tokenAddress });

      const block = poll.referenceBlock;

      const address = getPkhfromPk(publicKey);
      console.log("[choices.update:tz:address]", { reqId, address });

      if (values.length === 0) {
        throw new Error("No choices sent in the request");
      }

      values.forEach((value) => {
        if (value.address !== address) {
          throw new Error("Invalid Proposal Body, Invalid Address in choices");
        }
        if (value.pollID !== pollID) {
          throw new Error("Invalid Proposal Body, Invalid Poll ID in choices");
        }
      });

      const choiceIds = values.map((value) => value.choiceId);
      let duplicates = choiceIds.filter(
        (item, index) => choiceIds.indexOf(item.trim()) !== index
      );
      if (duplicates.length > 0) {
        throw new Error("Duplicate choices found");
      }

      const total = await getUserTotalVotingPowerAtReferenceBlock(
        dao.network,
        dao.tokenAddress,
        dao.daoContract,
        token.tokenID,
        block,
        address,
        poll.isXTZ
      );
      console.log("[choices.update:tz:total]", { reqId, total: total?.toString?.() || total });

      if (!total) {
        throw new Error("Could not get total power at reference block");
      }

      if (total.eq(0)) {
        throw new Error("No balance at proposal level");
      }

      const isVoted = await ChoiceModel.find({
        pollID: poll._id,
        walletAddresses: { $elemMatch: { address: address } },
      }).lean();
      console.log("[choices.update:tz:is-voted]", { reqId, count: isVoted?.length || 0 });

      if (isVoted.length > 0) {
        const oldVoteObj = isVoted[0].walletAddresses.find(x => x.address === address);
        oldVote = await ChoiceModel.findById(oldVoteObj.choiceId);

        const oldSignaturePayload = oldVote.walletAddresses[0].payloadBytes
        if (oldSignaturePayload) {
          const oldSignatureDate =
            getTimestampFromPayloadBytes(oldSignaturePayload);

          if (payloadDate <= oldSignatureDate) {
            throw new Error("Invalid Signature");
          }
        }
      }

      await Promise.all(
        values.map(async (value) => {
          const { choiceId } = value;

          let walletVote = {
            address,
            balanceAtReferenceBlock: total.toString(),
            choiceId,
            payloadBytes,
            signature,
          };

          const choice = await ChoiceModel.findById(choiceId);

          if (isVoted.length > 0) {
            if (poll.votingStrategy === 0) {
              const session = await mongoose.startSession();
              session.startTransaction();

              try {
                if (oldVote) {
                  await ChoiceModel.updateOne(
                    { _id: oldVote._id },
                    { $pull: { walletAddresses: { address } } },
                    { session }
                  );
                }

                await ChoiceModel.updateOne(
                  { _id: choice._id },
                  { $push: { walletAddresses: walletVote } },
                  { session }
                );

                await session.commitTransaction();
              } catch (e) {
                console.error("[choices.update:tz:tx-error]", { reqId, error: e?.message, stack: e?.stack });
                await session.abortTransaction();
                console.log(e);
                throw e;
              } finally {
                await session.endSession();
              }
            } else {
              const session = await mongoose.startSession();
              session.startTransaction();

              const distributedWeight = total.div(new BigNumber(values.length));
              walletVote.balanceAtReferenceBlock = distributedWeight.toString();

              try {
                await ChoiceModel.updateMany(
                  { pollID: poll._id },
                  { $pull: { walletAddresses: { address } } },
                  { session }
                );

                await ChoiceModel.updateOne(
                  { _id: choice._id },
                  { $push: { walletAddresses: walletVote } },
                  { session, upsert: true }
                );

                await session.commitTransaction();
                i++;
              } catch (e) {
                console.error("[choices.update:tz:tx-error]", { reqId, error: e?.message, stack: e?.stack });
                await session.abortTransaction();
                console.log(e);
                throw e;
              } finally {
                await session.endSession();
              }
            }
          } else {
            if (values.length > 1) {
              const distributedWeight = total.div(new BigNumber(values.length));
              walletVote.balanceAtReferenceBlock = distributedWeight.toString();
            }

            await ChoiceModel.updateOne(
              { _id: choice._id },
              { $push: { walletAddresses: walletVote } },
              { upsert: true }
            );
            console.log("[choices.update:tz:initial-vote]", { reqId, choiceId: choice._id });

            j++;
          }
        })
      );

      console.log("[choices.update:tz:success]", { reqId });
      response.json({ success: true });
    } catch (error) {
      console.error("[choices.update:tz:error]", { reqId, error: error?.message, stack: error?.stack });
      response.status(400).send({
        message: error.message,
      });
    }
  }
};

const choicesByUser = async (req, response) => {
  const { id } = req.params;

  try {
    const res = await ChoiceModel.findOne({ "walletAddresses.address": id }).lean();
    response.json(res);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const votesByUser = async (req, response) => {
  const { id } = req.params;

  try {
    const choices = await ChoiceModel.find({ "walletAddresses.address": id }).lean();
    return response.json(choices);
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
    const choices = await ChoiceModel.find({ pollID: id }).lean();
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
  getPollVotes,
  votesByUser
};
