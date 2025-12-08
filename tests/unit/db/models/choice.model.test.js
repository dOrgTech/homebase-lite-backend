const mongoose = require('mongoose');
const { connectToMongoose } = require('../../../../db/mongoose-connection');
const ChoiceModel = require('../../../../db/models/Choice.model');

describe('Choice Model', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await ChoiceModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Schema Validation', () => {
    it('should create a valid choice', async () => {
      const choiceData = {
        name: 'Yes',
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: []
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice._id).toBeDefined();
      expect(savedChoice.name).toBe('Yes');
      expect(Array.isArray(savedChoice.walletAddresses)).toBe(true);
    });

    it('should require pollID field', async () => {
      const choiceData = {
        name: 'Yes',
        walletAddresses: []
      };

      const choice = new ChoiceModel(choiceData);
      
      await expect(choice.save()).rejects.toThrow();
    });

    it('should have default name', async () => {
      const choiceData = {
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: []
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice.name).toBe('');
    });

    it('should store wallet addresses with balance', async () => {
      const choiceData = {
        name: 'Yes',
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: [
          {
            address: 'tz1TestUser1',
            balanceAtReferenceBlock: '100000'
          },
          {
            address: 'tz1TestUser2',
            balanceAtReferenceBlock: '200000'
          }
        ]
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice.walletAddresses.length).toBe(2);
      expect(savedChoice.walletAddresses[0].address).toBe('tz1TestUser1');
      expect(savedChoice.walletAddresses[0].balanceAtReferenceBlock).toBe('100000');
    });

    it('should validate wallet address structure', async () => {
      const choiceData = {
        name: 'Yes',
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: [
          {
            address: 'tz1TestUser1',
            balanceAtReferenceBlock: '100000'
          }
        ]
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice.walletAddresses[0]).toHaveProperty('address');
      expect(savedChoice.walletAddresses[0]).toHaveProperty('balanceAtReferenceBlock');
    });

    it('should handle empty wallet addresses', async () => {
      const choiceData = {
        name: 'Option 1',
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: []
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice.walletAddresses.length).toBe(0);
    });

    it('should allow multiple votes with different balances', async () => {
      const choiceData = {
        name: 'Yes',
        pollID: new mongoose.Types.ObjectId(),
        walletAddresses: [
          { address: 'tz1User1', balanceAtReferenceBlock: '50000' },
          { address: 'tz1User2', balanceAtReferenceBlock: '75000' },
          { address: 'tz1User3', balanceAtReferenceBlock: '100000' }
        ]
      };

      const choice = new ChoiceModel(choiceData);
      const savedChoice = await choice.save();

      expect(savedChoice.walletAddresses.length).toBe(3);
    });
  });
});

