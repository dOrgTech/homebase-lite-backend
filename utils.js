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
  try {
    const url = `https://api.${network}.tzkt.io/v1/tokens?contract=${address}&tokenId=${tokenID}`;
    const response = await axios({ url, method: "GET" });

    if (response.status === 200) {
      return response.data[0].totalSupply;
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
  console.log("qweqweqweqweqwqweqw", {
    network,
    address,
    daoContract,
    tokenID,
    level,
    userAddress,
  });
  try {
    let userVotingPower = new BigNumber(0);

    const isTokenDelegation = await isTokenDelegationSupported(
      network,
      address
    );

    if (isTokenDelegation) {
      const userVotePower = await getUserTotalVotingWeightAtBlock(
        network,
        address,
        level,
        userAddress
      );
      console.log("userVotePower: ", userVotePower.toString());
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
        console.log("daoContract: ", daoContract);
        const userDAODepositBalance = await getUserDAODepositBalanceAtLevel(
          userAddress,
          network,
          daoContract,
          level
        );
        userVotingPower = userVotingPower.plus(userDAODepositBalance);
        console.log(
          "userDAODepositBalance: ",
          userDAODepositBalance.toString()
        );
      }
    }
    console.log("userVotingPower: ", userVotingPower.toString());

    return userVotingPower;
  } catch (error) {
    console.log("error: ", error);
    throw error;
  }
};

const isTokenDelegationSupported = async (network, address) => {
  const tezos = new TezosToolkit(rpcNodes[network]);
  const token = await tezos.wallet.at(address);

  const contractViews = Object.keys(token.contractViews);
  const votingPowerView = contractViews.filter(
    (view) => view === "voting_power"
  );

  if (votingPowerView) {
    return true;
  }

  return false;
};

module.exports = {
  getInputFromSigPayload,
  getTotalSupplyAtCurrentBlock,
  getCurrentBlock,
  getUserTotalVotingWeightAtBlock,
  getUserTotalVotingPowerAtReferenceBlock,
  getUserBalanceAtLevel,
};
