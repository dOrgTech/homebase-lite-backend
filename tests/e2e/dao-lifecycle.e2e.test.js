const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../server');
const DaoModel = require('../../db/models/Dao.model');
const PollModel = require('../../db/models/Poll.model');
const ChoiceModel = require('../../db/models/Choice.model');
const TokenModel = require('../../db/models/Token.model');
const { setupTzktMocks, setupEtherlinkMocks } = require('../mocks/blockchain.mock');

describe('E2E: Complete DAO Lifecycle', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await DaoModel.deleteMany({});
    await PollModel.deleteMany({});
    await ChoiceModel.deleteMany({});
    await TokenModel.deleteMany({});
    setupTzktMocks(global.axiosMock, 'ghostnet');
    setupEtherlinkMocks(global.axiosMock, 'etherlink-testnet');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Etherlink Lite DAO Lifecycle', () => {
    it('should complete full DAO lifecycle from creation to voting', async () => {
      const createDaoPayload = {
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken',
        symbol: 'ETT',
        name: 'Test DAO',
        description: 'A test DAO',
        linkToTerms: 'https://example.com/terms',
        picUri: 'ipfs://test',
        requiredTokenOwnership: true,
        allowPublicAccess: true,
        daoContract: null,
        decimals: '18',
        publicKey: '0xUser1'
      };

      const createDaoRes = await request(app)
        .post('/dao/add')
        .send(createDaoPayload)
        .expect(200);

      expect(createDaoRes.body).toHaveProperty('dao');
      expect(createDaoRes.body).toHaveProperty('token');
      const daoId = createDaoRes.body.dao._id;

      await global.testUtils.wait(100);

      const createPollPayload = {
        network: 'etherlink-testnet',
        daoID: daoId.toString(),
        name: 'Should we proceed?',
        description: 'A test proposal',
        externalLink: '',
        endTime: (Date.now() + 86400000).toString(),
        votingStrategy: 0,
        isXTZ: false,
        choices: ['Yes', 'No', 'Abstain'],
        publicKey: '0xUser1',
        signature: 'test_sig'
      };

      const createPollRes = await request(app)
        .post('/polls/add')
        .send(createPollPayload)
        .expect(200);

      expect(createPollRes.body.pollId).toBeDefined();
      const pollId = createPollRes.body.pollId;

      await global.testUtils.wait(100);

      const poll = await PollModel.findById(pollId);
      const choices = await ChoiceModel.find({ pollID: pollId });
      expect(choices.length).toBe(3);

      const vote1Payload = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: pollId.toString(),
          choiceId: choices[0]._id.toString(),
          address: '0xUser1'
        }],
        payloadBytes: 'test1',
        publicKey: '0xUser1',
        signature: 'sig1'
      };

      await request(app)
        .post('/choices/vote')
        .send(vote1Payload)
        .expect(200);

      const vote2Payload = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: pollId.toString(),
          choiceId: choices[0]._id.toString(),
          address: '0xUser2'
        }],
        payloadBytes: 'test2',
        publicKey: '0xUser2',
        signature: 'sig2'
      };

      await request(app)
        .post('/choices/vote')
        .send(vote2Payload)
        .expect(200);

      const voteCountRes = await request(app)
        .get(`/polls/${pollId}/votes/count`)
        .expect(200);

      expect(voteCountRes.body).toBeGreaterThan(0);

      const finalPollRes = await request(app)
        .get(`/polls/${pollId}`)
        .expect(200);

      expect(finalPollRes.body.name).toBe('Should we proceed?');
    });
  });

  describe('Vote Change Scenario', () => {
    it('should allow user to change their vote', async () => {
      const dao = await DaoModel.create({
        name: 'Test DAO',
        tokenAddress: '0xTestToken',
        tokenType: 'ERC20',
        network: 'etherlink-testnet',
        votingAddressesCount: 0,
        members: []
      });

      await TokenModel.create({
        tokenAddress: '0xTestToken',
        tokenType: 'ERC20',
        symbol: 'ETT',
        daoID: dao._id,
        decimals: '18'
      });

      const poll = await PollModel.create({
        name: 'Test Poll',
        description: 'Test',
        daoID: dao._id.toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '1000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: '0xUser1',
        votingStrategy: 0,
        isXTZ: false,
        choices: []
      });

      const choice1 = await ChoiceModel.create({
        name: 'Yes',
        pollID: poll._id,
        walletAddresses: []
      });

      const choice2 = await ChoiceModel.create({
        name: 'No',
        pollID: poll._id,
        walletAddresses: []
      });

      const firstVote = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice1._id.toString(),
          address: '0xUser1'
        }],
        payloadBytes: 'test1',
        publicKey: '0xUser1',
        signature: 'sig1'
      };

      await request(app)
        .post('/choices/vote')
        .send(firstVote)
        .expect(200);

      await global.testUtils.wait(100);

      const secondVote = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice2._id.toString(),
          address: '0xUser1'
        }],
        payloadBytes: 'test2',
        publicKey: '0xUser1',
        signature: 'sig2'
      };

      await request(app)
        .post('/choices/vote')
        .send(secondVote)
        .expect(200);

      const updatedChoice2 = await ChoiceModel.findById(choice2._id);
      const userVotes = updatedChoice2.walletAddresses.filter(w => w.address === '0xUser1');
      expect(userVotes.length).toBeGreaterThan(0);
    });
  });

  describe('Poll End Validation', () => {
    it('should reject votes after poll ends', async () => {
      const dao = await DaoModel.create({
        name: 'Test DAO',
        tokenAddress: '0xTestToken',
        tokenType: 'ERC20',
        network: 'etherlink-testnet',
        votingAddressesCount: 0,
        members: []
      });

      const poll = await PollModel.create({
        name: 'Ended Poll',
        description: 'Test',
        daoID: dao._id.toString(),
        startTime: (Date.now() - 10000).toString(),
        endTime: (Date.now() - 1000).toString(),
        referenceBlock: '1000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: '0xUser1',
        votingStrategy: 0,
        isXTZ: false,
        choices: []
      });

      const choice = await ChoiceModel.create({
        name: 'Yes',
        pollID: poll._id,
        walletAddresses: []
      });

      const votePayload = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice._id.toString(),
          address: '0xUser1'
        }],
        payloadBytes: 'test',
        publicKey: '0xUser1',
        signature: 'sig'
      };

      await request(app)
        .post('/choices/vote')
        .send(votePayload)
        .expect(400);
    });
  });
});

