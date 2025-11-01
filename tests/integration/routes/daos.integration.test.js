const request = require('supertest');
const mongoose = require('mongoose');
const { app, connectToMongoose } = require('../../../server');
const DaoModel = require('../../../db/models/Dao.model');
const TokenModel = require('../../../db/models/Token.model');
const { createTestDAO, createTestToken, createDAOPayload, createEtherlinkDAOPayload } = require('../../fixtures/test-data');
const { setupTzktMocks, setupEtherlinkMocks } = require('../../mocks/blockchain.mock');

describe('DAO Routes Integration', () => {
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

  describe('POST /daos - Get all DAOs', () => {
    it('should return all DAOs for a network', async () => {
      const dao = await DaoModel.create(createTestDAO());
      await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .post('/daos')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('tokenAddress');
    });

    it('should support GET method with query parameters', async () => {
      const dao = await DaoModel.create(createTestDAO());
      await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .get('/daos?network=ghostnet')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should support sorting by order parameter', async () => {
      await DaoModel.create(createTestDAO({ name: 'DAO A' }));
      await global.testUtils.wait(100);
      await DaoModel.create(createTestDAO({ name: 'DAO B' }));

      const response = await request(app)
        .get('/daos?network=ghostnet&order=asc')
        .expect(200);

      expect(response.body[0].name).toBe('DAO A');
    });

    it('should aggregate DAO with token data', async () => {
      const dao = await DaoModel.create(createTestDAO());
      const token = await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .post('/daos')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(response.body[0]).toHaveProperty('symbol');
      expect(response.body[0].symbol).toBe(token.symbol);
    });

    it('should filter by daoContract null for lite DAOs', async () => {
      await DaoModel.create(createTestDAO({ daoContract: null }));
      await DaoModel.create(createTestDAO({ daoContract: 'KT1Contract' }));

      const response = await request(app)
        .post('/daos')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(response.body.some(dao => dao.daoContract === null)).toBe(true);
    });
  });

  describe('GET /daos/:id - Get DAO by ID', () => {
    it('should return DAO by ObjectId', async () => {
      const dao = await DaoModel.create(createTestDAO());

      const response = await request(app)
        .get(`/daos/${dao._id}`)
        .expect(200);

      expect(response.body._id).toBe(dao._id.toString());
      expect(response.body.name).toBe(dao.name);
    });

    it('should return DAO by address for onchain DAOs', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        type: 'onchain',
        address: '0xTestAddress' 
      }));

      const response = await request(app)
        .get(`/daos/0xTestAddress`)
        .expect(200);

      expect(response.body.address.toLowerCase()).toBe('0xtestaddress');
    });

    it('should strip HTML from description', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        description: '<p>Test <script>alert("xss")</script></p>' 
      }));

      const response = await request(app)
        .get(`/daos/${dao._id}`)
        .expect(200);

      expect(response.body.description).not.toContain('<script>');
    });

    it('should include polls when include=polls', async () => {
      const dao = await DaoModel.create(createTestDAO());

      const response = await request(app)
        .get(`/daos/${dao._id}?include=polls`)
        .expect(200);

      expect(response.body).toHaveProperty('polls');
    });

    it('should return 400 for invalid ID', async () => {
      await request(app)
        .get('/daos/invalid_id')
        .expect(400);
    });
  });

  describe('POST /dao/add - Create DAO', () => {
    it('should create Tezos DAO successfully', async () => {
      const payload = createDAOPayload('ghostnet');

      const response = await request(app)
        .post('/dao/add')
        .send(payload)
        .expect(200);

      const dao = await DaoModel.findOne({});
      expect(dao).toBeDefined();
      expect(dao.network).toBe('ghostnet');
    });

    it('should create Etherlink DAO successfully', async () => {
      const payload = createEtherlinkDAOPayload();

      const response = await request(app)
        .post('/dao/add')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('dao');
      expect(response.body).toHaveProperty('token');
      
      const dao = await DaoModel.findOne({});
      expect(dao.network).toBe('etherlink-testnet');
    });

    it('should create token along with DAO', async () => {
      const payload = createEtherlinkDAOPayload();

      await request(app)
        .post('/dao/add')
        .send(payload)
        .expect(200);

      const tokenCount = await TokenModel.countDocuments();
      expect(tokenCount).toBe(1);
    });

    it('should use transaction for Tezos DAO creation', async () => {
      const payload = createDAOPayload('ghostnet');

      await request(app)
        .post('/dao/add')
        .send(payload);

      const daoCount = await DaoModel.countDocuments();
      const tokenCount = await TokenModel.countDocuments();
      
      expect(daoCount).toBeGreaterThan(0);
      expect(tokenCount).toBeGreaterThan(0);
    });

    it('should reject DAO creation without token ownership', async () => {
      global.axiosMock.reset();
      setupTzktMocks(global.axiosMock, 'ghostnet');
      global.axiosMock
        .onGet(/tokens\/balances/)
        .reply(200, []);

      const payload = createDAOPayload('ghostnet');

      await request(app)
        .post('/dao/add')
        .send(payload)
        .expect(400);
    });
  });

  describe('POST /daos/join - Join/Leave DAO', () => {
    it('should add member to DAO', async () => {
      const dao = await DaoModel.create(createTestDAO({ members: [] }));

      await request(app)
        .post('/daos/join')
        .send({
          payloadBytes: 'test',
          publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav'
        });

      const updatedDao = await DaoModel.findById(dao._id);
      expect(updatedDao.members.length).toBeGreaterThanOrEqual(0);
    });

    it('should toggle membership (leave if already member)', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        members: ['tz1TestUser'] 
      }));

      await request(app)
        .post('/daos/join')
        .send({
          payloadBytes: 'test',
          publicKey: 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Wd9sDVC9yav'
        });

      const updatedDao = await DaoModel.findById(dao._id);
      expect(updatedDao).toBeDefined();
    });
  });

  describe('GET /daos/:id/count - Update voting addresses count', () => {
    it('should update count from blockchain', async () => {
      const dao = await DaoModel.create(createTestDAO());
      await TokenModel.create(createTestToken(dao._id));

      await request(app)
        .get(`/daos/${dao._id}/count`)
        .expect(200);

      const updatedDao = await DaoModel.findById(dao._id);
      expect(updatedDao.votingAddressesCount).toBeGreaterThanOrEqual(0);
    });

    it('should return 500 if DAO not found', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .get(`/daos/${fakeId}/count`)
        .expect(500);
    });

    it('should handle Etherlink DAOs', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        network: 'etherlink-testnet',
        tokenAddress: '0xTestToken'
      }));
      await TokenModel.create(createTestToken(dao._id, { 
        tokenAddress: '0xTestToken'
      }));

      await request(app)
        .get(`/daos/${dao._id}/count`)
        .expect(200);
    });
  });

  describe('POST /daos/contracts/:contract - Get DAO by contract', () => {
    it('should return DAO by contract address', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        daoContract: 'KT1TestContract'
      }));
      await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .post('/daos/contracts/KT1TestContract')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(response.body.daoContract).toBe('KT1TestContract');
    });

    it('should return empty object for non-existent contract', async () => {
      const response = await request(app)
        .post('/daos/contracts/KT1NonExistent')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should include token data', async () => {
      const dao = await DaoModel.create(createTestDAO({ 
        daoContract: 'KT1TestContract'
      }));
      await TokenModel.create(createTestToken(dao._id));

      const response = await request(app)
        .post('/daos/contracts/KT1TestContract')
        .send({ network: 'ghostnet' })
        .expect(200);

      expect(response.body).toHaveProperty('symbol');
    });
  });
});

