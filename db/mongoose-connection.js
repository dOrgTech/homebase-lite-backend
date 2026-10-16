const mongoose = require('mongoose');

let cachedConnection = null;

function getMongoDBDatabaseName(url) {
  const dbNameMatch = url.match(/\/([^/?]+)(\?|$)/);
  return dbNameMatch ? dbNameMatch[1] : null;
}

async function connectToMongoose() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    let connUrl = process.env.NODE_ENV === 'test' 
      ? process.env.TEST_MONGO_URI 
      : process.env.ATLAS_URI;
    
    if (!connUrl) {
      throw new Error('MongoDB connection string (ATLAS_URI) is not set. Please configure it in Netlify environment variables.');
    }
    
    const database = getMongoDBDatabaseName(connUrl);
    if (!database) {
      const urlParts = connUrl.split('?');
      connUrl = `${urlParts[0]}Lite?${urlParts[1] || ''}`;
    }

    await mongoose.connect(connUrl, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    cachedConnection = mongoose.connection;
    console.log('Connected to MongoDB using Mongoose');
    return cachedConnection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

module.exports = { connectToMongoose };


