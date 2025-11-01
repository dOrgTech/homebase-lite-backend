const mongoose = require('mongoose');
const { connectToMongoose } = require('../../../../db/mongoose-connection');
const TokenModel = require('../../../../db/models/Token.model');

describe('Token Model', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await TokenModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Schema Validation', () => {
    it('should create a valid token', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        symbol: 'TEST',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(savedToken._id).toBeDefined();
      expect(savedToken.tokenAddress).toBe('KT1TestContract');
      expect(savedToken.decimals).toBe('6');
    });

    it('should require tokenAddress field', async () => {
      const tokenData = {
        tokenType: 'fa2',
        symbol: 'TEST',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      
      await expect(token.save()).rejects.toThrow();
    });

    it('should require tokenType field', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        symbol: 'TEST',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      
      await expect(token.save()).rejects.toThrow();
    });

    it('should require daoID field', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        symbol: 'TEST',
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      
      await expect(token.save()).rejects.toThrow();
    });

    it('should support optional tokenID for FA2', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        symbol: 'TEST',
        tokenID: 5,
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(savedToken.tokenID).toBe(5);
    });

    it('should support ERC20 tokens', async () => {
      const tokenData = {
        tokenAddress: '0xTestContract',
        tokenType: 'ERC20',
        symbol: 'ETT',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '18'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(savedToken.tokenType).toBe('ERC20');
      expect(savedToken.decimals).toBe('18');
    });

    it('should have timestamps', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        symbol: 'TEST',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(savedToken.createdAt).toBeDefined();
      expect(savedToken.updatedAt).toBeDefined();
    });

    it('should allow symbol to be optional', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '6'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(savedToken.symbol).toBeUndefined();
    });

    it('should store decimals as string', async () => {
      const tokenData = {
        tokenAddress: 'KT1TestContract',
        tokenType: 'fa2',
        symbol: 'TEST',
        daoID: new mongoose.Types.ObjectId(),
        decimals: '18'
      };

      const token = new TokenModel(tokenData);
      const savedToken = await token.save();

      expect(typeof savedToken.decimals).toBe('string');
      expect(savedToken.decimals).toBe('18');
    });
  });
});

