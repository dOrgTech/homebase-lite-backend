const ObjectId = require("mongodb").ObjectId;

const { getTokenMetadata } = require("../../services");
const { getInputFromSigPayload } = require("../../utils");

const dbo = require("../../db/conn");

const getAllLiteOnlyDAOs = async (req, response) => {
  const { network } = req.body;

  try {
    let db_connect = dbo.getDb();

    const TokensCollection = db_connect.collection("Tokens");
    const DAOCollection = db_connect.collection("DAOs");
    const result = DAOCollection.find({ network, daoContract: null }).toArray();

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
      message: "Error retrieving the list of communities ",
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
      message: "Error retrieving the community for that DAO ",
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
      message: "Community not found ",
    });
  }
};

const createDAO = async (req, response) => {
  const { payloadBytes } = req.body;

  const values = getInputFromSigPayload(payloadBytes);
  let db_connect = dbo.getDb();

  const mongoClient = dbo.getClient();
  const session = mongoClient.startSession();

  const original_id = ObjectId();

  const tokenAddress = values.tokenAddress;
  const tokenID = values.tokenID;

  const tokenData = await getTokenMetadata(
    tokenAddress,
    values.network,
    tokenID
  );

  let DAOData = {
    name: values.name,
    description: values.description,
    linkToTerms: values.linkToTerms,
    picUri: values.picUri,
    members: values.members,
    polls: values.polls,
    tokenAddress: values.tokenAddress,
    tokenType: tokenData.standard,
    requiredTokenOwnership: values.requiredTokenOwnership,
    allowPublicAccess: values.allowPublicAccess,
    _id: original_id,
    network: values.network,
    daoContract: values?.daoContract,
  };

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
    console.warn(result);
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }
};

const joinDAO = (req, response) => {
  const { payloadBytes } = req.body;

  try {
    let db_connect = dbo.getDb();
    const DAOCollection = db_connect.collection("DAOs");
    const values = getInputFromSigPayload(payloadBytes);
    const { address, daoId } = values;

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

    DAOCollection.updateOne(id, data);

    response.json(res);
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Could not join community",
    });
  }
};

module.exports = {
  getAllLiteOnlyDAOs,
  getDAOFromContractAddress,
  getDAOById,
  createDAO,
  joinDAO,
};
