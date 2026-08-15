require('dotenv').config();
const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  // Use production database if DATABASE_URL is provided
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });
} else {
  // Fallback to local SQLite for development or ephemeral Vercel usage
  sequelize = new Sequelize({
    dialect: 'sqlite',
    // Vercel only allows writing to /tmp
    storage: process.env.VERCEL ? '/tmp/database.sqlite' : 'database.sqlite',
    logging: false, // Disable logging; set to console.log to see SQL queries
  });
}

module.exports = sequelize;
