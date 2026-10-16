const mongoose = require("mongoose");
const { getTokenMetadata } = require("../../services");
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getUserBalanceAtLevel,
  getTokenHoldersCount,
  getDaoGovernanceToken,
} = require("../../utils");
const {
  getEthTokenHoldersCount,
  getEthCurrentBlockNumber,
  getEthUserBalanceAtLevel,
  getEthTokenMetadata,
  getEthDaoToken,
  assertEthNetwork,
} = require("../../utils-eth");
const { assertNetwork } = require("../../services");
const { ethers } = require("ethers");
const { default: BigNumber } = require("bignumber.js");
const { sanitizeHtml, stripTags, cleanUrl } = require("../../middlewares/secure-payload");

const { getPkhfromPk, validateAddress, ValidationResult } = require("@taquito/utils");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isKT1 = (value) =>
  typeof value === "string" && value.startsWith("KT1") && validateAddress(value) === ValidationResult.VALID;

/** User-written DAO fields, neutralised before storage. */
function cleanDaoInput({ name, description, linkToTerms, picUri, requiredTokenOwnership, allowPublicAccess }) {
  const cleanName = stripTags(name).slice(0, 100);
  if (!cleanName) throw new Error("DAO name is required");
  return {
    name: cleanName,
    description: sanitizeHtml(typeof description === "string" ? description : "").slice(0, 20000),
    linkToTerms: cleanUrl(linkToTerms),
    picUri: cleanUrl(picUri, { allowIpfs: true }),
    requiredTokenOwnership: requiredTokenOwnership === true,
    allowPublicAccess: allowPublicAccess === true,
  };
}

/** Shape returned to clients: never raw HTML. */
function presentDao(dao) {
  return {
    ...dao,
    name: stripTags(dao.name),
    description: sanitizeHtml(dao.description),
    linkToTerms: cleanUrl(dao.linkToTerms),
    picUri: cleanUrl(dao.picUri, { allowIpfs: true }),
  };
}

/**
 * A lite community may claim to belong to an on-chain DAO (daoContract).
 * The claim is accepted only when that contract's governance token is the
 * token the community is being created with, and no other community has
 * claimed the contract on that network.
 */
