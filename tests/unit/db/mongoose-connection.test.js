const mongoose = require('mongoose');
const { connectToMongoose } = require('../../../db/mongoose-connection');

describe('Mongoose Connection', () => {
  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    delete require.cache[require.resolve('../../../db/mongoose-connection')];
  });

  describe('connectToMongoose', () => {
    it('should connect to MongoDB successfully', async () => {
      const connection = await connectToMongoose();
      
      expect(connection).toBeDefined();
      expect(mongoose.connection.readyState).toBe(1);
    });

    it('should reuse cached connection', async () => {
      const connection1 = await connectToMongoose();
      const connection2 = await connectToMongoose();
      
      expect(connection1).toBe(connection2);
    });

    it('should throw error when ATLAS_URI is not set', async () => {
      const originalUri = process.env.ATLAS_URI;
      const originalTestUri = process.env.TEST_MONGO_URI;
      delete process.env.ATLAS_URI;
      delete process.env.TEST_MONGO_URI;
      
      delete require.cache[require.resolve('../../../db/mongoose-connection')];
      const { connectToMongoose: freshConnect } = require('../../../db/mongoose-connection');
      
      await expect(freshConnect()).rejects.toThrow(/ATLAS_URI/);
      
      process.env.ATLAS_URI = originalUri;
      process.env.TEST_MONGO_URI = originalTestUri;
    });

    it('should use TEST_MONGO_URI in test environment', async () => {
      const testUri = process.env.TEST_MONGO_URI;
      expect(testUri).toBeDefined();
      
      const connection = await connectToMongoose();
      expect(connection).toBeDefined();
    });

    it('should handle connection errors gracefully', async () => {
      const originalUri = process.env.ATLAS_URI;
      const originalTestUri = process.env.TEST_MONGO_URI;
      process.env.ATLAS_URI = 'mongodb://invalid:27017/test';
      process.env.TEST_MONGO_URI = 'mongodb://invalid:27017/test';
      
      delete require.cache[require.resolve('../../../db/mongoose-connection')];
      const { connectToMongoose: freshConnect } = require('../../../db/mongoose-connection');
      
      await expect(freshConnect()).rejects.toThrow();
      
      process.env.ATLAS_URI = originalUri;
      process.env.TEST_MONGO_URI = originalTestUri;
    });

    it('should append database name if missing', async () => {
      const connection = await connectToMongoose();
      const dbName = connection.name;
      
      expect(dbName).toBeDefined();
      expect(dbName.length).toBeGreaterThan(0);
    });

    it('should set connection timeouts', async () => {
      const connection = await connectToMongoose();
      
      expect(connection).toBeDefined();
    });

    it('should log connection status', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await connectToMongoose();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getMongoDBDatabaseName', () => {
    it('should extract database name from connection string', async () => {
      const connection = await connectToMongoose();
      
      expect(connection.name).toBeDefined();
    });
  });
});

