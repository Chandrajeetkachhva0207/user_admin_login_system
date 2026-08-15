require('dotenv').config();
const { Sequelize } = require('sequelize');

// Initialize Sequelize to connect to local SQLite database
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite',
  logging: false, // Disable logging; set to console.log to see SQL queries
});

module.exports = sequelize;
