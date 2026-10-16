const axios = require("axios");
const { customAlphabet } = require("nanoid/non-secure");
const nanoid = customAlphabet('1234567890abcdef', 16)


const networkNameMap = {
  mainnet: "mainnet",
  shadownet: "shadownet",
  ghostnet: "ghostnet",
};

const rpcNodes = {
  mainnet: process.env.RPC_URL_MAINNET || "https://tcinfra.net/rpc/tezos/mainnet",
  shadownet: process.env.RPC_URL_SHADOWNET || "https://rpc.shadownet.teztnets.com",
};

// Only these Tezos networks may be used to build RPC or TzKT URLs. Network
// names reach the backend from signed payloads and URL parameters, so an
// unknown value must never become part of a hostname.
const assertNetwork = (network) => {
  if (typeof network !== "string" || !Object.prototype.hasOwnProperty.call(networkNameMap, network)) {
    throw new Error("Network is not supported");
  }
  return network;
};

// TzKT API base per network; TZKT_API_<NETWORK> overrides it (local sandbox)
const tzktApi = (network) => {
  assertNetwork(network);
  return (process.env[`TZKT_API_${network.toUpperCase()}`] || `https://api.${networkNameMap[network]}.tzkt.io`).replace(/\/$/, "");
};

const getTokenMetadata = async (contractAddress, network, tokenId) => {
  const url = `${tzktApi(network)}/v1/tokens?contract=${contractAddress}&tokenId=${tokenId ?? 0}`;

  const response = await axios.get(url);

  if (response.status > 299) {
    const errorId = nanoid()
    const responseData = response?.data
    console.log("getTokenMetadata", contractAddress, network, tokenId, responseData, response.status)
    throw new Error(`Failed to fetch proposals from BakingBad API: ${errorId}`);
  }

  const resultTokenDataTzkt = response.data;
  const tokenData = resultTokenDataTzkt[0];

  return tokenData;
};

module.exports = {
  getTokenMetadata,
  rpcNodes,
  tzktApi,
  assertNetwork,
  networkNameMap,
};
