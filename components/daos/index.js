const mongoose = require("mongoose");
const { getTokenMetadata } = require("../../services");
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getUserBalanceAtLevel,
  getTokenHoldersCount,
} = require("../../utils");
const {
  getEthTokenHoldersCount,
  getEthCurrentBlockNumber,
  getEthUserBalanceAtLevel,
  getEthTokenMetadata,
} = require("../../utils-eth");

const { getPkhfromPk } = require("@taquito/utils");
const DaoModel = require("../../db/models/Dao.model");
const TokenModel = require("../../db/models/Token.model");
const PollModel = require("../../db/models/Poll.model");
const getAllLiteOnlyDAOs = async (req, response) => {
  const network = req.body?.network || req.query.network;

  // Implementation with Mongoose with go live with Etherlink
  if (req.method === 'GET') {
    const sortOrder = req.query.order || "desc";
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
        ...dao,
        description: dao.description?.replace(/<[^>]*>/g, ''),
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
        ...dao,
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
        ...result,
        description: result.description?.replace(/<[^>]*>/g, ''),
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
  const include = req.query.include
  const query = {}
  if(mongoose.isValidObjectId(id)) {
    query._id = new mongoose.Types.ObjectId(id);
  } else {
    //  query.type = "onchain";
    query.address = { $regex: new RegExp(`^${id}$`, 'i') };
  }
  let daoDao =  await DaoModel.findOne(query)
  if (!daoDao) {
    return response.status(404).json({ error: 'DAO not found' });
  }
  daoDao = await daoDao.toObject()

  if(include === "polls"){
    
    console.log("Include Polls")
    const pollIds = daoDao.polls.map(poll => poll._id);
    console.log("Poll IDs", pollIds)

    const polls = await PollModel.find({ daoID: { $regex: new RegExp(`^${id}$`, 'i') } }).populate('choices').lean();
    console.log("Polls", polls)

    daoDao.polls = polls;
  }
  if (daoDao) {
    return response.json({
      ...daoDao,
      description: daoDao.description?.replace(/<[^>]*>/g, ''),
    });
  }

  try {
    const result = await DaoModel.findById(id).lean();
    response.json(result);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
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
    const payload = req.payloadObj;
    const {
      tokenAddress,
      symbol: tokenSymbol,
      network,
      name,
      description,
      linkToTerms,
      picUri,
      requiredTokenOwnership,
      allowPublicAccess,
      daoContract,
      decimals
    } = payload;

    // const tokenData = await getEthTokenMetadata(tokenAddress, network);

    const address = publicKey

    const block = await getEthCurrentBlockNumber(network);
    const userBalanceAtCurrentLevel = await getEthUserBalanceAtLevel(
      network,
      address,
      tokenAddress,
      block,
    );
    console.log({ userBalanceAtCurrentLevel })

    // if (userBalanceAtCurrentLevel.eq(0)) {
    //   throw new Error("User does not have balance for this DAO token");
    // }

    const ethDaoData = {
      name,
      description,
      linkToTerms,
      picUri,
      members: [address],
      polls: [],
      tokenAddress,
      tokenType: "ERC20",
      requiredTokenOwnership,
      allowPublicAccess,
      network,
      daoContract,
      votingAddressesCount: 0,
    };

    console.log({ ethDaoData })
    const createdDao = await DaoModel.create(ethDaoData);
    const createdToken = await TokenModel.create({
      tokenAddress,
      tokenType: "ERC20",
      symbol: tokenSymbol,
      daoID: createdDao._id,
      decimals: Number(decimals),
    });

    return response.json({
      dao: createdDao,
      token: createdToken
    })
  }
  try {
    const values = getInputFromSigPayload(payloadBytes);
    const {
      tokenAddress,
      tokenID,
      network,
      name,
      description,
      linkToTerms,
      picUri,
      requiredTokenOwnership,
      allowPublicAccess,
      daoContract,
    } = values;

    const tokenData = await getTokenMetadata(tokenAddress, network, tokenID);
    const address = getPkhfromPk(publicKey);

    let DAOData = {
      name,
      description,
      linkToTerms,
      picUri,
      members: [address],
      polls: [],
      tokenAddress,
      tokenType: tokenData.standard,
      requiredTokenOwnership,
      allowPublicAccess,
      network,
      daoContract,
      votingAddressesCount: 0,
    };

    const block = await getCurrentBlock(network);

    const userBalanceAtCurrentLevel = await getUserBalanceAtLevel(
      network,
      tokenAddress,
      tokenID,
      block,
      address
    );

    if (userBalanceAtCurrentLevel.eq(0)) {
      throw new Error("User does not have balance for this DAO token");
    }

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

    const dao = await DaoModel.findById(daoId);
    
    if (dao.members.includes(address)) {
      dao.members = dao.members.filter(m => m !== address);
    } else {
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
