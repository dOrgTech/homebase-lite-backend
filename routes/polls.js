const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const pollsRoutes = express.Router();

const { requireSignature } = require("../middlewares");
const { getPollsById, getPollById, addPoll } = require("../components/polls");

// This section will help you get a single record by id
pollsRoutes.route("/polls/:id/polls").get(getPollById);
// This section will help you get a single record by id
pollsRoutes.route("/polls/:id/list").get(getPollsById);
// This section will help you create a new record.
pollsRoutes.route("/poll/add").all(requireSignature).post(addPoll);

module.exports = pollsRoutes;
