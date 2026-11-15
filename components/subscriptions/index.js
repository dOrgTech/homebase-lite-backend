const crypto = require("crypto");

const { validateAddress, ValidationResult } = require("@taquito/utils");

const SubscriptionModel = require("../../db/models/Subscription.model");
const SubscriptionRequestModel = require("../../db/models/SubscriptionRequest.model");
const { resolveDaoName } = require("../../services/dao-name.service");
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
// Mails per hour across all callers before the endpoint stops sending. This
// caps what an abuser can do to the sending domain's reputation.
const GLOBAL_RATE_LIMIT_MAX = Number(process.env.SUBSCRIPTION_MAILS_PER_HOUR || 300);
const GLOBAL_KEY = "*";

/**
 * Throttle key for an email address. Mail providers deliver a+b@x and a@x,
 * and (for Gmail) a.b@x and ab@x, to the same inbox, so those variants
 * share one bucket; otherwise one inbox could be flooded through aliases.
 */
const throttleKey = (email) => {
  const [local = "", domain = ""] = String(email).toLowerCase().split("@");
  let base = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") base = base.replace(/\./g, "");
  return `${base}@${domain}`;
};

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

/**
 * Durable throttle, shared by every instance: counts the requests that sent
 * mail in the last hour for this key and for everyone.
 */
const isRateLimitedDurable = async (key) => {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [forKey, total] = await Promise.all([
    SubscriptionRequestModel.countDocuments({ key, createdAt: { $gte: since } }),
    SubscriptionRequestModel.countDocuments({ createdAt: { $gte: since } }),
  ]);
  return forKey >= RATE_LIMIT_MAX || total >= GLOBAL_RATE_LIMIT_MAX;
};

const recordRequest = (key) => SubscriptionRequestModel.create({ key });

const resetRateLimit = () => {
  rateLimitBuckets.clear();
  return SubscriptionRequestModel.deleteMany({}).catch(() => {});
};

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

  const key = throttleKey(normalizedEmail);
  if (isRateLimited(key)) {
    return response.status(429).json({ message: "Too many subscription requests" });
  }

  try {
    if (await isRateLimitedDurable(key)) {
      return response.status(429).json({ message: "Too many subscription requests" });
    }
    // The name shown in the email comes from the indexer, never from the
    // request, so nobody can put their own text into mail from this domain.
    const daoName = await resolveDaoName(normalizedNetwork, daoAddress);
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
      await recordRequest(key);
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
      await recordRequest(key);
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.log("error: ", error);
    return response.status(400).send({
      message: error.message,
    });
  }
};

// The links in our emails open these pages. A GET changes nothing: mail filters and link
// scanners fetch every link they see, so the change happens only when the reader presses the
// button, which POSTs back to the same URL with ?via=page.
const actionPage = ({ title, text, button }) =>
  [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;",
    "background:#1c1f23;color:#fff;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
    "main{max-width:420px;padding:32px 24px;text-align:center}",
    "h1{font-size:22px;margin:0 0 12px}p{color:#bfc5ca;margin:0 0 24px}",
    "button{background:#81feb7;color:#1c1f23;border:0;border-radius:4px;padding:12px 28px;",
    "font:inherit;font-weight:600;cursor:pointer}",
    "</style></head><body><main>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(text)}</p>`,
    '<form method="post" action="?via=page">',
    `<button type="submit">${escapeHtml(button)}</button>`,
    "</form></main></body></html>",
  ].join("\n");

const sendActionPage = (response, page) =>
  response
    .status(200)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The token is in the URL: never pass it on to another site.
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    })
    .send(actionPage(page));

/**
 * GET /subscriptions/confirm/:token
 */
const confirmPage = (req, response) =>
  sendActionPage(response, {
    title: "Confirm Homebase alerts",
    text: "Press the button to start receiving email alerts for this DAO.",
    button: "Confirm subscription",
  });

/**
 * GET /subscriptions/unsubscribe/:token
 */
const unsubscribePage = (req, response) =>
  sendActionPage(response, {
    title: "Unsubscribe from Homebase alerts",
    text: "Press the button to stop receiving email alerts for this DAO.",
    button: "Unsubscribe",
  });

/**
 * POST /subscriptions/confirm/:token
 */
const confirmSubscription = async (req, response) => {
  const { token } = req.params;

  try {
    const subscription = await SubscriptionModel.findOne({ confirmToken: token });

    if (!subscription) {
      return response.redirect(303, `${getAppUrl()}/explorer/daos?alerts=invalid`);
    }

    if (!subscription.confirmed) {
      subscription.confirmed = true;
      subscription.confirmedAt = new Date();
      await subscription.save();
    }

    return response.redirect(
      303,
      `${getAppUrl()}/explorer/dao/${subscription.daoAddress}?alerts=confirmed`
    );
  } catch (error) {
    console.log("error: ", error);
    return response.redirect(303, `${getAppUrl()}/explorer/daos?alerts=invalid`);
  }
};

/**
 * POST /subscriptions/unsubscribe/:token
 * From the page (?via=page) it redirects to the app; without it, it is a mail client's
 * one-click unsubscribe (RFC 8058) and answers 200.
 */
const unsubscribeSubscription = async (req, response) => {
  const { token } = req.params;
  const oneClick = req.query.via !== "page";

  try {
    const subscription = await SubscriptionModel.findOneAndDelete({
      unsubscribeToken: token,
    });

    if (oneClick) {
      return response.status(200).json({ ok: true });
    }
    if (!subscription) {
      return response.redirect(303, `${getAppUrl()}/explorer/daos?alerts=invalid`);
    }

    return response.redirect(
      303,
      `${getAppUrl()}/explorer/dao/${subscription.daoAddress}?alerts=unsubscribed`
    );
  } catch (error) {
    console.log("error: ", error);
    if (oneClick) {
      return response.status(200).json({ ok: true });
    }
    return response.redirect(303, `${getAppUrl()}/explorer/daos?alerts=invalid`);
  }
};

module.exports = {
  createSubscription,
  confirmSubscription,
  unsubscribeSubscription,
  confirmPage,
  unsubscribePage,
  SUPPORTED_NETWORKS,
  unsubscribeUrl,
  confirmUrl,
  resetRateLimit,
  throttleKey,
};
