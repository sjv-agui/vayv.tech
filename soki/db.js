// PostgreSQL connection helper for Supabase
// Usage:
//   1. Copy .env.example to .env
//   2. Replace YOUR_PASSWORD with your Supabase DB password
//   3. Install dependencies: npm install pg dotenv
//   4. Import and use query() from this module

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};
