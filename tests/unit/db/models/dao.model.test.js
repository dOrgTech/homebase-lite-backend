const mongoose = require('mongoose');
const { connectToMongoose } = require('../../../../db/mongoose-connection');
const DaoModel = require('../../../../db/models/Dao.model');

describe('DAO Model', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await DaoModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Schema Validation', () => {
    it('should create a valid DAO', async () => {
      const daoData = {
        name: 'Test DAO',
        description: 'Test Description',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0,
        members: ['tz1TestUser']
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(savedDao._id).toBeDefined();
      expect(savedDao.name).toBe('Test DAO');
      expect(savedDao.network).toBe('ghostnet');
    });

    it('should require name field', async () => {
      const daoData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0
      };

      const dao = new DaoModel(daoData);
      
      await expect(dao.save()).rejects.toThrow();
    });

    it('should require tokenAddress field', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0
      };

      const dao = new DaoModel(daoData);
      
      await expect(dao.save()).rejects.toThrow();
    });

    it('should require network field', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        votingAddressesCount: 0
      };

      const dao = new DaoModel(daoData);
      
      await expect(dao.save()).rejects.toThrow();
    });

    it('should have default values', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0,
        members: []
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(savedDao.description).toBe('');
      expect(savedDao.linkToTerms).toBe('');
      expect(savedDao.picUri).toBe('');
      expect(savedDao.requiredTokenOwnership).toBe(true);
      expect(savedDao.allowPublicAccess).toBe(true);
    });

    it('should support polls array', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0,
        members: [],
        polls: []
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(Array.isArray(savedDao.polls)).toBe(true);
      expect(savedDao.polls.length).toBe(0);
    });

    it('should support Etherlink DAOs', async () => {
      const daoData = {
        name: 'Etherlink DAO',
        tokenAddress: '0xTestContract',
        tokenType: 'ERC20',
        network: 'etherlink-testnet',
        votingAddressesCount: 0,
        members: ['0xTestUser']
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(savedDao.tokenType).toBe('ERC20');
      expect(savedDao.network).toBe('etherlink-testnet');
    });

    it('should support onchain DAOs with address', async () => {
      const daoData = {
        type: 'onchain',
        address: '0xOnchainAddress',
        name: 'Onchain DAO',
        tokenAddress: '0xTestContract',
        tokenType: 'ERC20',
        network: 'etherlink-testnet',
        votingAddressesCount: 0,
        members: []
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(savedDao.type).toBe('onchain');
      expect(savedDao.address).toBe('0xOnchainAddress');
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0,
        members: []
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();

      expect(savedDao.createdAt).toBeDefined();
      expect(savedDao.updatedAt).toBeDefined();
    });

    it('should update updatedAt on save', async () => {
      const daoData = {
        name: 'Test DAO',
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        network: 'ghostnet',
        votingAddressesCount: 0,
        members: []
      };

      const dao = new DaoModel(daoData);
      const savedDao = await dao.save();
      const firstUpdatedAt = savedDao.updatedAt;

      await global.testUtils.wait(100);
      
      savedDao.name = 'Updated DAO';
      await savedDao.save();

      expect(savedDao.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
    });
  });
});

