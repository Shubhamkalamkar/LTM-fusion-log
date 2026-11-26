'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Update these credentials or set DB_HOST / DB_PORT / DB_USER / DB_PASSWORD env vars
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'monitor_app',
  password: process.env.DB_PASSWORD || 'monitor_password',
  multipleStatements: true,
  connectTimeout: 10000
};

async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath = path.join(__dirname, 'seed.sql');

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const seedSql = fs.readFileSync(seedPath, 'utf8');

  console.log(`Connecting to MySQL at ${DB_CONFIG.host}:${DB_CONFIG.port} as '${DB_CONFIG.user}'...`);
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    console.log('Running schema.sql...');
    await conn.query(schemaSql);
    console.log('Database and tables created successfully.');

    console.log('Running seed.sql...');
    await conn.query(seedSql);
    console.log('Seed data inserted successfully.');

    const [counts] = await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM oracle_monitoring.severity_rules) AS severity_rules,
        (SELECT COUNT(*) FROM oracle_monitoring.downstream_systems) AS downstream_systems,
        (SELECT COUNT(*) FROM oracle_monitoring.fusion_jobs) AS fusion_jobs,
        (SELECT COUNT(*) FROM oracle_monitoring.fusion_job_executions) AS fusion_executions,
        (SELECT COUNT(*) FROM oracle_monitoring.oic_integrations) AS oic_integrations,
        (SELECT COUNT(*) FROM oracle_monitoring.oic_integration_executions) AS oic_executions,
        (SELECT COUNT(*) FROM oracle_monitoring.failure_incidents) AS incidents,
        (SELECT COUNT(*) FROM oracle_monitoring.incident_history) AS incident_history
    `);

    console.log('Verified row counts:', counts[0]);
  } finally {
    await conn.end();
  }
}

initDatabase().catch((err) => {
  console.error('Database initialization failed:', err.code || err.message);
  process.exit(1);
});
