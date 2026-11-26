'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');

let pool = null;

/**
 * Returns a reused MySQL connection pool across warm Lambda invocations.
 * Credentials are supplied at runtime via environment variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
 */
async function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    waitForConnections: true,
    connectionLimit: env.mysql.connectionLimit,
    queueLimit: 0,
    connectTimeout: env.mysql.connectTimeout,
    dateStrings: true
  });
  return pool;
}

async function testConnection() {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testConnection,
  closePool
};
