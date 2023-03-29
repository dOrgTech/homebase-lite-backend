const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config({ path: "./config.env" });
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
// get driver connection
const dbo = require("./db/conn");
const { getTokenMetadata } = require("./services");

app.listen(port, async () => {
  // perform a database connection when server starts
  dbo.connectToServer(function (err) {
    if (err) console.error(err);
  });

  console.log(`Server is running on port: ${port}`);
});
