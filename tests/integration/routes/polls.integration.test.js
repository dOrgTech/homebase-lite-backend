const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../../server');
const DaoModel = require('../../../db/models/Dao.model');
const PollModel = require('../../../db/models/Poll.model');
const ChoiceModel = require('../../../db/models/Choice.model');
const TokenModel = require('../../../db/models/Token.model');
const { createTestDAO, createTestPoll, createTestToken, createPollPayload } = require('../../fixtures/test-data');
const { setupTzktMocks, setupEtherlinkMocks } = require('../../mocks/blockchain.mock');

describe('Poll Routes Integration', () => {
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

  describe('GET /polls/:id - Get poll by ID', () => {
    it('should return poll by ID', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id));

      const response = await request(app)
        .get(`/polls/${poll._id}`)
        .expect(200);

      expect(response.body._id).toBe(poll._id.toString());
      expect(response.body.name).toBeDefined();
    });

    it('should sanitize HTML in name and description', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll = await PollModel.create(createTestPoll(dao._id, {
        name: '<script>alert("xss")</script>Poll Name',
        description: '<p>Test <b>description</b></p>'
      }));

      const response = await request(app)
        .get(`/polls/${poll._id}`)
        .expect(200);

      expect(response.body.name).not.toContain('<script>');
      expect(response.body.description).not.toContain('<script>');
    });

    it('should return 400 for invalid ID', async () => {
      await request(app)
        .get('/polls/invalid_id')
        .expect(400);
    });
  });

  describe('GET /polls/dao/:id - Get polls by DAO ID', () => {
    it('should return all polls for a DAO', async () => {
      const dao = await DaoModel.create(createTestDAO());
      await PollModel.create(createTestPoll(dao._id, { name: 'Poll 1' }));
      await PollModel.create(createTestPoll(dao._id, { name: 'Poll 2' }));

      const response = await request(app)
        .get(`/polls/dao/${dao._id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should sort polls by _id desc', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const poll1 = await PollModel.create(createTestPoll(dao._id, { name: 'Poll 1' }));
      await global.testUtils.wait(100);
      const poll2 = await PollModel.create(createTestPoll(dao._id, { name: 'Poll 2' }));

      const response = await request(app)
        .get(`/polls/dao/${dao._id}`)
        .expect(200);

      expect(response.body[0]._id).toBe(poll2._id.toString());
      expect(response.body[1]._id).toBe(poll1._id.toString());
    });

    it('should return empty array for DAO with no polls', async () => {
      const dao = await DaoModel.create(createTestDAO());

      const response = await request(app)
        .get(`/polls/dao/${dao._id}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });
  });

  describe('POST /polls/add - Create poll', () => {
    it('should create Etherlink poll successfully (lite mode)', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      await TokenModel.create(createTestToken(dao._id, { 
        tokenAddress: '0xTestToken'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test Description',
        externalLink: 'https://example.com',
        endTime: (Date.now() + 86400000).toString(),
        votingStrategy: 0,
        isXTZ: false,
        choices: ['Yes', 'No'],
        publicKey: '0xTestPublicKey',
        signature: 'test_signature'
      };

      const response = await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(200);

      expect(response.body.message).toBe('Poll Created Successfully');
      expect(response.body.pollId).toBeDefined();
    });

    it('should reject poll with end time in past', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test',
        endTime: (Date.now() - 1000).toString(),
        choices: ['Yes', 'No'],
        publicKey: '0xTestPublicKey'
      };

      await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(400);
    });

    it('should reject poll without choices', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test',
        endTime: (Date.now() + 86400000).toString(),
        choices: [],
        publicKey: '0xTestPublicKey'
      };

      await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(400);
    });

    it('should reject poll with duplicate choices', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test',
        endTime: (Date.now() + 86400000).toString(),
        choices: ['Yes', 'Yes', 'No'],
        publicKey: '0xTestPublicKey'
      };

      await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(400);
    });

    it('should create poll and choices atomically', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      await TokenModel.create(createTestToken(dao._id, { 
        tokenAddress: '0xTestToken'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test',
        endTime: (Date.now() + 86400000).toString(),
        choices: ['Yes', 'No', 'Abstain'],
        publicKey: '0xTestPublicKey',
        signature: 'test'
      };

      await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(200);

      const choiceCount = await ChoiceModel.countDocuments();
      expect(choiceCount).toBe(3);
    });

    it('should update DAO with poll ID', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken',
        polls: []
      }));
      await TokenModel.create(createTestToken(dao._id, { 
        tokenAddress: '0xTestToken'
      }));

      const pollData = {
        network: 'etherlink-testnet',
        daoID: dao._id.toString(),
        name: 'Test Poll',
        description: 'Test',
        endTime: (Date.now() + 86400000).toString(),
        choices: ['Yes', 'No'],
        publicKey: '0xTestPublicKey',
        signature: 'test'
      };

      await request(app)
        .post('/polls/add')
        .send(pollData)
        .expect(200);

      const updatedDao = await DaoModel.findById(dao._id);
      expect(updatedDao.polls.length).toBeGreaterThan(0);
    });
  });
});

