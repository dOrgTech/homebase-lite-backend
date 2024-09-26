const { default: BigNumber } = require('bignumber.js');
const { ethers, JsonRpcProvider } = require('ethers');

const tokenAbiForErc20 = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "approve",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "initialSupply",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "allowance",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "needed",
                "type": "uint256"
            }
        ],
        "name": "ERC20InsufficientAllowance",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "sender",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "balance",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "needed",
                "type": "uint256"
            }
        ],
        "name": "ERC20InsufficientBalance",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "approver",
                "type": "address"
            }
        ],
        "name": "ERC20InvalidApprover",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "receiver",
                "type": "address"
            }
        ],
        "name": "ERC20InvalidReceiver",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "sender",
                "type": "address"
            }
        ],
        "name": "ERC20InvalidSender",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "name": "ERC20InvalidSpender",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "spender",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Approval",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transfer",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "from",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "value",
                "type": "uint256"
            }
        ],
        "name": "transferFrom",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "spender",
                "type": "address"
            }
        ],
        "name": "allowance",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [
            {
                "internalType": "uint8",
                "name": "",
                "type": "uint8"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "name",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [
            {
                "internalType": "string",
                "name": "",
                "type": "string"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

function _getEthProvider(network) {
    const rpcEndpoint = network.includes("test") ? "https://node.ghostnet.etherlink.com" : "https://node.mainnet.etherlink.com";
    return new JsonRpcProvider(rpcEndpoint);
}

function _getEthRestEndpoint(network) {
    const rpcEndpoint = network.includes("test") ? "https://testnet.explorer.etherlink.com/api/v2" : "https://node.mainnet.etherlink.com";
    return rpcEndpoint;
}

async function _getEthTokenMetadataWithRpc(network, tokenAddress) {
    const provider = _getEthProvider(network);
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbiForErc20, provider);
    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    const name = await tokenContract.name();
    const totalSupply = await tokenContract.totalSupply();
    return {
        name,
        decimals: Number(decimals),
        symbol,
        totalSupply: BigNumber(totalSupply).toString(),
    };
}

async function _getEthTokenMetadataWithRest(network, tokenAddress) {
    const url = _getEthRestEndpoint(network)
    const response = await fetch(`${url}/tokens/${tokenAddress}`)
    const data = await response.json()
    return {
        name: data?.name,
        decimals: data?.decimals,
        symbol: data?.symbol,
        totalSupply: data?.total_supply,
        holders: data?.holders,
    }
}
// ⚠️ To be Implemented
function verityEthSignture(signature, payloadBytes) {

    return true;
    try {
        const values = ethers.utils.recoverMessage(payloadBytes, signature);

        // // Convert the payload bytes to a string
        // const payloadString = ethers.utils.toUtf8String(payloadBytes);

        // // Split the string into parts
        // const parts = payloadString.split(' ');

        // // Extract the JSON part (assuming it's the last part)
        // const jsonString = parts.slice(5).join(' ');

        // // Parse the JSON string
        // const values = JSON.parse(jsonString);

        return values;

    } catch (error) {

        console.error('Error parsing Ethereum signature payload:', error);
        throw new Error('Invalid Ethereum signature payload');

    }
}

// ✅ Working
async function getEthTokenMetadata(network, tokenAddress) {
    return await _getEthTokenMetadataWithRest(network, tokenAddress)
}

// ✅ Working
async function getEthCurrentBlock(network) {
    const provider = _getEthProvider(network);
    const block = await provider.getBlock('latest');
    return block.number;
}

// ✅ Working
async function getEthUserBalanceAtLevel(network, walletAddress, tokenAddress, block = 0) {
    if (!block) block = await getEthCurrentBlock(network);
    const provider = _getEthProvider(network);
    console.log({ network, walletAddress, tokenAddress, block })
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbiForErc20, provider);
    const balance = await tokenContract.balanceOf(walletAddress, { blockTag: block });
    return balance;
}

async function getEthTotalSupply(network, tokenAddress, block = 0) {
    if (!block) block = await getEthCurrentBlock(network);
    const provider = _getEthProvider(network);
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbiForErc20, provider);
    const totalSupply = await tokenContract.totalSupply({ blockTag: block });
    return totalSupply;
}

// This won't work efficiently for large block ranges, Indexer needs to be used for this
async function getEthTokenHoldersCount(network, tokenAddress, block = 0) {
    if (!block) block = await getEthCurrentBlock(network);
    const provider = _getEthProvider(network);
    const contract = new ethers.Contract(tokenAddress, tokenAbiForErc20, provider);

    const latestBlock = await provider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - 999);  // Ensure we don't go below block 0
    const holders = new Set();

    console.log(`Querying blocks ${startBlock} to ${latestBlock}`);

    const filter = contract.filters.Transfer();
    const events = await contract.queryFilter(filter, startBlock, latestBlock);

    for (let event of events) {
        const { from, to } = event.args;
        holders.add(from);
        holders.add(to);
    }

    // Remove zero-balance holders
    for (let holder of holders) {
        const balance = await contract.balanceOf(holder);
        if (balance.eq(0)) {
            holders.delete(holder);
        }
    }

    return holders.size;
}

// getEthTokenMetadata("etherlink_testnet", "0x336bfd0356f6babec084f9120901c0296db1967e").then(console.log)

// getEthTokenHoldersCount("etherlink_testnet","0x336bfd0356f6babec084f9120901c0296db1967e").then(console.log)

// ✅ Working
// getEthTotalSupply("sepoplia","0x336bfd0356f6babec084f9120901c0296db1967e").then((x)=>console.log("Total Suplpy",x))


// ✅ Working
// getEthUserBalanceAtLevel("sepoplia","0xA0E9D286a88C544C8b474275de4d1b8D97C2a81a","0x336bfd0356f6babec084f9120901c0296db1967e").then(console.log)


// ✅ Working
// getEthCurrentBlock("etherlink_testnet").then(console.log)

console.log("from ETH")

module.exports = {
    verityEthSignture,
    getEthTokenMetadata,
    getEthCurrentBlock,
    getEthUserBalanceAtLevel,
    getEthTotalSupply,
    getEthTokenHoldersCount,
}