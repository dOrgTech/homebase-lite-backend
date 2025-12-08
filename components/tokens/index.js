const mongoose = require("mongoose");
const TokenModel = require("../../db/models/Token.model");
const DAOModel = require("../../db/models/Dao.model");
const { getUserTotalVotingPowerAtReferenceBlock } = require("../../utils");
const { getEthTokenMetadata, getEthUserBalanceAtLevel } = require("../../utils-eth");
const addToken = async (req, response) => {
  const { daoID, tokenID, symbol, tokenAddress } = req.body;

  try {
    const data = {
      daoID,
      tokenID,
      symbol,
      tokenAddress,
      tokenType: "FA2",
      decimals: "0"
    };

    const createdToken = await TokenModel.create(data);
    response.json(createdToken);
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

  const isEtherlink = network?.startsWith("etherlink")
  if(isEtherlink) {
    const votingWeight = await getEthUserBalanceAtLevel(network, userAddress, address, null)
    console.log("EthVotingWeight: ", votingWeight)
    return response.json({ votingWeight: votingWeight.toString(), votingXTZWeight: 0 })
  }

  try {
    const token = await TokenModel.findOne({ tokenAddress: address });

    if (!token) {
      throw new Error("Could not find token");
    }

    const dao = await DAOModel.findById(token.daoID);

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
