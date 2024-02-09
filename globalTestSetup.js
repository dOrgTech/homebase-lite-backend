const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  const mongoServer = await MongoMemoryServer.create();
  process.env.TEST_MONGO_URI = mongoServer.getUri();

  // Store the MongoMemoryServer instance in a global variable
  global.__MONGOSERVER__ = mongoServer;
};
