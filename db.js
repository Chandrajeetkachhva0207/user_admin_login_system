const { Pool } = require("pg");


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});


pool.on("connect", () => {
  console.log("PostgreSQL database connected successfully.");
});


pool.on("error", (err) => {
  console.error("PostgreSQL database error:", err);
});


module.exports = pool;
