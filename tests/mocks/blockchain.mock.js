const { char2Bytes } = require('@taquito/utils');

const mockTzktResponses = {
  getCurrentBlock: (network = 'ghostnet') => ({
    level: 5000000,
    hash: 'BMXXfh6YfX3wP8wd8c8d8c8d8c8d8c8d8c8d8c8d8c8d8c8d',
    timestamp: new Date().toISOString(),
    protocol: 'PtNairobiyssHuh87hEhfVBGCVrK3WnS8Z2FT4ymB5tAa4r1nQf'
  }),

  getTokenMetadata: (address, tokenId = 0) => ([{
    contract: { address },
    tokenId: tokenId.toString(),
    standard: 'fa2',
    totalSupply: '1000000',
    holdersCount: 3,
    metadata: {
      name: 'Test Token',
      symbol: 'TEST',
      decimals: '6',
      thumbnailUri: 'ipfs://test'
    }
  }]),

  getTokenHolders: (address, tokenId = 0) => ({
    items: [
      { address: 'tz1TestAddress1', balance: '500000' },
      { address: 'tz1TestAddress2', balance: '300000' },
      { address: 'tz1TestAddress3', balance: '200000' }
    ],
    total: 3
  }),

  getUserBalance: (userAddress, tokenAddress, tokenId, level) => ({
    balance: '100000',
    account: { address: userAddress },
    token: { contract: { address: tokenAddress }, tokenId: tokenId.toString() }
  }),

  getContractStorage: (address) => ({
    address,
    storage: {
      ledger: {},
      operators: {},
      metadata: {},
      token_metadata: {}
    }
  })
};

const mockEtherlinkResponses = {
  getCurrentBlock: () => ({
    data: {
      height: '1000000',
      timestamp: new Date().toISOString()
    }
  }),

  getTokenMetadata: (address) => ({
    name: 'Etherlink Test Token',
    symbol: 'ETT',
    decimals: '18',
    total_supply: '1000000000000000000000000',
    holders: '100',
    type: 'ERC-20'
  }),

  getTokenHolders: (address) => ({
    items: [
      { address: { hash: '0xTestAddress1' }, value: '500000000000000000000' },
      { address: { hash: '0xTestAddress2' }, value: '300000000000000000000' },
      { address: { hash: '0xTestAddress3' }, value: '200000000000000000000' }
    ],
    next_page_params: null
  })
};

const setupTzktMocks = (axiosMock, network = 'ghostnet') => {
  axiosMock
    .onGet(new RegExp(`https://api\\.${network}\\.tzkt\\.io/v1/head`))
    .reply(200, mockTzktResponses.getCurrentBlock(network));

  axiosMock
    .onGet(new RegExp(`https://api\\.${network}\\.tzkt\\.io/v1/tokens\\?`))
    .reply(200, mockTzktResponses.getTokenMetadata('KT1TestContract', 0));

  axiosMock
    .onGet(/historical_balances/)
    .reply(200, [mockTzktResponses.getUserBalance('tz1TestUser', 'KT1TestContract', 0, 5000000)]);

  axiosMock
    .onGet(new RegExp(`https://api\\.${network}\\.tzkt\\.io/v1/tokens/balances`))
    .reply(200, [mockTzktResponses.getUserBalance('tz1TestUser', 'KT1TestContract', 0, 5000000)]);

  axiosMock
    .onGet(new RegExp(`https://api\\.${network}\\.tzkt\\.io/v1/contracts/.*/storage`))
    .reply(200, mockTzktResponses.getContractStorage('KT1TestContract'));
};

const setupEtherlinkMocks = (axiosMock, network = 'etherlink-testnet') => {
  axiosMock
    .onGet(new RegExp(`https://${network}\\.explorer\\.etherlink\\.com/api/v2/blocks`))
    .reply(200, mockEtherlinkResponses.getCurrentBlock());

  axiosMock
    .onGet(new RegExp(`https://${network}\\.explorer\\.etherlink\\.com/api/v2/tokens/0x.*`))
    .reply(200, mockEtherlinkResponses.getTokenMetadata('0xTestToken'));

  axiosMock
    .onGet(new RegExp(`https://${network}\\.explorer\\.etherlink\\.com/api/v2/tokens/0x.*/holders`))
    .reply(200, mockEtherlinkResponses.getTokenHolders('0xTestToken'));
};

const mockTaquitoToolkit = () => {
  return {
    contract: {
      at: jest.fn().mockResolvedValue({
        storage: jest.fn().mockResolvedValue({
          ledger: {
            get: jest.fn().mockResolvedValue({ balance: '100000' })
          }
        }),
        views: {
          get_balance: jest.fn().mockResolvedValue('100000')
        }
      })
    },
    tz: {
      getBalance: jest.fn().mockResolvedValue('1000000')
    }
  };
};

const mockEthersProvider = () => {
  return {
    getBlockNumber: jest.fn().mockResolvedValue(1000000),
    getBlock: jest.fn().mockResolvedValue({
      number: 1000000,
      timestamp: Math.floor(Date.now() / 1000)
    })
  };
};

const mockERC20Contract = () => {
  return {
    totalSupply: jest.fn().mockResolvedValue('1000000000000000000000000'),
    balanceOf: jest.fn().mockResolvedValue('100000000000000000000'),
    decimals: jest.fn().mockResolvedValue(18),
    symbol: jest.fn().mockResolvedValue('ETT'),
    name: jest.fn().mockResolvedValue('Etherlink Test Token')
  };
};

const createValidSignaturePayload = (data) => {
  const timestamp = new Date().toISOString();
  const payloadString = `Tezos Signed Message: homebase.com ${timestamp} ${JSON.stringify(data)}`;
  return char2Bytes(payloadString);
};

module.exports = {
  mockTzktResponses,
  mockEtherlinkResponses,
  setupTzktMocks,
  setupEtherlinkMocks,
  mockTaquitoToolkit,
  mockEthersProvider,
  mockERC20Contract,
  createValidSignaturePayload
};

