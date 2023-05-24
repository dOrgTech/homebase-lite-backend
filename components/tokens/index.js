// This will help us connect to the database
const dbo = require("../../db/conn");

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
      message: "Error saving token",
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
      message: "Error retrieving community token",
    });
  }
};

module.exports = {
  addToken,
  getTokenById,
};
