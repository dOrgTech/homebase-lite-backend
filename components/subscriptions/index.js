const crypto = require("crypto");

const { validateAddress, ValidationResult } = require("@taquito/utils");

const SubscriptionModel = require("../../db/models/Subscription.model");
const {
  sendMail,
  getAppUrl,
  getPublicApiUrl,
} = require("../../services/mailer.service");

// Networks the app supports for Tezos DAO alerts.
const SUPPORTED_NETWORKS = ["mainnet", "ghostnet", "shadownet"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Per-email throttle for subscription requests.
 *
 * NOTE: this map lives in the memory of a single serverless container, so it
 * only throttles requests that happen to reach the same warm instance and it
 * is reset on every cold start. It is a cheap first line of defence against
 * accidental loops and casual abuse, not a real rate limiter. A durable
 * limiter would need a shared store (Mongo TTL collection or Redis).
 */
const rateLimitBuckets = new Map();

const isRateLimited = (email) => {
  const now = Date.now();
  const hits = (rateLimitBuckets.get(email) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(email, hits);
    return true;
  }

  hits.push(now);
  rateLimitBuckets.set(email, hits);

  // Opportunistic cleanup so the map does not grow without bound.
  if (rateLimitBuckets.size > 5000) {
    for (const [key, timestamps] of rateLimitBuckets) {
      if (timestamps.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        rateLimitBuckets.delete(key);
      }
    }
  }

  return false;
};

const resetRateLimit = () => rateLimitBuckets.clear();

const generateToken = () => crypto.randomBytes(32).toString("hex");

const isValidEmail = (email) =>
  typeof email === "string" && email.length <= 254 && EMAIL_REGEX.test(email.trim());

const isValidContractAddress = (address) =>
  typeof address === "string" &&
  address.startsWith("KT1") &&
  validateAddress(address) === ValidationResult.VALID;

const isSupportedNetwork = (network) =>
  typeof network === "string" && SUPPORTED_NETWORKS.includes(network.toLowerCase());

const unsubscribeUrl = (token) =>
  `${getPublicApiUrl()}/subscriptions/unsubscribe/${token}`;

const confirmUrl = (token) =>
  `${getPublicApiUrl()}/subscriptions/confirm/${token}`;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Optional display name sent by the frontend; plain text only, kept short.
const cleanDaoName = (value) =>
  typeof value === "string"
    ? value.replace(/[\r\n\t<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
    : "";

const buildConfirmationEmail = ({ daoName, daoAddress, network, confirmToken, unsubscribeToken }) => {
  const confirmLink = confirmUrl(confirmToken);
  const unsubLink = unsubscribeUrl(unsubscribeToken);
  const daoLabel = daoName ? `${daoName} (${daoAddress})` : daoAddress;
  const explanation = `You asked to receive Homebase alerts for the DAO ${daoLabel} on ${network}.`;

  const text = [
    explanation,
    "",
    `Confirm your subscription: ${confirmLink}`,
    "",
    "If you did not request this, ignore this email and nothing will be sent.",
    `Unsubscribe: ${unsubLink}`,
  ].join("\n");

  const html = [
    `<p>${escapeHtml(explanation)}</p>`,
    `<p><a href="${confirmLink}">Confirm your subscription</a></p>`,
    "<p>If you did not request this, ignore this email and nothing will be sent.</p>",
    `<p><a href="${unsubLink}">Unsubscribe</a></p>`,
  ].join("\n");

  return {
    // Timestamp keeps each confirmation in its own mail thread; Gmail otherwise
    // groups same-subject emails and shows the oldest (possibly dead) link first.
    subject: `Confirm Homebase alerts for ${daoName || daoAddress} (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};

const buildAlreadySubscribedEmail = ({ daoName, daoAddress, network, unsubscribeToken }) => {
  const unsubLink = unsubscribeUrl(unsubscribeToken);
  const daoLabel = daoName ? `${daoName} (${daoAddress})` : daoAddress;
  const explanation = `This address is already subscribed to Homebase alerts for the DAO ${daoLabel} on ${network}. Nothing changed and you will keep receiving alerts as before.`;

  const text = [
    explanation,
    "",
    "If you did not request this, you can ignore this email.",
    `Unsubscribe: ${unsubLink}`,
  ].join("\n");

  const html = [
    `<p>${escapeHtml(explanation)}</p>`,
    "<p>If you did not request this, you can ignore this email.</p>",
    `<p><a href="${unsubLink}">Unsubscribe</a></p>`,
  ].join("\n");

  return {
    subject: `You are already subscribed to Homebase alerts for ${daoName || daoAddress}`,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};

/**
 * POST /subscriptions
 * Always answers 200 { ok: true } for well formed input so that the endpoint
 * cannot be used to probe whether an address is already subscribed.
 */
const createSubscription = async (req, response) => {
  const { email, daoAddress, network } = req.body || {};
  const daoName = cleanDaoName((req.body || {}).daoName);

  if (!isValidEmail(email)) {
    return response.status(400).json({ message: "Invalid email address" });
  }
  if (!isValidContractAddress(daoAddress)) {
    return response.status(400).json({ message: "Invalid DAO contract address" });
  }
  if (!isSupportedNetwork(network)) {
    return response.status(400).json({ message: "Invalid network" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedNetwork = network.toLowerCase();

  if (isRateLimited(normalizedEmail)) {
    return response.status(429).json({ message: "Too many subscription requests" });
  }

  try {
    let subscription = await SubscriptionModel.findOne({
      email: normalizedEmail,
      daoAddress,
      network: normalizedNetwork,
    });

    if (!subscription) {
      subscription = await SubscriptionModel.create({
        email: normalizedEmail,
        daoAddress,
        network: normalizedNetwork,
        confirmed: false,
        confirmToken: generateToken(),
        unsubscribeToken: generateToken(),
      });
    } else if (!subscription.confirmed) {
      // Keep the existing confirmation token: mail clients thread repeated
      // confirmation emails together and often surface the older one, so a
      // rotated token would turn the visible link into a dead one.
      if (!subscription.confirmToken) {
        subscription.confirmToken = generateToken();
      }
      if (!subscription.unsubscribeToken) {
        subscription.unsubscribeToken = generateToken();
      }
      if (subscription.isModified()) {
        await subscription.save();
      }
    }

    if (!subscription.confirmed) {
      const mail = buildConfirmationEmail({
        daoName,
        daoAddress: subscription.daoAddress,
        network: subscription.network,
        confirmToken: subscription.confirmToken,
        unsubscribeToken: subscription.unsubscribeToken,
      });
      await sendMail({ to: subscription.email, ...mail });
    } else {
      // Tell the mailbox owner rather than the page visitor, so the HTTP
      // response stays identical and reveals nothing about the address.
      const mail = buildAlreadySubscribedEmail({
        daoName,
        daoAddress: subscription.daoAddress,
        network: subscription.network,
        unsubscribeToken: subscription.unsubscribeToken,
      });
      await sendMail({ to: subscription.email, ...mail });
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.log("error: ", error);
    return response.status(400).send({
      message: error.message,
    });
  }
};

/**
 * GET /subscriptions/confirm/:token
 */
const confirmSubscription = async (req, response) => {
  const { token } = req.params;

  try {
    const subscription = await SubscriptionModel.findOne({ confirmToken: token });

    if (!subscription) {
      return response.redirect(302, `${getAppUrl()}/explorer/daos?alerts=invalid`);
    }

    if (!subscription.confirmed) {
      subscription.confirmed = true;
      subscription.confirmedAt = new Date();
      await subscription.save();
    }

    return response.redirect(
      302,
      `${getAppUrl()}/explorer/dao/${subscription.daoAddress}?alerts=confirmed`
    );
  } catch (error) {
    console.log("error: ", error);
    return response.redirect(302, `${getAppUrl()}/explorer/daos?alerts=invalid`);
  }
};

/**
 * GET /subscriptions/unsubscribe/:token
 */
const unsubscribeSubscription = async (req, response) => {
  const { token } = req.params;

  try {
    const subscription = await SubscriptionModel.findOneAndDelete({
      unsubscribeToken: token,
    });

    if (!subscription) {
      return response.redirect(302, `${getAppUrl()}/explorer/daos?alerts=invalid`);
    }

    return response.redirect(
      302,
      `${getAppUrl()}/explorer/dao/${subscription.daoAddress}?alerts=unsubscribed`
    );
  } catch (error) {
    console.log("error: ", error);
    return response.redirect(302, `${getAppUrl()}/explorer/daos?alerts=invalid`);
  }
};

module.exports = {
  createSubscription,
  confirmSubscription,
  unsubscribeSubscription,
  SUPPORTED_NETWORKS,
  unsubscribeUrl,
  confirmUrl,
  resetRateLimit,
};
