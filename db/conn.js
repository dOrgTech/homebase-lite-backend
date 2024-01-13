const { MongoClient } = require("mongodb");

let _db;

async function connectToServer() {
  const dbUri = process.env.NODE_ENV === 'test' ? mongoServer.getUri() : process.env.ATLAS_URI;
  const db = await MongoClient.connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  if (db) {
    _db = db.db("Lite");
    console.log("Successfully connected to MongoDB.");
  }
}


function getDb() {
  return _db;
}

function getClient() {
  return client;
}

module.exports = {
  connectToServer,
  getDb,
  getClient,
};
