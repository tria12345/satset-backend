require('dotenv').config();
const mysql = require('mysql2/promise');

let dbHost = process.env.DB_HOST || 'localhost';
let dbPort = process.env.DB_PORT || 3306;

// Jika DB_HOST mengandung port (misal: host.com:27157)
if (dbHost.includes(':')) {
  const parts = dbHost.split(':');
  dbHost = parts[0];
  dbPort = parseInt(parts[1], 10);
}

const pool = mysql.createPool({
  host: dbHost,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'satset_db',
  port: dbPort,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
