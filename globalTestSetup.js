const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  // Store server information in a temporary file
  const tempFilePath = path.join(__dirname, 'mongoServerInfo.json');
  fs.writeFileSync(tempFilePath, JSON.stringify({ uri: mongoServer.getUri(), instanceId: mongoServer.instanceInfo?.instanceId }));
};
