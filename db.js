const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err);
});

async function initializeDatabase() {
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed:");
    console.error(error.message);
    throw error;
  }
}

initializeDatabase();

module.exports = pool;
