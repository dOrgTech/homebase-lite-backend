const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const choicesRoutes = express.Router();

// This will help us connect to the database
const dbo = require("../db/conn");

// This help convert the id from string to ObjectId for the _id.
const ObjectId = require("mongodb").ObjectId;

// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/find").get(async (req, res) => {
    let db_connect = dbo.getDb();
    const choices = []
    const cursor = db_connect
        .collection("Choices")
        .find({ pollID: ObjectId(req.params.id) })

    await cursor.forEach(elem => choices.push(elem));
    return res.json(choices)
});

module.exports = choicesRoutes