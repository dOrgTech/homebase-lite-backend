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
const DAOModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const ChoiceModel = require("../../db/models/Choice.model");
const { getEthUserBalanceAtLevel } = require("../../utils-eth");

// Simple in-memory lock to prevent race conditions on concurrent votes
const voteLocks = new Map();

async function withVoteLock(pollID, address, fn) {
  const key = `${pollID}:${address}`;

  // Wait if another request is processing this voter
  while (voteLocks.has(key)) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  voteLocks.set(key, true);
  try {
    return await fn();
  } finally {
    voteLocks.delete(key);
  }
}

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Both chains sign the same text: "Tezos Signed Message: <site> <ISO date> <json>".
// Tezos sends it hex-encoded as a Micheline string, Etherlink sends the text.
const getEthPayloadDate = (payloadBytes) => {
  const parts = String(payloadBytes).split(" ");
  return new Date(parts[4]).valueOf();
};

// Runs fn inside a transaction when the deployment supports one (Atlas does),
// and plainly otherwise. The first write of a transaction fails before anything
// is persisted when transactions are unsupported, so the fallback is safe.
async function withTransaction(fn) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    return fn(null);
  }
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (e) {
    if (/Transaction numbers|replica set|transactions are not supported/i.test(e?.message || "")) {
      return fn(null);
    }
    throw e;
  } finally {
    await session.endSession();
  }
}

/**
 * Records a verified voter's choices on a poll. Everything that decides
 * whether a vote counts lives here, for both chains:
 *  - every choice must belong to the poll the vote is signed for
 *  - a single-choice poll accepts exactly one choice
 *  - weight is split across choices in multi-choice polls
 *  - a voter has one set of entries per poll: casting again replaces it
 *  - a signed vote cannot be replayed, and an older signed vote cannot
 *    overwrite a newer one
 */
async function castVote({ reqId, poll, address, addressMatch, isSameAddress, total, choiceIds, payloadBytes, signature, payloadDate, dateOf }) {
  if (!Array.isArray(choiceIds) || choiceIds.length === 0) {
    throw new Error("No choices sent in the request");
  }
  const ids = choiceIds.map((id) => String(id).trim());
  if (new Set(ids).size !== ids.length) {
    throw new Error("Duplicate choices found");
  }
  if (!ids.every((id) => mongoose.isValidObjectId(id))) {
    throw new Error("Invalid choice id");
  }
  if (poll.votingStrategy === 0 && ids.length > 1) {
    throw new Error("This poll accepts a single choice");
  }
  const owned = await ChoiceModel.countDocuments({ _id: { $in: ids }, pollID: poll._id });
  if (owned !== ids.length) {
    throw new Error("Choice does not belong to this poll");
  }
  if (!Number.isFinite(payloadDate)) {
    throw new Error("Invalid payload timestamp");
  }

  const weight = new BigNumber(total.toString());
  if (!weight.isFinite() || weight.lte(0)) {
    throw new Error("No balance at proposal level");
  }
  const perChoice = ids.length > 1 ? weight.div(ids.length) : weight;
  const payloadBytesHash = md5(payloadBytes);

  return withVoteLock(String(poll._id), String(address).toLowerCase(), async () => {
    const existing = await ChoiceModel.find({
      pollID: poll._id,
      walletAddresses: { $elemMatch: { address: addressMatch } },
    }).lean();

    for (const choice of existing) {
      for (const entry of choice.walletAddresses || []) {
        if (!isSameAddress(entry.address)) continue;
        if (entry.payloadBytesHash && entry.payloadBytesHash === payloadBytesHash) {
          throw new Error("This vote has already been recorded");
        }
        if (entry.payloadBytes) {
          const previous = dateOf(entry.payloadBytes);
          if (Number.isFinite(previous) && payloadDate <= previous) {
            throw new Error("A newer vote from this address already exists");
          }
        }
      }
    }

    const votedAt = new Date();
    await withTransaction(async (session) => {
      const opts = session ? { session } : {};
      await ChoiceModel.updateMany(
        { pollID: poll._id },
        { $pull: { walletAddresses: { address: addressMatch } } },
        opts
      );
      for (const choiceId of ids) {
        await ChoiceModel.updateOne(
          { _id: choiceId, pollID: poll._id },
          {
            $push: {
              walletAddresses: {
                address,
                balanceAtReferenceBlock: perChoice.toFixed(),
                choiceId,
                payloadBytes,
                payloadBytesHash,
                signature,
                votedAt,
              },
            },
          },
          opts
        );
      }
    });
    console.log("[choices.update:cast]", { reqId, pollID: String(poll._id), choices: ids.length, replaced: existing.length > 0 });
  });
}

