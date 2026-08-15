const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs");

// On Vercel, the root filesystem is read-only. We MUST use /tmp for SQLite to work.
// Note: Data in /tmp is ephemeral and will reset when the serverless function sleeps.
let dbPath = path.join(__dirname, "database.sqlite");

if (process.env.VERCEL) {
  const tmpPath = path.join("/tmp", "database.sqlite");
  // If there's an existing database in the repo, copy it to /tmp to seed it
  if (!fs.existsSync(tmpPath) && fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(dbPath, tmpPath);
    } catch (e) {
      console.error("Failed to copy seed database to /tmp", e);
    }
  }
  dbPath = tmpPath;
}

const dbPromise = open({
  filename: dbPath,
  driver: sqlite3.Database
});

module.exports = dbPromise;
