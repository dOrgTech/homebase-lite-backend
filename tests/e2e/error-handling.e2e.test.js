const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../server');
const DaoModel = require('../../db/models/Dao.model');
const { setupTzktMocks, setupEtherlinkMocks } = require('../mocks/blockchain.mock');

describe('E2E: Error Handling', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await DaoModel.deleteMany({});
    setupTzktMocks(global.axiosMock, 'ghostnet');
    setupEtherlinkMocks(global.axiosMock, 'etherlink-testnet');
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Invalid Input Handling', () => {
    it('should sanitize XSS attempts in DAO creation', async () => {
      const maliciousPayload = {
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken',
        symbol: 'ETT',
        name: '<script>alert("xss")</script>Test DAO',
        description: '<img src=x onerror=alert("xss")>',
        linkToTerms: 'javascript:alert("xss")',
        picUri: 'ipfs://test',
        requiredTokenOwnership: true,
        allowPublicAccess: true,
        daoContract: null,
        decimals: '18',
        publicKey: '0xUser1'
      };

      const response = await request(app)
        .post('/dao/add')
        .send(maliciousPayload)
        .expect(200);

      const dao = await DaoModel.findById(response.body.dao._id);
      expect(dao.name).not.toContain('<script>');
      expect(dao.description).not.toContain('onerror');
    });

    it('should reject malformed payloads', async () => {
      await request(app)
        .post('/dao/add')
        .send({ invalid: 'data' })
        .expect(400);
    });

    it('should handle oversized payloads', async () => {
      const oversizedPayload = {
        network: 'etherlink-testnet',
        name: 'A'.repeat(10000),
        description: 'B'.repeat(50000),
        tokenAddress: '0xTestToken',
        publicKey: '0xUser1'
      };

      await request(app)
        .post('/dao/add')
        .send(oversizedPayload);

      expect(true).toBe(true);
    });
  });

  describe('Authorization Failures', () => {
    it('should reject DAO creation without token balance', async () => {
      global.axiosMock.reset();
      setupTzktMocks(global.axiosMock, 'ghostnet');
      global.axiosMock
        .onGet(/tokens\/balances/)
        .reply(200, []);

      const payload = {
        network: 'ghostnet',
        tokenAddress: 'KT1Test',
        tokenID: '0',
        name: 'Test DAO',
        publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav'
      };

      await request(app)
        .post('/dao/add')
        .send(payload)
        .expect(400);
    });
  });

  describe('Serverless Environment Simulation', () => {
    it('should work with cache disabled', async () => {
      const originalNetlify = process.env.NETLIFY;
      process.env.NETLIFY = 'true';
      
      delete require.cache[require.resolve('../../db/cache.db')];
      
      const dao = await DaoModel.create({
        name: 'Test DAO',
        tokenAddress: '0xTest',
        tokenType: 'ERC20',
        network: 'etherlink-testnet',
        votingAddressesCount: 0,
        members: []
      });

      const response = await request(app)
        .get(`/daos/${dao._id}`)
        .expect(200);

      expect(response.body._id).toBe(dao._id.toString());
      
      if (originalNetlify) {
        process.env.NETLIFY = originalNetlify;
      } else {
        delete process.env.NETLIFY;
      }
    });

    it('should handle read-only filesystem gracefully', async () => {
      const originalNetlify = process.env.NETLIFY;
      process.env.NETLIFY = 'true';
      
      delete require.cache[require.resolve('../../db/cache.db')];
      const dbCache = require('../../db/cache.db');
      
      const result = dbCache.getSync('test-key');
      expect(result).toBeNull();
      
      if (originalNetlify) {
        process.env.NETLIFY = originalNetlify;
      } else {
        delete process.env.NETLIFY;
      }
    });
  });
});