const updateChoiceById = async (req, response) => {
  const { payloadBytes, publicKey, signature } = req.body;
  const network = req.body.network;
  const reqId = req.id || "no-reqid";
  console.log("[choices.update:start]", { reqId, network, path: req.originalUrl });
  const timeNow = new Date().valueOf();

  if (network?.startsWith("etherlink")) {
    try {
      const castedChoices = req.payloadObj;
      if (!Array.isArray(castedChoices) || castedChoices.length === 0) {
        throw new Error("No choices sent in the request");
      }
      const address = castedChoices[0].address;
      const pollId = castedChoices[0].pollID;
      // requireSignature proved the signature belongs to req.body.publicKey;
      // the choices must be cast by that same address.
      if (typeof address !== "string" || !req.verifiedAddress || address.toLowerCase() !== req.verifiedAddress) {
        throw new Error("Invalid Proposal Body, choices address does not match the signer");
      }
      if (!mongoose.isValidObjectId(pollId)) throw new Error("Invalid poll id");
      const poll = await PollModel.findById(pollId);
      if (!poll) throw new Error("Poll not found");
      if (timeNow > Number(poll.endTime)) {
        throw new Error("Proposal Already Ended");
      }
      const daoFindQuery = {};
      if (mongoose.isValidObjectId(poll.daoID)) {
        daoFindQuery._id = poll.daoID;
      } else {
        daoFindQuery.address = { $regex: new RegExp(`^${escapeRegex(poll.daoID)}$`, "i") };
      }
      const dao = await DAOModel.findOne(daoFindQuery);
      if (!dao) throw new Error(`DAO not found: ${poll.daoID}`);

      castedChoices.forEach((value) => {
        if (value.address !== address) {
          throw new Error("Invalid Proposal Body, Invalid Address in choices");
        }
        if (value.pollID !== pollId) {
          throw new Error("Invalid Proposal Body, Invalid Poll ID in choices");
        }
      });

      const block = poll.referenceBlock;
      console.log("[choices.update:eth:balance-request]", { reqId, net: dao.network || network, address, token: dao.tokenAddress, block });
      const total = await getEthUserBalanceAtLevel(dao.network || network, address, dao.tokenAddress, block);
      console.log("[choices.update:eth:balance-response]", { reqId, total: total?.toString?.() || total });
      if (total === undefined || total === null) {
        throw new Error("Could not get total power at reference block");
      }

      const addressMatch = new RegExp(`^${escapeRegex(address)}$`, "i");
      await castVote({
        reqId,
        poll,
        address,
        addressMatch,
        isSameAddress: (stored) => typeof stored === "string" && stored.toLowerCase() === address.toLowerCase(),
        total,
        choiceIds: castedChoices.map((value) => value.choiceId),
        payloadBytes,
        signature,
        payloadDate: getEthPayloadDate(payloadBytes),
        dateOf: getEthPayloadDate,
      });
      return response.json({ success: true });
    } catch (error) {
      console.error("[choices.update:eth:error]", { reqId, error: error?.message, stack: error?.stack });
      return response.status(400).send({
        message: error.message,
      });
    }
  } else {
    try {
      const values = getInputFromSigPayload(payloadBytes);
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error("No choices sent in the request");
      }
      const payloadDate = getTimestampFromPayloadBytes(payloadBytes);
      const pollID = values[0].pollID;
      if (!mongoose.isValidObjectId(pollID)) throw new Error("Invalid poll id");
      const poll = await PollModel.findById(pollID);
      if (!poll) throw new Error("Poll not found");
      if (timeNow > Number(poll.endTime)) {
        throw new Error("Proposal Already Ended");
      }

      const dao = await DAOModel.findById(poll.daoID);
      if (!dao) throw new Error("DAO not found");
      const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
      const block = poll.referenceBlock;
      const address = getPkhfromPk(publicKey);

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
        token?.tokenID,
        block,
        address,
        poll.isXTZ
      );
      console.log("[choices.update:tz:total]", { reqId, total: total?.toString?.() || total });
      if (!total) {
        throw new Error("Could not get total power at reference block");
      }

      await castVote({
        reqId,
        poll,
        address,
        addressMatch: address,
        isSameAddress: (stored) => stored === address,
        total,
        choiceIds: values.map((value) => value.choiceId),
        payloadBytes,
        signature,
        payloadDate,
        dateOf: getTimestampFromPayloadBytes,
      });
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
