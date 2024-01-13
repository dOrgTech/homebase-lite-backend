const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // Read the server information from the temporary file
  const tempFilePath = path.join(__dirname, 'mongoServerInfo.json');
  if (fs.existsSync(tempFilePath)) {
    const serverInfo = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
    if (serverInfo && serverInfo.instanceId) {
      // Stop the server
      await MongoMemoryServer.stop({ instanceId: serverInfo.instanceId });
    }

    // Remove the temporary file
    fs.unlinkSync(tempFilePath);
  }
};
