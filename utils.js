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
    const userDAODepositBalance = await getUserDAODepositBalanceAtLevel(
      userAddress,
      network,
      daoContract,
      level
    );
    console.log("userDAODepositBalance: ", userDAODepositBalance);

    const urlIsDelegating = `https://api.${network}.tzkt.io/v1/contracts/${address}/bigmaps/delegates/historical_keys/${level}?key.eq=${userAddress}&value.ne=${userAddress}&active=true`;
    console.log("urlIsDelegating: ", urlIsDelegating);
    const responseIsDelegating = await axios({
      url: urlIsDelegating,
      method: "GET",
    });
    console.log("responseIsDelegating.data: ", responseIsDelegating.data);
    if (
      responseIsDelegating.status !== 200 ||
      responseIsDelegating.data.length !== 0
    ) {
      throw new Error("User Delegating to someone else");
    }

    const url = `https://api.${network}.tzkt.io/v1/contracts/${address}/bigmaps/delegates/historical_keys/${level}?value.eq=${userAddress}&active=true`;
    console.log("url: ", url);
    const response = await axios({ url, method: "GET" });
    console.log("response: ", response.status);

    if (response.status !== 200) {
      throw new Error("Failed to fetch token delegations from TZKT API");
    }

    if (response.data.length > 0) {
      const resultingDelegations = response.data;

      const delegatedAddressBalances = [];

      await Promise.all(
        resultingDelegations.map(async (del) => {
          const balance = await getUserTotalSupplyAtReferenceBlock(
            network,
            address,
            tokenID,
            level,
            del.key
          );
          if (balance) {
            delegatedAddressBalances.push({
              address: del.key,
              balance: balance,
            });
          }
        })
      );
      console.log("delegatedAddressBalances: ", delegatedAddressBalances);

      let totalVoteWeight = new BigNumber(0);

      delegatedAddressBalances.forEach((delegatedVote) => {
        const balance = new BigNumber(delegatedVote.balance);
        totalVoteWeight = totalVoteWeight.plus(balance);
      });

      return totalVoteWeight.plus(
        new BigNumber(userDAODepositBalance ? userDAODepositBalance : 0)
      );
    } else {
      const selfBalance = await getUserTotalSupplyAtReferenceBlock(
        network,
        address,
        tokenID,
        level,
        userAddress
      );
      console.log("selfBalance: ", selfBalance);

      if (!selfBalance) {
        throw new Error(
          "Could not fetch delegate token balance from the TZKT API"
        );
      }

      return new BigNumber(selfBalance).plus(
        new BigNumber(userDAODepositBalance ? userDAODepositBalance : 0)
      );
    }
  } catch (error) {
    console.log("error: ", error);
    throw error;
  }
};

module.exports = {
  getInputFromSigPayload,
  getTotalSupplyAtCurrentBlock,
  getCurrentBlock,
  getUserTotalSupplyAtReferenceBlock,
  getUserTotalVotingPowerAtReferenceBlock,
};
