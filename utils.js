const { bytes2Char } = require("@taquito/utils");
const axios = require("axios");

const getInputFromSigPayload = (payloadBytes) => {
  const parsedPayloadBytesString = bytes2Char(payloadBytes);
  const valuesString = parsedPayloadBytesString.split(" ").slice(-1)[0];
  const values = JSON.parse(valuesString);

  return values;
};

const getTotalSupplyAtReferenceBlock = async (network, address, level) => {
  try {
    const url = `https://api.${network}.tzkt.io/v1/contracts/${address}/bigmaps/token_total_supply/historical_keys/${level}`;
    const response = await axios({ url, method: "GET" });

    if (response.status === 200) {
      return response.data[0].value;
    }
  } catch (error) {
    console.log("error: ", error);
  }
};

const getCurrentBlock = async (network) => {
  try {
    const url = `https://api.${network}.tzkt.io/v1/head`;
    const response = await axios({ url, method: "GET" });

    if (response.status === 200) {
      return response.data.level;
    }
  } catch (error) {
    console.log("error: ", error);
  }
};

const getUserTotalSupplyAtReferenceBlock = async (
  network,
  address,
  level,
  userAddress
) => {
  const url = `https://api.${network}.tzkt.io/v1/tokens/historical_balances/${level}?account=${userAddress}&token.contract=${address}`;
  const response = await axios({ url, method: "GET" });
  if (response.status === 200) {
    const result = response.data;
    return result[0].balance;
  }

  return 0;
};

module.exports = {
  getInputFromSigPayload,
  getTotalSupplyAtReferenceBlock,
  getCurrentBlock,
  getUserTotalSupplyAtReferenceBlock,
};
