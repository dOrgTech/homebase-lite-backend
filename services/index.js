const axios = require("axios");

const networkNameMap = {
  mainnet: "mainnet",
  ghostnet: "ghostnet",
};

const getTokenMetadata = async (contractAddress, network, tokenId) => {
  const url = `https://api.${networkNameMap[network]}.tzkt.io/v1/tokens?contract=${contractAddress}&tokenId=${tokenId}`;

  const response = await axios.get(url);

  if (!response.status === 201) {
    throw new Error("Failed to fetch proposals from BakingBad API");
  }

  const resultTokenDataTzkt = response.data;
  console.log("resultTokenDataTzkt: ", resultTokenDataTzkt);
  const tokenData = resultTokenDataTzkt[0];

  return tokenData;
};

module.exports = {
  getTokenMetadata,
};
