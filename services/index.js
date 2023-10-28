const axios = require("axios");
const { Web3Storage, File } = require("web3.storage");

const networkNameMap = {
  mainnet: "mainnet",
  ghostnet: "ghostnet",
};

const rpcNodes = {
  mainnet: "https://mainnet.api.tez.ie",
  ghostnet: "https://ghostnet.tezos.marigold.dev",
};

const getTokenMetadata = async (contractAddress, network, tokenId) => {
  const url = `https://api.${networkNameMap[network]}.tzkt.io/v1/tokens?contract=${contractAddress}&tokenId=${tokenId}`;

  const response = await axios.get(url);

  if (!response.status === 201) {
    throw new Error("Failed to fetch proposals from BakingBad API");
  }

  const resultTokenDataTzkt = response.data;
  const tokenData = resultTokenDataTzkt[0];

  return tokenData;
};

const uploadToIPFS = async (data) => {
  const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweDY3OTA3MmRBNmQxODFCQjFkZTgwRjMwMzBhYzUyN0UwMjA5Njk1OWIiLCJpc3MiOiJ3ZWIzLXN0b3JhZ2UiLCJpYXQiOjE2OTg1MDQwMjEzMzIsIm5hbWUiOiJkb3JnIn0.kU3WwofW32LW83JM0smVIoM4ebmhVV_RtC5LWiEI8oc`;
  const client = new Web3Storage({ token });

  const files = [new File([Buffer.from(data)], "proof.json")];

  const cid = await client.put(files);

  return cid;
};

module.exports = {
  getTokenMetadata,
  rpcNodes,
  uploadToIPFS,
};
