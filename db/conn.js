const { MongoClient } = require("mongodb");

const dbURI = process.env.ATLAS_URI;

const client = new MongoClient(dbURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let _db;

async function connectToServer() {
  const db = await client.connect();
  // Verify we got a good "db" object
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
