const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const tokensRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id
// This section will help you create a new record.
tokensRoutes.route("/token/add").post(function (req, response) {
  try {
    let db_connect = dbo.getDb();
    let data = {
      daoID: req.body.daoID,
      tokenID: req.body.tokenID,
      symbol: req.body.symbol,
      tokenAddress: req.body.tokenAddress,
    };
    db_connect.collection("Tokens").insertOne(data, function (err, res) {
      if (err) throw err;
      response.json(res);
    })
  } catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error saving token",
    });
  }
});

// This section will help you get a single record by id
tokensRoutes.route("/token/:id").get((req, res) => {
  try {
    let db_connect = dbo.getDb();
    let id = { daoID: ObjectId(req.params.id) };
    db_connect
      .collection("Tokens")
      .findOne(id, function (err, result) {
        if (err) throw err;
        res.json(result);
      })
  }
  catch (error) {
    console.log("error: ", error);
    response.status(400).send({
      message: "Error retrieving community token",
    });
  }
});

module.exports = tokensRoutes


