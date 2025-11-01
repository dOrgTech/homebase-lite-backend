const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../../server');
const DaoModel = require('../../../db/models/Dao.model');
const TokenModel = require('../../../db/models/Token.model');
const { createTestDAO, createTestToken } = require('../../fixtures/test-data');
const { setupTzktMocks, setupEtherlinkMocks } = require('../../mocks/blockchain.mock');

describe('Token Routes Integration', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await DaoModel.deleteMany({});
    await TokenModel.deleteMany({});
    setupTzktMocks(global.axiosMock, 'ghostnet');
    setupEtherlinkMocks(global.axiosMock, 'etherlink-testnet');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /tokens/:daoId - Get token by DAO ID', () => {
    it('should return token for Tezos DAO', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const token = await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .get(`/tokens/${dao._id}`)
        .expect(200);

      expect(response.body._id).toBeDefined();
      expect(response.body.tokenAddress).toBe(token.tokenAddress);
      expect(response.body.symbol).toBe(token.symbol);
    });

    it('should return token with holder count for Etherlink', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      const token = await TokenModel.create(createTestToken(dao._id, {
        tokenAddress: '0xTestToken',
        tokenType: 'ERC20'
      }));

      const response = await request(app)
        .get(`/tokens/${dao._id}`)
        .expect(200);

      expect(response.body.tokenType).toBe('ERC20');
    });

    it('should return 400 for non-existent token', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .get(`/tokens/${fakeId}`)
        .expect(400);
    });
  });

  describe('GET /tokens/:network/:address/:tokenId/voting-power - Get voting power', () => {
    it('should return voting power for Tezos', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const token = await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .get(`/tokens/ghostnet/${token.tokenAddress}/0/voting-power?userAddress=tz1TestUser&level=5000000`)
        .expect(200);

      expect(response.body).toHaveProperty('votingWeight');
    });

    it('should return voting power for Etherlink', async () => {
      const dao = await DaoModel.create(createTestDAO({
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      await TokenModel.create(createTestToken(dao._id, {
        tokenAddress: '0xTestToken'
      }));

      const response = await request(app)
        .get(`/tokens/etherlink-testnet/0xTestToken/0/voting-power?userAddress=0xTestUser&level=1000000`)
        .expect(200);

      expect(response.body).toHaveProperty('votingWeight');
      expect(response.body.votingXTZWeight).toBe(0);
    });

    it('should return 400 if token not found', async () => {
      await request(app)
        .get('/tokens/ghostnet/KT1NonExistent/0/voting-power?userAddress=tz1Test&level=5000000')
        .expect(400);
    });
  });

  describe('GET /tokens/contract - Get token by contract', () => {
    it('should return token metadata from blockchain', async () => {
      const response = await request(app)
        .get('/tokens/contract?network=etherlink-testnet&contract=0xTestToken')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('symbol');
    });
  });

  describe('POST /tokens/add - Add token', () => {
    it('should create token successfully', async () => {
      const dao = await DaoModel.create(createTestDAO());

      const tokenData = {
        daoID: dao._id,
        tokenID: 5,
        symbol: 'TEST',
        tokenAddress: 'KT1TestContract'
      };

      const response = await request(app)
        .post('/tokens/add')
        .send(tokenData)
        .expect(200);

      expect(response.body.tokenAddress).toBe(tokenData.tokenAddress);
      expect(response.body.symbol).toBe(tokenData.symbol);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app)
        .post('/tokens/add')
        .send({ symbol: 'TEST' })
        .expect(400);
    });
  });
});

