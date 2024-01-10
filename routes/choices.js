const express = require("express");

const { requireSignature } = require("../middlewares");

const {
  getChoiceById,
  updateChoiceById,
  choicesByUser,
  getPollVotes,
  votesByUser
} = require("../components/choices");

const choicesRoutes = express.Router();
// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/find").get(getChoiceById);
// This section will help you update a record by id.
choicesRoutes
  .route("/update/choice")
  .all(requireSignature)
  .post(updateChoiceById);
// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/user_votes").get(votesByUser);

choicesRoutes.route("/choices/:id/user").get(choicesByUser);
choicesRoutes.route("/choices/:id/votes").get(getPollVotes);

module.exports = choicesRoutes;
