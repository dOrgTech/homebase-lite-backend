const express = require("express");
const cors = require("cors");
const { securePayload } = require("./middlewares");
const { connectToMongoose } = require("./db/mongoose-connection");

if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config({ path: "./config.env" });
}

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

// Apply XSS protection middleware globally
app.use(securePayload);

// Lightweight request logger for debug correlation
app.use((req, res, next) => {
  // create a short request id for correlation
  req.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const start = Date.now();
  console.log("[req:start]", {
    reqId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });
  res.on("finish", () => {
    console.log("[req:end]", {
      reqId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// Include Swagger route at the base URL
app.use('/', require('./routes/swagger'));

// Other routes are included after the Swagger route
app.use(require("./routes/daos"));
app.use(require("./routes/polls"));
app.use(require("./routes/tokens"));
app.use(require("./routes/choices"));
app.use(require("./routes/blocks"));
app.use(require("./routes/aci"));

// Global error handler to avoid crashing without logs
// Place after routes to catch any unhandled errors
app.use((err, req, res, next) => {
  const reqId = req?.id || "no-reqid";
  console.error("[global-error]", {
    reqId,
    method: req?.method,
    url: req?.originalUrl,
    error: err?.message,
    stack: err?.stack,
    bodyKeys: req?.body ? Object.keys(req.body) : [],
  });
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});

if (require.main === module) {
  app.listen(port, async () => {
    try {
      await connectToMongoose();
      console.log(`Server is running on port: ${port}`);
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  });
}

module.exports = { app, connectToMongoose };
