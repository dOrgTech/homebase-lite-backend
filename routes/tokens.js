const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const tokensRoutes = express.Router();

const {
  addToken,
  getTokenById,
  getVotingPowerAtLevel,
} = require("../components/tokens");

// This section will help you get a single record by id
// This section will help you create a new record.
tokensRoutes.route("/token/add").post(addToken);
// This section will help you get a single record by id
tokensRoutes.route("/token/:id").get(getTokenById);
tokensRoutes
  .route("/network/:network/token/:address/token-id/:tokenID/voting-power")
  .get(getVotingPowerAtLevel);

module.exports = tokensRoutes;