async function assertDaoContractClaim({ network, daoContract, tokenAddress, tokenID, isEth }) {
  if (daoContract === undefined || daoContract === null || daoContract === "") return null;
  if (typeof daoContract !== "string") throw new Error("Invalid DAO contract");
  if (isEth ? !ethers.isAddress(daoContract) : !isKT1(daoContract)) {
    throw new Error("Invalid DAO contract");
  }
  const existing = await DaoModel.findOne({ network, daoContract }).lean();
  if (existing) throw new Error("A community already exists for this DAO contract");

  if (isEth) {
    const chainToken = await getEthDaoToken(network, daoContract);
    if (!chainToken || chainToken !== String(tokenAddress).toLowerCase()) {
      throw new Error("The DAO contract does not use this token");
    }
  } else {
    const governance = await getDaoGovernanceToken(network, daoContract);
    if (!governance || governance.address !== tokenAddress || governance.tokenId !== String(tokenID ?? "0")) {
      throw new Error("The DAO contract does not use this token");
    }
  }
  return daoContract;
}
const DaoModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const getAllLiteOnlyDAOs = async (req, response) => {
  const network = req.body?.network || req.query.network;

  // Implementation with Mongoose with go live with Etherlink
  if (req.method === 'GET') {
    const sortOrder = req.query.order === "asc" ? "asc" : "desc";
    const allDaos = await DaoModel.find({ network }).sort({
      _id: sortOrder
    }).lean();

    const allDaoIds = allDaos.map(dao => new mongoose.Types.ObjectId(dao._id));
    const allTokens = await TokenModel.find({ daoID: { $in: allDaoIds } }).lean();
    // console.log('All Tokens DAO', [...new Set(allTokens.map(token => token.daoID))])
    // console.log('Found Tokens',allDaoIds, allTokens.length)

    const results = allDaos.map(dao => {
      const token = allTokens.find(token => token.daoID.toString() === dao._id.toString());
      if (token) delete token._id;
      // console.log('Token', token)
      return {
        _id: dao._id,
        ...presentDao(dao),
        ...token
      }
    });

    return response.json(results);
  }

  try {
    const allDaos = await DaoModel.find({ network, daoContract: null }).lean();
    const allDaoIds = allDaos.map(dao => dao._id);
    const allTokens = await TokenModel.find({ daoID: { $in: allDaoIds } }).lean();

    const newResult = allDaos.map(dao => {
      const token = allTokens.find(token => token.daoID.toString() === dao._id.toString());
      return {
        _id: dao._id,
        ...token,
        ...presentDao(dao),
      };
    });

    response.json(newResult);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getDAOFromContractAddress = async (req, response) => {
  const { network } = req.body;
  const { daoContract } = req.params;

  try {
    const result = await DaoModel.findOne({ network, daoContract }).lean();

    if (result) {
      const token = await TokenModel.findOne({
        daoID: result._id,
      }).lean();

      const newResult = {
        _id: result._id,
        ...token,
        ...presentDao(result),
      };

      return response.json(newResult);
    }

    response.json({});
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getDAOById = async (req, response) => {
  const { id } = req.params;
  const include = req.query.include;

  try {
    const query = {};
    if (mongoose.isValidObjectId(id)) {
      query._id = new mongoose.Types.ObjectId(id);
    } else if (typeof id === "string" && /^0x[0-9a-fA-F]{40}$/.test(id)) {
      query.address = { $regex: new RegExp(`^${escapeRegex(id)}$`, "i") };
    } else {
      return response.status(404).json({ error: "DAO not found" });
    }
    const found = await DaoModel.findOne(query);
    if (!found) {
      return response.status(404).json({ error: "DAO not found" });
    }
    const daoDao = found.toObject();

    if (include === "polls") {
      const { presentPoll } = require("../polls");
      const polls = await PollModel.find({ daoID: { $regex: new RegExp(`^${escapeRegex(id)}$`, "i") } })
        .populate("choices")
        .lean();
      daoDao.polls = polls.map(presentPoll);
    }
    return response.json(presentDao(daoDao));
  } catch (error) {
    console.log("error: ", error);
    return response.status(400).send({ message: error.message });
  }
};

const updateTotalCount = async (req, response) => {
  const { id } = req.params;
  try {
    const dao = await DaoModel.findById(id);
    if (!dao) {
      throw new Error("DAO not found");
    }

    const token = await TokenModel.findOne({ tokenAddress: dao.tokenAddress });
    if (!token) {
      throw new Error("DAO Token Does not exist in system");
    }
    let count = 0;
    if (dao.network?.startsWith("etherlink")) {
      count = await getEthTokenHoldersCount(
        dao.network,
        token.tokenAddress,
      );
      console.log(`Token holder count for ${token.tokenAddress} is ${count}`)
    } else {
      count = await getTokenHoldersCount(
        dao.network,
        token.tokenAddress,
        token.tokenID
      );
    }

    const res = await DaoModel.updateOne(
      { _id: id },
      { $set: { votingAddressesCount: count } }
    );

    response.json(res);
  } catch (error) {
    console.log("error: ", error);
    response.status(500).send({
      message: "Community votingAddressesCount could not be updated  ",
    });
  }
};

const updateTotalHolders = async (req, response) => {
  try {
    const allDaos = await DaoModel.find({}).lean();

    await Promise.all(
      allDaos.map(async (item) => {
        await DaoModel.updateOne(
          { _id: item._id },
          {
            $set: {
              votingAddressesCount: item.members ? item.members.length : 0,
            },
          }
        );
      })
    );

    response.json({ success: true });
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const createDAO = async (req, response) => {
  const { payloadBytes, publicKey, } = req.body;
  const network = req.body.network

  // Creating Offchain DAO on Etherlink
  if (network && network?.startsWith("etherlink")) {
    try {
      const payload = req.payloadObj;
      if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
      const { tokenAddress, symbol: tokenSymbol, daoContract, decimals } = payload;
      const daoNetwork = assertEthNetwork(payload.network || network);
      if (!ethers.isAddress(tokenAddress)) throw new Error("Invalid token address");
      const tokenDecimals = Number(decimals);
      if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) {
        throw new Error("Invalid token decimals");
      }
      const fields = cleanDaoInput(payload);

      // requireSignature verified that publicKey signed this payload.
      const address = publicKey;

      const block = await getEthCurrentBlockNumber(daoNetwork);
      const userBalanceAtCurrentLevel = await getEthUserBalanceAtLevel(daoNetwork, address, tokenAddress, block);
      if (!userBalanceAtCurrentLevel || new BigNumber(userBalanceAtCurrentLevel.toString()).lte(0)) {
        throw new Error("User does not have balance for this DAO token");
      }

      const claimedContract = await assertDaoContractClaim({
        network: daoNetwork, daoContract, tokenAddress, isEth: true,
      });

      const ethDaoData = {
        ...fields,
        members: [address],
        polls: [],
        tokenAddress,
        tokenType: "ERC20",
        network: daoNetwork,
        daoContract: claimedContract,
        votingAddressesCount: 0,
      };

      const createdDao = await DaoModel.create(ethDaoData);
      const createdToken = await TokenModel.create({
        tokenAddress,
        tokenType: "ERC20",
        symbol: stripTags(tokenSymbol).slice(0, 20),
        daoID: createdDao._id,
        decimals: tokenDecimals,
      });

      return response.json({
        dao: createdDao,
        token: createdToken
      })
    } catch (error) {
      console.log("error: ", error);
      return response.status(400).send({
        message: error.message,
      });
    }
  }
  try {
    const values = getInputFromSigPayload(payloadBytes);
    const { tokenAddress, tokenID, daoContract } = values;
    const network = assertNetwork(values.network);
    if (!isKT1(tokenAddress)) throw new Error("Invalid token address");
    const fields = cleanDaoInput(values);

    const tokenData = await getTokenMetadata(tokenAddress, network, tokenID);
    if (!tokenData) throw new Error("Token not found");
    const address = getPkhfromPk(publicKey);

    const block = await getCurrentBlock(network);

    const userBalanceAtCurrentLevel = await getUserBalanceAtLevel(
      network,
      tokenAddress,
      tokenID,
      block,
      address
    );

    if (!userBalanceAtCurrentLevel || userBalanceAtCurrentLevel.eq(0)) {
      throw new Error("User does not have balance for this DAO token");
    }

    const claimedContract = await assertDaoContractClaim({
      network, daoContract, tokenAddress, tokenID, isEth: false,
    });

    let DAOData = {
      ...fields,
      members: [address],
      polls: [],
      tokenAddress,
      tokenType: tokenData.standard,
      network,
      daoContract: claimedContract,
      votingAddressesCount: 0,
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const createdDao = await DaoModel.create([DAOData], { session });

      await TokenModel.create([{
        tokenAddress,
        tokenType: tokenData.standard,
        symbol: tokenData.metadata.symbol,
        tokenID: Number(tokenID),
        daoID: createdDao[0]._id,
        decimals: Number(tokenData.metadata.decimals),
      }], { session });

      await session.commitTransaction();
      response.json({ dao: createdDao[0] });
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
};

const joinDAO = async (req, response) => {
  const { payloadBytes, publicKey } = req.body;

  try {
    const values = getInputFromSigPayload(payloadBytes);
    const { daoId } = values;

    const address = getPkhfromPk(publicKey);

    if (!mongoose.isValidObjectId(daoId)) throw new Error("DAO Does not exist");
    const dao = await DaoModel.findById(daoId);
    if (!dao) throw new Error("DAO Does not exist");

    if (dao.members.includes(address)) {
      // members[0] is the creator and acts as the community admin.
      if (dao.members[0] === address) {
        throw new Error("The community creator cannot leave");
      }
      dao.members = dao.members.filter(m => m !== address);
    } else {
      if (!dao.allowPublicAccess) {
        const token = await TokenModel.findOne({ daoID: dao._id }).lean();
        const block = await getCurrentBlock(dao.network);
        const balance = await getUserBalanceAtLevel(dao.network, dao.tokenAddress, token?.tokenID ?? 0, block, address);
        if (!balance || balance.eq(0)) {
          throw new Error("This community requires holding its token to join");
        }
      }
      dao.members.push(address);
    }

    await dao.save();

    response.json({ success: true });
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

module.exports = {
  getAllLiteOnlyDAOs,
  getDAOFromContractAddress,
  getDAOById,
  createDAO,
  joinDAO,
  updateTotalHolders,
  updateTotalCount,
};
