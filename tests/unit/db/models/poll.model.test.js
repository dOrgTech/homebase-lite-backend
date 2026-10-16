const mongoose = require('mongoose');
const { connectToMongoose } = require('../../../../db/mongoose-connection');
const PollModel = require('../../../../db/models/Poll.model');

describe('Poll Model', () => {
  beforeAll(async () => {
    await connectToMongoose();
  });

  beforeEach(async () => {
    await PollModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Schema Validation', () => {
    it('should create a valid poll', async () => {
      const pollData = {
        name: 'Test Poll',
        description: 'Test Description',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1TestAuthor',
        votingStrategy: 0,
        isXTZ: false,
        choices: []
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll._id).toBeDefined();
      expect(savedPoll.name).toBe('Test Poll');
      expect(savedPoll.votingStrategy).toBe(0);
    });

    it('should require name field', async () => {
      const pollData = {
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 0
      };

      const poll = new PollModel(pollData);
      
      await expect(poll.save()).rejects.toThrow();
    });

    it('should support voting strategy options', async () => {
      const pollData = {
        name: 'Test Poll',
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 1,
        isXTZ: false,
        choices: []
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll.votingStrategy).toBe(1);
    });

    it('should have default values', async () => {
      const pollData = {
        name: 'Test Poll',
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 0,
        choices: []
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll.externalLink).toBe('');
      expect(savedPoll.isXTZ).toBe(false);
    });

    it('should store payload bytes hash with index', async () => {
      const pollData = {
        name: 'Test Poll',
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 0,
        payloadBytesHash: 'test_hash_123',
        choices: []
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll.payloadBytesHash).toBe('test_hash_123');
    });

    it('should store choices as ObjectId array', async () => {
      const choiceIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      const pollData = {
        name: 'Test Poll',
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 0,
        choices: choiceIds
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll.choices.length).toBe(2);
      expect(savedPoll.choices[0]).toBeInstanceOf(mongoose.Types.ObjectId);
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt', async () => {
      const pollData = {
        name: 'Test Poll',
        description: 'Test',
        daoID: new mongoose.Types.ObjectId().toString(),
        startTime: Date.now().toString(),
        endTime: (Date.now() + 86400000).toString(),
        referenceBlock: '5000000',
        totalSupplyAtReferenceBlock: '1000000',
        author: 'tz1Test',
        votingStrategy: 0,
        choices: []
      };

      const poll = new PollModel(pollData);
      const savedPoll = await poll.save();

      expect(savedPoll.createdAt).toBeDefined();
      expect(savedPoll.updatedAt).toBeDefined();
    });
  });
});

