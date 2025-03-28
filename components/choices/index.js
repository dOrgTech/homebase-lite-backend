const mongoose = require("mongoose");
const express = require("express");
const md5 = require("md5");
// This will help us connect to the database
const dbo = require("../../db/conn");
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
  const { payloadBytes, publicKey, signature } = req.body;
  const network = req.body.network;
  let j = 0;
  let i = 0;
  const timeNow = new Date().valueOf();

  if (network?.startsWith("etherlink")) {
    try {
      console.log('[payload]', req.payloadObj)
      const castedChoices = req.payloadObj;
      if (castedChoices.length === 0) throw new Error("No choices sent in the request");
      const address = castedChoices[0].address
      const pollId = castedChoices[0].pollID
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

      const total = await getEthUserBalanceAtLevel(dao.network || network, address, dao.tokenAddress, block)
      console.log("EthTotal_UserBalance: ", total)

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
            {_id: ObjectId(choiceId)}, 
            {$push: {walletAddresses: walletVote}
          })
        }
      }
      return response.json({ success: true });
    }
    catch (error) {
      console.log("error: ", error);
      return response.status(400).send({
        message: error.message,
      });
    }
  }
  else {
    try {
      let oldVote = null;
      const values = getInputFromSigPayload(payloadBytes);

      const payloadDate = getTimestampFromPayloadBytes(payloadBytes);

      let db_connect = dbo.getDb("Lite");

      const pollID = values[0].pollID;

      const poll = await db_connect
        .collection("Polls")
        .findOne({ _id: ObjectId(pollID) });

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

      const address = getPkhfromPk(publicKey);

      // Validate values
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

      if (!total) {
        throw new Error("Could not get total power at reference block");
      }

      if (total.eq(0)) {
        throw new Error("No balance at proposal level");
      }
      const isVoted = await db_connect
        .collection('Choices')
        .find({
          pollID: poll._id,
          walletAddresses: { $elemMatch: { address: address } },
        })
        .toArray();


      if (isVoted.length > 0) {
        const oldVoteObj = isVoted[0].walletAddresses.find(x => x.address === address);
        oldVote = await db_connect.collection("Choices").findOne({
          _id: ObjectId(oldVoteObj.choiceId),
        });

        const oldSignaturePayload = oldVote.walletAddresses[0].payloadBytes
        if (oldSignaturePayload) {
          const oldSignatureDate =
            getTimestampFromPayloadBytes(oldSignaturePayload);

          if (payloadDate <= oldSignatureDate) {
            throw new Error("Invalid Signature");
          }
        }
      }

      // const ipfsProof = getIPFSProofFromPayload(payloadBytes, signature)
      // const cidLink = await uploadToIPFS(ipfsProof).catch(error => {
      //   console.error('IPFS Error', error)
      //   return null;
      // });
      // if (!cidLink) {
      //   throw new Error(
      //     "Could not upload proof to IPFS, Vote was not registered. Please try again later"
      //   );
      // }

      // TODO: Optimize this Promise.all
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

          // TODO: Enable this when the IPFS CID is added to the walletVote object
          // walletVote.cidLink = cidLink;

          const choice = await db_connect
            .collection("Choices")
            .findOne({ _id: ObjectId(choiceId) });
          if (isVoted.length > 0) {
            if (poll.votingStrategy === 0) {
              const mongoClient = dbo.getClient();
              const session = mongoClient.startSession();

              let newData = {
                $push: {
                  walletAddresses: walletVote,
                },
              };

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
                  // const coll2 = db_connect.collection("Polls");


                  // Important:: You must pass the session to the operations
                  if (oldVote) {
                    await coll1.updateOne(
                      { _id: ObjectId(oldVote._id) },
                      remove,
                      { remove: true },
                      { session }
                    );
                  }

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
      console.log("error: ", error);
      response.status(400).send({
        message: error.message,
      });
    }
  }
};

// Get the user's choice
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

const votesByUser = async (req, response) => {
  const { id } = req.params;

  try {
    const choices = [];
    let db_connect = dbo.getDb("Lite");
    const cursor = await db_connect.collection("Choices").find({ "walletAddresses.address": id });
    await cursor.forEach((elem) => choices.push(elem));
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
  getPollVotes,
  votesByUser
};
