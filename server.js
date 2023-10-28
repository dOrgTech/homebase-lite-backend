const express = require("express");
const cors = require("cors");

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

app.use(require("./routes/daos"));
app.use(require("./routes/polls"));
app.use(require("./routes/tokens"));
app.use(require("./routes/choices"));

app.listen(port, async () => {
  // perform a database connection when server starts
  try {
    dbo.connectToServer();
  } catch (error) {
    console.error(error);
  }

  console.log(`Server is running on port: ${port}`);
});
