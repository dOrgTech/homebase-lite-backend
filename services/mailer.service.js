const nodemailer = require("nodemailer");

const DEFAULT_MAIL_FROM = "Homebase Alerts <alerts@tezos-homebase.io>";

let cachedTransport = null;

/**
 * Public URLs used to build links inside outgoing mail.
 * APP_URL points at the frontend, PUBLIC_API_URL at this backend.
 */
const getAppUrl = () =>
  (process.env.APP_URL || "https://tezos-homebase.io").replace(/\/+$/, "");

const getPublicApiUrl = () =>
  (process.env.PUBLIC_API_URL || "https://homebase-backend.netlify.app").replace(
    /\/+$/,
    ""
  );

const isMailEnabled = () => Boolean(process.env.SMTP_HOST);

const getTransport = () => {
  if (cachedTransport) return cachedTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  const options = {
    host: process.env.SMTP_HOST,
    port,
    // Port 465 is implicit TLS, everything else uses STARTTLS.
    secure: port === 465,
  };

  if (process.env.SMTP_USER || process.env.SMTP_PASS) {
    options.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    };
  }

  cachedTransport = nodemailer.createTransport(options);
  return cachedTransport;
};

/**
 * Send one email. When SMTP_HOST is not configured this is a no-op so that
 * local development and the test suite never try to open a real connection.
 *
 * @param {object} params
 * @param {string} params.to Recipient address
 * @param {string} params.subject Subject line
 * @param {string} [params.text] Plain text body
 * @param {string} [params.html] HTML body
 * @param {object} [params.headers] Extra headers, e.g. List-Unsubscribe
 * @returns {Promise<{skipped: boolean, messageId?: string, error?: string}>}
 */
const sendMail = async ({ to, subject, text, html, headers }) => {
  if (!isMailEnabled()) {
    console.log("[mailer:skipped]", { to, subject, reason: "SMTP_HOST is not set" });
    return { skipped: true };
  }

  try {
    const info = await getTransport().sendMail({
      from: process.env.MAIL_FROM || DEFAULT_MAIL_FROM,
      to,
      subject,
      text,
      html,
      headers,
    });
    console.log("[mailer:sent]", { to, subject, messageId: info?.messageId });
    return { skipped: false, messageId: info?.messageId };
  } catch (error) {
    // Mail delivery must never break the request that triggered it.
    console.error("[mailer:error]", { to, subject, error: error?.message });
    return { skipped: false, error: error?.message };
  }
};

module.exports = {
  sendMail,
  isMailEnabled,
  getAppUrl,
  getPublicApiUrl,
};
