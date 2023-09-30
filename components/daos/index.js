const ObjectId = require("mongodb").ObjectId;

const { getTokenMetadata } = require("../../services");
const {
  getInputFromSigPayload,
  getCurrentBlock,
  getUserBalanceAtLevel,
} = require("../../utils");

const dbo = require("../../db/conn");
const { response } = require("express");
const { getPkhfromPk } = require("@taquito/utils");

const getAllLiteOnlyDAOs = async (req, response) => {
  const { network } = req.body;

  try {
    let db_connect = dbo.getDb();

    const TokensCollection = db_connect.collection("Tokens");
    const DAOCollection = db_connect.collection("DAOs");
    const result = await DAOCollection.find({
      network,
      daoContract: null,
    }).toArray();

    const newResult = await Promise.all(
      result.map(async (result) => {
        const token = await TokensCollection.findOne({
          daoID: result._id,
        });

        return {
          _id: result._id,
          ...token,
          ...result,
        };
      })
    );

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
    let db_connect = dbo.getDb();

    const TokensCollection = db_connect.collection("Tokens");
    const DAOCollection = db_connect.collection("DAOs");

    const result = await DAOCollection.findOne({ network, daoContract });

    if (result) {
      const token = await TokensCollection.findOne({
        daoID: result.id,
      });

      const newResult = {
        _id: result._id,
        ...token,
        ...result,
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

  try {
    let db_connect = dbo.getDb();
    const DAOCollection = db_connect.collection("DAOs");
    let daoId = { _id: ObjectId(id) };
    const result = await DAOCollection.findOne(daoId);

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
  const { count } = req.body;
  try {
    let db_connect = dbo.getDb();
    let data = {
      $set: {
        votingAddressesCount: count,
      },
    };
    let communityId = { _id: ObjectId(id) };
    const res = await db_connect
      .collection("DAOs")
      .updateOne(communityId, data, { upsert: true });

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
    let db_connect = dbo.getDb();
    const DAOCollection = db_connect.collection("DAOs");

    const result = await DAOCollection.find({}).forEach(function (item) {
      DAOCollection.updateOne(
        { _id: ObjectId(item._id) },
        {
          $set: {
            votingAddressesCount: item.members ? item.members.length : 0,
          },
        }
      );
    });
    response.json(result);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: error.message,
    });
  }
};

const createDAO = async (req, response) => {
  const { payloadBytes, publicKey } = req.body;

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

    let db_connect = dbo.getDb();

    const mongoClient = dbo.getClient();
    const session = mongoClient.startSession();

    const original_id = ObjectId();

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
      _id: original_id,
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

    try {
      await session
        .withTransaction(async () => {
          const DAOCollection = db_connect.collection("DAOs");
          const TokenCollection = db_connect.collection("Tokens");
          // Important:: You must pass the session to the operations
          await DAOCollection.insertOne(DAOData, { session });

          await TokenCollection.insertOne(
            {
              tokenAddress,
              tokenType: tokenData.standard,
              symbol: tokenData.metadata.symbol,
              tokenID: Number(tokenID),
              daoID: original_id,
              decimals: Number(tokenData.metadata.decimals),
            },
            { session }
          );
        })
        .then((res) => response.json(res));
    } catch (e) {
      result = e.Message;
      console.log(e);
      await session.abortTransaction();
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
    let db_connect = dbo.getDb();
    const DAOCollection = db_connect.collection("DAOs");
    const values = getInputFromSigPayload(payloadBytes);
    const { daoId } = values;

    const address = getPkhfromPk(publicKey);

    let id = { _id: ObjectId(daoId) };
    let data = [
      {
        $set: {
          members: {
            $cond: [
              {
                $in: [address, "$members"],
              },
              {
                $setDifference: ["$members", [address]],
              },
              {
                $concatArrays: ["$members", [address]],
              },
            ],
          },
        },
      },
    ];

    await DAOCollection.updateOne(id, data);

    response.json(res);
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
