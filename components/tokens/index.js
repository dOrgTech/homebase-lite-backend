// This will help us connect to the database
const dbo = require("../../db/conn");
const { getUserTotalVotingPowerAtReferenceBlock } = require("../../utils");

const ObjectId = require("mongodb").ObjectId;

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
    let db_connect = dbo.getDb();
    const TokensCollection = db_connect.collection("Tokens");

    let daoId = { daoID: ObjectId(id) };
    const result = await TokensCollection.findOne(daoId);
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
      userAddress
    );

    response.json({ votingWeight });
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

module.exports = {
  addToken,
  getTokenById,
  getVotingPowerAtLevel,
};
