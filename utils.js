const { TezosToolkit } = require("@taquito/taquito");
const { bytes2Char } = require("@taquito/utils");
const axios = require("axios");
const { default: BigNumber } = require("bignumber.js");
const { rpcNodes } = require("./services");

const getInputFromSigPayload = (payloadBytes) => {
  const parsedPayloadBytesString = bytes2Char(payloadBytes);
  const valuesParsed = parsedPayloadBytesString.split(" ");
  const valuesString = valuesParsed.splice(5, valuesParsed.length).join(" ");
  const values = JSON.parse(valuesString);

  return values;
};

const getTotalSupplyAtCurrentBlock = async (network, address, tokenID) => {
  const url = `https://api.${network}.tzkt.io/v1/tokens?contract=${address}&tokenId=${tokenID}`;
  const response = await axios({ url, method: "GET" });

  if (response.status === 200) {
    return response.data[0].totalSupply;
  }
};

const getCurrentBlock = async (network) => {
  const url = `https://api.${network}.tzkt.io/v1/head`;
  const response = await axios({ url, method: "GET" });

  if (response.status === 200) {
    return response.data.level;
  }
};

const getUserTotalVotingWeightAtBlock = async (
  network,
  address,
  level,
  userAddress
) => {
  const tezos = new TezosToolkit(rpcNodes[network]);
  const token = await tezos.wallet.at(address);

  let userVotingPower = new BigNumber(0);

  userVotingPower = await token.contractViews
    .voting_power({ addr: userAddress, block_level: level })
    .executeView({
      viewCaller: userAddress,
    });

  return userVotingPower;
};

const getUserBalanceAtLevel = async (
  network,
  address,
  tokenID,
  level,
  userAddress
) => {
  const url = `https://api.${network}.tzkt.io/v1/tokens/historical_balances/${level}?account=${userAddress}&token.contract=${address}&token.tokenId=${tokenID}`;
  const response = await axios({ url, method: "GET" });
  if (response.status === 200) {
    const result = response.data;
    if (result.length > 0) {
      return new BigNumber(result[0].balance);
    } else {
      return new BigNumber(0);
    }
  }

  return new BigNumber(0);
};

const getUserXTZBalanceAtLevel = async (
  network,
  level,
  userAddress
) => {
  const url = `https://api.${network}.tzkt.io/v1/accounts/${userAddress}/balance_history/${level}`;
  const response = await axios({ url, method: "GET" });

  if (response.status === 200) {
    const result = response.data;
    if (result) {
      return new BigNumber(result);
    } else {
      return new BigNumber(0);
    }
  }

  return new BigNumber(0);
};

const getUserDAODepositBalanceAtLevel = async (
  accountAddress,
  network,
  daoAddress,
  level
) => {
  const url = `https://api.${network}.tzkt.io/v1/contracts/${daoAddress}/bigmaps/freeze_history/historical_keys/${level}?key.eq=${accountAddress}`;
  const response = await axios({ url, method: "GET" });
  if (response.status !== 200) {
    throw new Error("Failed to fetch user dao balance");
  }
  const userStakedBalances = response.data;

  let userDAODepositBalance = new BigNumber(0);
  if (userStakedBalances && userStakedBalances[0]) {
    const userStakedBalance = new BigNumber(userStakedBalances[0].value.staked);
    const userCurrentUnstakedBalance = new BigNumber(
      userStakedBalances[0].value.current_unstaked
    );
    const userPastUnstakedBalance = new BigNumber(
      userStakedBalances[0].value.past_unstaked
    );

    userDAODepositBalance = userStakedBalance
      .plus(userCurrentUnstakedBalance)
      .plus(userPastUnstakedBalance);
  }

  return userDAODepositBalance;
};

const getUserTotalVotingPowerAtReferenceBlock = async (
  network,
  address,
  daoContract,
  tokenID,
  level,
  userAddress
) => {
  let userVotingPower = new BigNumber(0);

  const isTokenDelegation = await isTokenDelegationSupported(network, address);

  if (isTokenDelegation) {
    const userVotePower = await getUserTotalVotingWeightAtBlock(
      network,
      address,
      level,
      userAddress
    );
    if (!userVotePower) {
      throw new Error("Could Not get voting weight");
    }
    userVotingPower = userVotingPower.plus(userVotePower);
  } else {
    const selfBalance = await getUserBalanceAtLevel(
      network,
      address,
      tokenID,
      level,
      userAddress
    );
    userVotingPower = userVotingPower.plus(selfBalance);

    if (daoContract) {
      const userDAODepositBalance = await getUserDAODepositBalanceAtLevel(
        userAddress,
        network,
        daoContract,
        level
      );
      userVotingPower = userVotingPower.plus(userDAODepositBalance);
    }
  }

  return userVotingPower;
};


const isTokenDelegationSupported = async (network, address) => {
  const tezos = new TezosToolkit(rpcNodes[network]);
  const token = await tezos.wallet.at(address);

  const contractViews = Object.keys(token.contractViews);
  const votingPowerView = contractViews.find((view) => view === "voting_power");

  if (votingPowerView) {
    return true;
  }

  return false;
};

const getTokenHoldersCount = async (network, address, tokenID) => {
  const url = `https://api.${network}.tzkt.io/v1/tokens?tokenId=${tokenID}&contract=${address}`;

  const response = await axios({ url, method: "GET" });
  if (response.status !== 200) {
    throw new Error("Failed to fetch user dao balance");
  }
  const result = response.data;

  return result[0].holdersCount;
};

const getTimestampFromPayloadBytes = (payloadBytes) => {
  const parsedPayloadBytesString = bytes2Char(payloadBytes);
  const valuesParsed = parsedPayloadBytesString.split(" ");

  const dateString = valuesParsed[4];
  const date = new Date(dateString).valueOf();

  return date;
};

const getIPFSProofFromPayload = (payloadBytes, signature) => {
  return bytes2Char(payloadBytes).toString().concat(
    JSON.stringify({
      signature,
      payloadBytes,
    })
  );
};

module.exports = {
  getInputFromSigPayload,
  getTotalSupplyAtCurrentBlock,
  getCurrentBlock,
  getUserTotalVotingWeightAtBlock,
  getUserTotalVotingPowerAtReferenceBlock,
  getUserBalanceAtLevel,
  getTokenHoldersCount,
  getUserXTZBalanceAtLevel,
  getTimestampFromPayloadBytes,
  getIPFSProofFromPayload,
};