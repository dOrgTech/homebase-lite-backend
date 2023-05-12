const express = require("express");

const { requireSignature } = require("../middlewares");

const {
  getChoiceById,
  updateChoiceById,
  choicesByUser,
  addChoice,
} = require("../components/choices");

const choicesRoutes = express.Router();
// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/find").get(getChoiceById);
// This section will help you update a record by id.
choicesRoutes
  .route("/update/:id/choice")
  .all(requireSignature)
  .post(updateChoiceById);
// This section will help you get a single record by id (pollID)
choicesRoutes.route("/choices/:id/user").get(choicesByUser);
// This section will help you create a new record.
choicesRoutes.route("/choices/:id/add").all(requireSignature).post(addChoice);

module.exports = choicesRoutes;
