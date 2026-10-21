
require("dotenv").config();

const app = require("./app");
const pool = require("./config/db");

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.SESSION_SECRET) {
  console.error("Startup failed: SESSION_SECRET is missing.");
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`Law Firm Inventory server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down safely...`);

  server.close(async () => {
    try {
      await pool.end();
      console.log("Server and database pool closed.");
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
