const axios = require("axios");
const { customAlphabet } = require("nanoid/non-secure");
const nanoid = customAlphabet('1234567890abcdef', 16)


const networkNameMap = {
  mainnet: "mainnet",
  shadownet: "shadownet",
};

const rpcNodes = {
  mainnet: process.env.RPC_URL_MAINNET || "https://tcinfra.net/rpc/tezos/mainnet",
  shadownet: process.env.RPC_URL_SHADOWNET || "https://rpc.shadownet.teztnets.com",
};

// TzKT API base per network; TZKT_API_<NETWORK> overrides it (local sandbox)
const tzktApi = (network) =>
  (process.env[`TZKT_API_${String(network).toUpperCase()}`] || `https://api.${networkNameMap[network] || "mainnet"}.tzkt.io`).replace(/\/$/, "");

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
};
