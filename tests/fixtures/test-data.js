const mongoose = require('mongoose');
const { char2Bytes } = require('@taquito/utils');

const createTestDAO = (overrides = {}) => ({
  name: 'Test DAO',
  description: 'A test DAO for testing purposes',
  linkToTerms: 'https://example.com/terms',
  picUri: 'ipfs://testimage',
  members: ['tz1TestUser1', 'tz1TestUser2'],
  polls: [],
  tokenAddress: 'KT1TestTokenContract',
  tokenType: 'fa2',
  requiredTokenOwnership: true,
  allowPublicAccess: true,
  network: 'ghostnet',
  votingAddressesCount: 2,
  daoContract: null,
  ...overrides
});

const createTestEtherlinkDAO = (overrides = {}) => ({
  name: 'Etherlink Test DAO',
  description: 'An Etherlink test DAO',
  linkToTerms: 'https://example.com/terms',
  picUri: 'ipfs://testimage',
  members: ['0xTestUser1', '0xTestUser2'],
  polls: [],
  tokenAddress: '0xTestTokenContract',
  tokenType: 'ERC20',
  requiredTokenOwnership: true,
  allowPublicAccess: true,
  network: 'etherlink-testnet',
  votingAddressesCount: 2,
  daoContract: null,
  ...overrides
});

const createTestToken = (daoId, overrides = {}) => ({
  tokenAddress: 'KT1TestTokenContract',
  tokenType: 'fa2',
  symbol: 'TEST',
  tokenID: 0,
  daoID: daoId,
  decimals: '6',
  ...overrides
});

const createTestPoll = (daoId, overrides = {}) => ({
  name: 'Test Poll',
  description: 'A test poll for testing',
  daoID: daoId.toString(),
  startTime: Date.now().toString(),
  endTime: (Date.now() + 7 * 24 * 60 * 60 * 1000).toString(),
  referenceBlock: '5000000',
  totalSupplyAtReferenceBlock: '1000000',
  externalLink: 'https://example.com/poll',
  author: 'tz1TestUser1',
  votingStrategy: 0,
  isXTZ: false,
  payloadBytes: 'test_payload_bytes',
  payloadBytesHash: 'test_hash',
  signature: 'test_signature',
  cidLink: '',
  choices: [],
  ...overrides
});

const createTestChoice = (pollId, overrides = {}) => ({
  name: 'Choice 1',
  pollID: pollId,
  walletAddresses: [],
  ...overrides
});

const createTestVote = (address, balance = '100000', overrides = {}) => ({
  address,
  balanceAtReferenceBlock: balance,
  choiceId: null,
  payloadBytes: 'vote_payload',
  signature: 'vote_signature',
  ...overrides
});

const createValidTezosPayload = (data) => {
  const timestamp = new Date().toISOString();
  const payloadString = `Tezos Signed Message: homebase.com ${timestamp} ${JSON.stringify(data)}`;
  return char2Bytes(payloadString);
};

const createDAOPayload = (network = 'ghostnet') => {
  const data = {
    tokenAddress: 'KT1TestTokenContract',
    tokenID: '0',
    network,
    name: 'Test DAO',
    description: 'A test DAO',
    linkToTerms: 'https://example.com/terms',
    picUri: 'ipfs://test',
    requiredTokenOwnership: true,
    allowPublicAccess: true,
    daoContract: null
  };
  return {
    payloadBytes: createValidTezosPayload(data),
    publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav'
  };
};

const createEtherlinkDAOPayload = () => ({
  network: 'etherlink-testnet',
  tokenAddress: '0xTestTokenContract',
  symbol: 'ETT',
  name: 'Etherlink Test DAO',
  description: 'An Etherlink test DAO',
  linkToTerms: 'https://example.com/terms',
  picUri: 'ipfs://test',
  requiredTokenOwnership: true,
  allowPublicAccess: true,
  daoContract: null,
  decimals: '18',
  publicKey: '0xTestPublicKey'
});

const createPollPayload = (daoId, choices = ['Yes', 'No']) => {
  const data = {
    daoID: daoId.toString(),
    name: 'Test Poll',
    description: 'A test poll',
    externalLink: 'https://example.com/poll',
    endTime: (Date.now() + 7 * 24 * 60 * 60 * 1000).toString(),
    votingStrategy: 0,
    isXTZ: false,
    choices
  };
  return {
    payloadBytes: createValidTezosPayload(data),
    publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav',
    signature: 'test_signature'
  };
};

const createVotePayload = (pollId, choiceId, address = 'tz1TestUser1') => {
  const data = [{
    pollID: pollId.toString(),
    choiceId: choiceId.toString(),
    address
  }];
  return {
    payloadBytes: createValidTezosPayload(data),
    publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav',
    signature: 'test_signature'
  };
};

const createMultiVotePayload = (pollId, choiceIds, address = 'tz1TestUser1') => {
  const data = choiceIds.map(choiceId => ({
    pollID: pollId.toString(),
    choiceId: choiceId.toString(),
    address
  }));
  return {
    payloadBytes: createValidTezosPayload(data),
    publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav',
    signature: 'test_signature'
  };
};

module.exports = {
  createTestDAO,
  createTestEtherlinkDAO,
  createTestToken,
  createTestPoll,
  createTestChoice,
  createTestVote,
  createValidTezosPayload,
  createDAOPayload,
  createEtherlinkDAOPayload,
  createPollPayload,
  createVotePayload,
  createMultiVotePayload
};

