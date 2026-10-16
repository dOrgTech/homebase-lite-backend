const axios = require("axios");

const DEFAULT_INDEXER_URL = "https://v3-homebase-indexer.tezos-homebase.io/v1/graphql";

const getIndexerUrl = () => process.env.INDEXER_GRAPHQL_URL || DEFAULT_INDEXER_URL;

/**
 * Display name of an on-chain DAO, read from the indexer so that email
 * content never carries text chosen by the caller. Returns "" when the DAO
 * is unknown or the indexer does not answer in time.
 */
const resolveDaoName = async (network, daoAddress) => {
  try {
    const response = await axios.post(
      getIndexerUrl(),
      {
        query: "query DaoName($address: String!, $network: String!) { daos(where: {address: {_eq: $address}, network: {_eq: $network}}, limit: 1) { name } }",
        variables: { address: daoAddress, network },
      },
      { timeout: 3000 }
    );
    const name = response?.data?.data?.daos?.[0]?.name;
    return typeof name === "string" ? name.replace(/[\r\n\t<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  } catch (error) {
    console.warn("[resolveDaoName]", { network, daoAddress, error: error?.message });
    return "";
  }
};

module.exports = { resolveDaoName, getIndexerUrl };
