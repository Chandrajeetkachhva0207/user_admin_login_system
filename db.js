require('dotenv').config();
const mysql = require('mysql2/promise');

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let pool;

if (dbUrl) {
  pool = mysql.createPool(dbUrl);
} else {
  console.warn('WARNING: DATABASE_URL not set! Application requires a valid MySQL connection string.');
  // Create a dummy pool that will fail on query so the app doesn't crash on boot but fails gracefully when connecting.
  pool = mysql.createPool('mysql://dummy:dummy@localhost/dummy');
}

module.exports = pool;
