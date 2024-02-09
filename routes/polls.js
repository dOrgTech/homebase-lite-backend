const express = require("express");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /record.
const pollsRoutes = express.Router();

const { requireSignature } = require("../middlewares");
const { getPollsById, getPollById, addPoll } = require("../components/polls");

/**
 * @swagger
 * /polls/{id}/polls:
 *   get:
 *     summary: Get a specific poll by its ID
 *     tags: [Polls]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the poll
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of the poll
 *       400:
 *         description: Invalid id
 */
pollsRoutes.route("/polls/:id/polls").get(getPollById);
/**
 * @swagger
 * /polls/{id}/list:
 *   get:
 *     summary: Get a list of polls by a specific criterion
 *     tags: [Polls]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The criterion ID to list the polls
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of polls
 *       400:
 *         description: Invalid signature payload
 */
pollsRoutes.route("/polls/:id/list").get(getPollsById);
/**
 * @swagger
 * /poll/add:
 *   post:
 *     summary: Create a new poll
 *     tags: [Polls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pollData:
 *                 type: object
 *                 description: The details of the poll to be created
 *     responses:
 *       200:
 *         description: Poll created successfully
 *       500:
 *         description: Invalid signature payload
 */
pollsRoutes.route("/poll/add").all(requireSignature).post(addPoll);

module.exports = pollsRoutes;
