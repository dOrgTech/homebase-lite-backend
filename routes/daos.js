const express = require("express");

// This will help us connect to the database
const { requireSignature } = require("../middlewares");
const {
  getAllLiteOnlyDAOs,
  getDAOFromContractAddress,
  getDAOById,
  createDAO,
  joinDAO,
  updateTotalHolders,
  updateTotalCount
} = require("../components/daos");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const daoRoutes = express.Router();
/**
 * @swagger
 * /daos/join:
 *   post:
 *     summary: Join a DAO
 *     tags: [DAOs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daoId:
 *                 type: string
 *                 description: The ID of the DAO to join
 *     responses:
 *       200:
 *         description: Successfully joined the DAO
 *       500:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos/join").all(requireSignature).post(joinDAO);
/**
 * @swagger
 * /dao/add:
 *   post:
 *     summary: Create a new DAO
 *     tags: [DAOs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daoDetails:
 *                 type: object
 *                 description: The details of the DAO to be created
 *     responses:
 *       200:
 *         description: DAO created successfully
 *       500:
 *         description: Invalid signature payload
 */
daoRoutes.route("/dao/add").all(requireSignature).post(createDAO);
/**
 * @swagger
 * /daos:
 *   post:
 *     summary: Get a list of all DAOs
 *     tags: [DAOs]
 *     responses:
 *       200:
 *         description: A list of DAOs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos").post(getAllLiteOnlyDAOs);
/**
 * @swagger
 * /daos/contracts/{daoContract}:
 *   post:
 *     summary: Get a DAO from its contract address
 *     tags: [DAOs]
 *     parameters:
 *       - in: path
 *         name: daoContract
 *         required: true
 *         description: The contract address of the DAO
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of the DAO
 *       400:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos/contracts/:daoContract").post(getDAOFromContractAddress);
/**
 * @swagger
 * /daos/{id}:
 *   get:
 *     summary: Get a single DAO by its ID
 *     tags: [DAOs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the DAO
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of the DAO
 *       400:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos/:id").get(getDAOById);
/**
 * @swagger
 * /daos/create/voting:
 *   get:
 *     summary: Add a new field to DAO Collection
 *     tags: [DAOs]
 *     responses:
 *       200:
 *         description: New field added to DAO Collection
 *       400:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos/create/voting").get(updateTotalHolders);
/**
 * @swagger
 * /daos/count/{id}:
 *   post:
 *     summary: Update total voting addresses count in a DAO
 *     tags: [DAOs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the DAO for which to update the count
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newCount:
 *                 type: integer
 *                 description: The new total count of voting addresses
 *     responses:
 *       200:
 *         description: Total voting addresses count updated
 *       400:
 *         description: Invalid signature payload
 */
daoRoutes.route("/daos/count/:id").post(updateTotalCount);


module.exports = daoRoutes;
