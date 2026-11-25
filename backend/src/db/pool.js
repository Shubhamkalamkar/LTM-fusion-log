'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');
const logger = require('../utils/logger');

let pool = null;

/**
 * Resolves DB credentials from environment variables or optional AWS Secrets Manager.
 * Never hard-codes production credentials in source code.
 */
async function resolveDbConfig() {
  if (env.secretsManagerSecretId && process.env.AWS_REGION) {
    try {
      // Optional lazy AWS SDK load when deployed in AWS Lambda with DB_SECRET_ARN
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
      const res = await client.send(new GetSecretValueCommand({ SecretId: env.secretsManagerSecretId }));
      const parsed = JSON.parse(res.SecretString);
      return {
        host: parsed.host || env.mysql.host,
        port: Number(parsed.port || env.mysql.port),
        user: parsed.username || env.mysql.user,
        password: parsed.password,
        database: parsed.dbname || env.mysql.database,
        connectionLimit: env.mysql.connectionLimit,
        connectTimeout: env.mysql.connectTimeout
      };
    } catch (err) {
      logger.warn({ message: 'Secrets Manager lookup skipped or failed; falling back to env config', reason: err.message });
    }
  }
  return env.mysql;
}

/**
 * Returns a reused MySQL connection pool across warm Lambda invocations.
 */
async function getPool() {
  if (pool) return pool;
  const cfg = await resolveDbConfig();
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: cfg.connectionLimit,
    queueLimit: 0,
    connectTimeout: cfg.connectTimeout,
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
