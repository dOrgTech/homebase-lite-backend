const express = require("express");

const {
  createSubscription,
  confirmSubscription,
  unsubscribeSubscription,
  confirmPage,
  unsubscribePage,
} = require("../components/subscriptions");

// recordRoutes is an instance of the express router.
// We use it to define our routes.
const subscriptionsRoutes = express.Router();

/**
 * @swagger
 * /subscriptions:
 *   post:
 *     summary: Subscribe an email address to alerts for a DAO
 *     tags: [Subscriptions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, daoAddress, network]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email address to send alerts to
 *               daoAddress:
 *                 type: string
 *                 description: Tezos contract address of the DAO (KT1...)
 *               network:
 *                 type: string
 *                 description: Network the DAO lives on (mainnet, ghostnet, shadownet)
 *     responses:
 *       200:
 *         description: Request accepted, a confirmation email was sent if needed
 *       400:
 *         description: Invalid email, DAO address or network
 *       429:
 *         description: Too many subscription requests for this email
 */
subscriptionsRoutes.route("/subscriptions").post(createSubscription);

/**
 * @swagger
 * /subscriptions/confirm/{token}:
 *   get:
 *     summary: Page with a button that confirms the subscription (changes nothing by itself)
 *   post:
 *     summary: Confirm an email subscription
 *     tags: [Subscriptions]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         description: The confirmation token from the subscription email
 *         schema:
 *           type: string
 *     responses:
 *       303:
 *         description: Redirect to the DAO page, or to the app root for an unknown token
 */
// GET only shows a page: link scanners in mail filters fetch every link in an email, and a
// confirmation they trigger would subscribe an address its owner never confirmed.
subscriptionsRoutes
  .route("/subscriptions/confirm/:token")
  .get(confirmPage)
  .post(confirmSubscription);

/**
 * @swagger
 * /subscriptions/unsubscribe/{token}:
 *   get:
 *     summary: Page with a button that removes the subscription (changes nothing by itself)
 *   post:
 *     summary: Remove an email subscription (also mail clients' one-click unsubscribe)
 *     tags: [Subscriptions]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         description: The unsubscribe token from any alert email
 *         schema:
 *           type: string
 *     responses:
 *       303:
 *         description: Redirect to the DAO page, or to the app root for an unknown token
 */
subscriptionsRoutes
  .route("/subscriptions/unsubscribe/:token")
  .get(unsubscribePage)
  .post(unsubscribeSubscription);

module.exports = subscriptionsRoutes;
