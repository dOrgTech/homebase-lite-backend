const express = require("express");

// This will help us connect to the database
const { requireSignature } = require("../middlewares");
const {
  getAllLiteOnlyDAOs,
  getDAOFromContractAddress,
  getDAOById,
  createDAO,
  joinDAO,
} = require("../components/daos");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const daoRoutes = express.Router();
// This section will help you update a record by id.
daoRoutes.route("/daos/join").all(requireSignature).post(joinDAO);
// This section will help you create a new record.
daoRoutes.route("/dao/add").all(requireSignature).post(createDAO);
// This section will help you get a list of all the records.
daoRoutes.route("/daos").post(getAllLiteOnlyDAOs);
daoRoutes.route("/daos/contracts/:daoContract").post(getDAOFromContractAddress);
// This section will help you get a single record by id
daoRoutes.route("/daos/:id").get(getDAOById);

module.exports = daoRoutes;
