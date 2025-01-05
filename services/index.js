const axios = require("axios");
const { customAlphabet } = require("nanoid/non-secure");
const nanoid = customAlphabet('1234567890abcdef', 16)


const networkNameMap = {
  mainnet: "mainnet",
  ghostnet: "ghostnet",
};

const rpcNodes = {
  mainnet: "https://mainnet.api.tez.ie",
  ghostnet: "https://ghostnet.smartpy.io",
};

const getTokenMetadata = async (contractAddress, network, tokenId) => {
  const url = `https://api.${networkNameMap[network]}.tzkt.io/v1/tokens?contract=${contractAddress}&tokenId=${tokenId ?? 0}`;

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
