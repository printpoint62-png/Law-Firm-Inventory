
"use strict";

const express = require("express");
const path = require("path");

const helmet = require("helmet");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const pool = require("./config/db");

const app = express();

app.disable("x-powered-by");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const PgSessionStore = connectPgSimple(session);

app.use(
  session({
    store: new PgSessionStore({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    name: "lawfirm.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Authentication routes
app.use("/api/auth", require("./routes/auth"));

// Dashboard routes
app.use("/api/dashboard", require("./routes/dashboard"));

// Clients Master routes
app.use("/api/clients", require("./routes/clients"));

// Files Master routes
app.use("/api/files", require("./routes/files"));

// Categories Master routes
app.use("/api/categories", require("./routes/categories"));

// Brands Master routes
app.use("/api/brands", require("./routes/brands"));

// Units Master routes
app.use("/api/units", require("./routes/units"));

// Products Master routes
app.use("/api/products", require("./routes/products"));

app.use(
  "/api/vendors",
  (req, res, next) => {
    console.log("VENDORS ROUTE HIT:", req.method, req.originalUrl);
    next();
  },
  require("./routes/vendors")
);

app.use("/api/purchases", require("./routes/purchases"));

app.use("/api/consumption", require("./routes/consumption"));

app.use("/api/users", require("./routes/userManagement"));

// Stock Ledger routes — NEW
app.use("/api/ledger", require("./routes/ledger"));

app.use("/api/reports", require("./routes/reports"));

app.use("/api/audit-logs", require("./routes/auditLogs"));

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      success: true,
      message: "Application and database are running.",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      success: false,
      message: "Database is temporarily unavailable.",
    });
  }
});

// Serve frontend files
app.use(express.static(path.join(__dirname, "..", "public")));

// Handle unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  res.status(status).json({
    success: false,
    message:
      status === 500
        ? "An unexpected server error occurred."
        : error.message,
  });
});

module.exports = app;
