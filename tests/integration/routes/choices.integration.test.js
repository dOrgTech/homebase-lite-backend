const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../../server');
const DaoModel = require('../../../db/models/Dao.model');
const PollModel = require('../../../db/models/Poll.model');
const ChoiceModel = require('../../../db/models/Choice.model');
const TokenModel = require('../../../db/models/Token.model');
const { createTestDAO, createTestPoll, createTestChoice, createTestToken } = require('../../fixtures/test-data');
const { setupTzktMocks, setupEtherlinkMocks } = require('../../mocks/blockchain.mock');

describe('Choice/Voting Routes Integration', () => {
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

  describe('GET /choices/:pollId - Get choices by poll ID', () => {
    it('should return all choices for a poll', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));
      await ChoiceModel.create(createTestChoice(poll._id, { name: 'Yes' }));
      await ChoiceModel.create(createTestChoice(poll._id, { name: 'No' }));

      const response = await request(app)
        .get(`/choices/${poll._id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].name).toBeDefined();
    });

    it('should return empty array for poll with no choices', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));

      const response = await request(app)
        .get(`/choices/${poll._id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should include wallet addresses in choices', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));
      await ChoiceModel.create(createTestChoice(poll._id, {
        name: 'Yes',
        walletAddresses: [
          { address: 'tz1User1', balanceAtReferenceBlock: '100000' }
        ]
      }));

      const response = await request(app)
        .get(`/choices/${poll._id}`)
        .expect(200);

      expect(response.body[0].walletAddresses).toBeDefined();
      expect(response.body[0].walletAddresses.length).toBe(1);
    });
  });

  describe('POST /choices/vote - Cast vote', () => {
    it('should cast vote successfully (Etherlink)', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      const token = await TokenModel.create(createTestToken(dao._id, {
        tokenAddress: '0xTestToken'
      }));
      const poll = await PollModel.create(createTestPoll(dao._id, {
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '1000000'
      }));
      const choice = await ChoiceModel.create(createTestChoice(poll._id));

      const voteData = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice._id.toString(),
          address: '0xTestUser'
        }],
        payloadBytes: 'test_payload',
        publicKey: '0xTestPublicKey',
        signature: 'test_signature'
      };

      const response = await request(app)
        .post('/choices/vote')
        .send(voteData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject vote after poll ends', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet'
      }));
      const poll = await PollModel.create(createTestPoll(dao._id, {
        endTime: (Date.now() - 1000).toString()
      }));
      const choice = await ChoiceModel.create(createTestChoice(poll._id));

      const voteData = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice._id.toString(),
          address: '0xTestUser'
        }],
        payloadBytes: 'test',
        publicKey: '0xTest',
        signature: 'test'
      };

      await request(app)
        .post('/choices/vote')
        .send(voteData)
        .expect(400);
    });

    it('should reject vote with duplicate choices', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet'
      }));
      const poll = await PollModel.create(createTestPoll(dao._id, {
        endTime: (Date.now() + 86400000).toString()
      }));
      const choice = await ChoiceModel.create(createTestChoice(poll._id));

      const voteData = {
        network: 'etherlink-testnet',
        payloadObj: [
          {
            pollID: poll._id.toString(),
            choiceId: choice._id.toString(),
            address: '0xTestUser'
          },
          {
            pollID: poll._id.toString(),
            choiceId: choice._id.toString(),
            address: '0xTestUser'
          }
        ],
        payloadBytes: 'test',
        publicKey: '0xTest',
        signature: 'test'
      };

      await request(app)
        .post('/choices/vote')
        .send(voteData)
        .expect(400);
    });

    it('should update vote when user changes selection', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      await TokenModel.create(createTestToken(dao._id, {
        tokenAddress: '0xTestToken'
      }));
      const poll = await PollModel.create(createTestPoll(dao._id, {
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '1000000'
      }));
      const choice1 = await ChoiceModel.create(createTestChoice(poll._id, { name: 'Yes' }));
      const choice2 = await ChoiceModel.create(createTestChoice(poll._id, { name: 'No' }));

      const firstVote = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice1._id.toString(),
          address: '0xTestUser'
        }],
        payloadBytes: 'test1',
        publicKey: '0xTest',
        signature: 'sig1'
      };

      await request(app)
        .post('/choices/vote')
        .send(firstVote)
        .expect(200);

      const secondVote = {
        network: 'etherlink-testnet',
        payloadObj: [{
          pollID: poll._id.toString(),
          choiceId: choice2._id.toString(),
          address: '0xTestUser'
        }],
        payloadBytes: 'test2',
        publicKey: '0xTest',
        signature: 'sig2'
      };

      await request(app)
        .post('/choices/vote')
        .send(secondVote)
        .expect(200);

      const updatedChoice2 = await ChoiceModel.findById(choice2._id);
      const userVotes = updatedChoice2.walletAddresses.filter(w => w.address === '0xTestUser');
      expect(userVotes.length).toBeGreaterThan(0);
    });
  });

  describe('GET /choices/user/:address - Get user votes', () => {
    it('should return all votes by user', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));
      await ChoiceModel.create(createTestChoice(poll._id, {
        walletAddresses: [
          { address: 'tz1TestUser', balanceAtReferenceBlock: '100000' }
        ]
      }));

      const response = await request(app)
        .get('/choices/user/tz1TestUser')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /polls/:id/votes/count - Get vote count', () => {
    it('should return total vote count for poll', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));
      await ChoiceModel.create(createTestChoice(poll._id, {
        walletAddresses: [
          { address: 'tz1User1', balanceAtReferenceBlock: '100000' },
          { address: 'tz1User2', balanceAtReferenceBlock: '200000' }
        ]
      }));
      await ChoiceModel.create(createTestChoice(poll._id, {
        walletAddresses: [
          { address: 'tz1User3', balanceAtReferenceBlock: '150000' }
        ]
      }));

      const response = await request(app)
        .get(`/polls/${poll._id}/votes/count`)
        .expect(200);

      expect(response.body).toBe(3);
    });

    it('should return 0 for poll with no votes', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));
      await ChoiceModel.create(createTestChoice(poll._id));

      const response = await request(app)
        .get(`/polls/${poll._id}/votes/count`)
        .expect(200);

      expect(response.body).toBe(0);
    });
  });
});

