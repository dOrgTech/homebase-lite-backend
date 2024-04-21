const express = require("express");
const {catchAsync} = require("../services/response.util");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const tokensRoutes = express.Router();

const {
  addToken,
  getTokenById,
  getVotingPowerAtLevel,
} = require("../components/tokens");

/**
 * @swagger
 * /token/add:
 *   post:
 *     summary: Create a new token
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tokenDetails:
 *                 type: object
 *                 description: The details of the token to be created
 *     responses:
 *       200:
 *         description: Token created successfully
 *       400:
 *         description: Invalid token
 */
tokensRoutes.route("/token/add").post(addToken);
/**
 * @swagger
 * /token/{id}:
 *   get:
 *     summary: Get a single token by its ID
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of the token
 *       400:
 *         description: Invalid token id
 */
tokensRoutes.route("/token/:id").get(getTokenById);
/**
 * @swagger
 * /network/{network}/token/{address}/token-id/{tokenID}/voting-power:
 *   get:
 *     summary: Get the voting power at a specific level for a token
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: network
 *         required: true
 *         description: The network of the token
 *         schema:
 *           type: string
 *       - in: path
 *         name: address
 *         required: true
 *         description: The address of the token
 *         schema:
 *           type: string
 *       - in: path
 *         name: tokenID
 *         required: true
 *         description: The ID of the token
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Voting power information for the token
 *       400:
 *         description: Invalid token location
 */
tokensRoutes
  .route("/network/:network/token/:address/token-id/:tokenID/voting-power")
  .get(catchAsync(getVotingPowerAtLevel));

module.exports = tokensRoutes;
