const express = require("express");

const { requireSignature } = require("../middlewares");

const {
  getChoiceById,
  updateChoiceById,
  choicesByUser,
  getPollVotes,
} = require("../components/choices");

const choicesRoutes = express.Router();
/**
 * @swagger
 * /choices/{id}/find:
 *   get:
 *     summary: Get a single choice by its ID (pollID)
 *     tags: [Choices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the choice
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details of the choice
 */
choicesRoutes.route("/choices/:id/find").get(getChoiceById);
/**
 * @swagger
 * /update/choice:
 *   post:
 *     summary: Update a choice by its ID
 *     tags: [Choices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               choiceId:
 *                 type: string
 *               updateData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Choice updated successfully
 */
choicesRoutes
  .route("/update/choice")
  .all(requireSignature)
  .post(updateChoiceById);
/**
 * @swagger
 * /choices/{id}/user:
 *   get:
 *     summary: Get choices by a user's ID
 *     tags: [Choices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The user's ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of choices made by the user
 */
choicesRoutes.route("/choices/:id/user").get(choicesByUser);
/**
 * @swagger
 * /choices/{id}/votes:
 *   get:
 *     summary: Get poll votes for a choice
 *     tags: [Choices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the choice
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vote details for the choice
 */
choicesRoutes.route("/choices/:id/votes").get(getPollVotes);

module.exports = choicesRoutes;
