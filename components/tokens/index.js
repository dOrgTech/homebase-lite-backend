// This will help us connect to the database
const mongoose = require("mongoose");
const mongodb = require("mongodb");
const dbo = require("../../db/conn");
const TokenModel = require("../../db/models/Token.model");
const DAOModel = require("../../db/models/Dao.model");
const { getUserTotalVotingPowerAtReferenceBlock } = require("../../utils");
const { getEthTokenMetadata } = require("../../utils-eth");

const ObjectId = mongodb.ObjectId;
const addToken = async (req, response) => {
  const { daoID, tokenID, symbol, tokenAddress } = req.body;

  try {
    let db_connect = dbo.getDb();
    const TokensCollection = db_connect.collection("Tokens");

    let data = {
      daoID,
      tokenID,
      symbol,
      tokenAddress,
    };

    await TokensCollection.insertOne(data);

    response.json(data);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getTokenById = async (req, response) => {
  const { id } = req.params;

  try {
    const result = await TokenModel.findOne({daoID: id}).lean()
    if(result.tokenType === "ERC20") {
      const linkedDao = await DAOModel.findById(result.daoID)
      const tokenMeta = await getEthTokenMetadata(linkedDao?.network, result.tokenAddress)
      if(tokenMeta) {
        result.holders = tokenMeta?.holders
      }else{
        console.log(tokenMeta, linkedDao.address, result.tokenAddress)
      }
    }
    response.json(result);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getVotingPowerAtLevel = async (req, response) => {
  const { network, address, tokenID } = req.params;
  const { userAddress, level } = req.query;

  try {
    let db_connect = dbo.getDb();

    const TokensCollection = db_connect.collection("Tokens");
    const DAOCollection = db_connect.collection("DAOs");

    let tokenAddress = { tokenAddress: address };
    const token = await TokensCollection.findOne(tokenAddress);

    if (!token) {
      throw new Error("Could not find token");
    }

    let daoId = { _id: ObjectId(token.daoID) };
    const dao = await DAOCollection.findOne(daoId);

    const daoContract = dao?.daoContract;

    const votingWeight = await getUserTotalVotingPowerAtReferenceBlock(
      network,
      address,
      daoContract,
      tokenID,
      level,
      userAddress,
      isXTZ = false
    );

    const votingXTZWeight = await getUserTotalVotingPowerAtReferenceBlock(
      network,
      address,
      daoContract,
      tokenID,
      level,
      userAddress,
      isXTZ = true
    );

    response.json({ votingWeight, votingXTZWeight });
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const getTokenByContract = async (req, response) => {
  const { network, contract } = req.query;
  const token = await getEthTokenMetadata(network, contract);
  response.json([token]);
}

module.exports = {
  addToken,
  getTokenById,
  getVotingPowerAtLevel,
  getTokenByContract
};
