const { bytes2Char } = require("@taquito/utils");
const axios = require("axios");
const { default: BigNumber } = require("bignumber.js");

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

const getUserTotalSupplyAtReferenceBlock = async (
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
      return result[0].balance;
    } else {
      return 0;
    }
  }

  return 0;
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

  if (userStakedBalances && userStakedBalances[0]) {
    const userStakedBalance = new BigNumber(userStakedBalances[0].value.staked);
    const userCurrentUnstakedBalance = new BigNumber(
      userStakedBalances[0].value.current_unstaked
    );
    const userPastUnstakedBalance = new BigNumber(
      userStakedBalances[0].value.past_unstaked
    );

    const userDAODepositBalance = userStakedBalance
      .plus(userCurrentUnstakedBalance)
      .plus(userPastUnstakedBalance);
    return userDAODepositBalance.toString();
  }
};

const getUserTotalVotingPowerAtReferenceBlock = async (
  network,
  address,
  daoContract,
  tokenID,
  level,
  userAddress
) => {
  try {
    let userVotingPower = new BigNumber(0);

    const urlIsDelegating = `https://api.${network}.tzkt.io/v1/contracts/${address}/bigmaps/delegates/historical_keys/${level}?key.eq=${userAddress}&value.ne=${userAddress}&active=true`;
    const responseIsDelegating = await axios({
      url: urlIsDelegating,
      method: "GET",
    });
    if (responseIsDelegating.status !== 200) {
      throw new Error("User Delegating to someone else");
    }

    if (responseIsDelegating.data.length !== 0) {
      return BigNumber(0);
    }

    const selfBalance = await getUserTotalSupplyAtReferenceBlock(
      network,
      address,
      tokenID,
      level,
      userAddress
    );

    const userDAODepositBalance = await getUserDAODepositBalanceAtLevel(
      userAddress,
      network,
      daoContract,
      level
    );

    let totalVoteWeight = new BigNumber(0);
    const url = `https://api.${network}.tzkt.io/v1/contracts/${address}/bigmaps/delegates/historical_keys/${level}?value.eq=${userAddress}&active=true`;
    const response = await axios({ url, method: "GET" });

    if (response.status !== 200) {
      throw new Error("Failed to fetch token delegations from TZKT API");
    }

    if (response.data.length > 0) {
      const resultingDelegations = response.data;

      const delegatedAddressBalances = [];

      await Promise.all(
        resultingDelegations.map(async (del) => {
          if (del.key === del.value) {
            return;
          }
          const balance = await getUserTotalSupplyAtReferenceBlock(
            network,
            address,
            tokenID,
            level,
            del.key
          );
          const userDAODepositBalance = await getUserDAODepositBalanceAtLevel(
            del.key,
            network,
            daoContract,
            level
          );
          if (balance) {
            const userTotalBalance = new BigNumber(0);

            if (balance) {
              userTotalBalance = userTotalBalance.plus(balance);
            }
            if (userDAODepositBalance) {
              userTotalBalance = userTotalBalance.plus(userDAODepositBalance);
            }

            delegatedAddressBalances.push({
              address: del.key,
              balance: userTotalBalance.toString(),
            });
          }
        })
      );

      delegatedAddressBalances.forEach((delegatedVote) => {
        const balance = new BigNumber(delegatedVote.balance);
        totalVoteWeight = totalVoteWeight.plus(balance);
      });
    }

    if (selfBalance) {
      userVotingPower = userVotingPower.plus(selfBalance);
    }
    if (totalVoteWeight) {
      userVotingPower = userVotingPower.plus(totalVoteWeight);
    }
    if (userDAODepositBalance) {
      userVotingPower = userVotingPower.plus(userDAODepositBalance);
    }

    return userVotingPower;
  } catch (error) {
    console.log("error: ", error);
    throw new Error("User Delegating to someone else");
  }
};

module.exports = {
  getInputFromSigPayload,
  getTotalSupplyAtCurrentBlock,
  getCurrentBlock,
  getUserTotalSupplyAtReferenceBlock,
  getUserTotalVotingPowerAtReferenceBlock,
};
