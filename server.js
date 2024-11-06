const express = require("express");
const cors = require("cors");
const mongoose = require('mongoose');

require("dotenv").config({ path: "./config.env" });

// get driver connection
const dbo = require("./db/conn");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

// Include Swagger route at the base URL
app.use('/', require('./routes/swagger'));

// Other routes are included after the Swagger route
app.use(require("./routes/daos"));
app.use(require("./routes/polls"));
app.use(require("./routes/tokens"));
app.use(require("./routes/choices"));
app.use(require("./routes/aci"));

app.listen(port, async () => {
  // perform a database connection when server starts
  try {
    dbo.connectToServer();
  } catch (error) {
    console.error(error);
  }

  console.log(`Server is running on port: ${port}`);
});

function getMongoDBDatabaseName(url) {
  const dbNameMatch = url.match(/\/([^/?]+)(\?|$)/);
  return dbNameMatch ? dbNameMatch[1] : null;
}

const connectToMongoDB = async () => {
  try {
    let connUrl = process.env.ATLAS_URI;
    const database = getMongoDBDatabaseName(connUrl);
    if (!database) {
      const urlParts = connUrl.split('?');
      connUrl = `${urlParts[0]}Lite?${urlParts[1] || ''}`;
    }
    console.log(connUrl);
    await mongoose.connect(connUrl);
    console.log('Connected to MongoDB using Mongoose');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

// Call the function to connect to MongoDB
connectToMongoDB();
