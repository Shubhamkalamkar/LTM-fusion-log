'use strict';

module.exports = {
  port: Number(process.env.PORT || 3000),
  dbMode: (process.env.DB_MODE || 'auto').toLowerCase(), // 'mysql' | 'memory' | 'auto'
  mysql: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'monitor_app',
    password: process.env.DB_PASSWORD || 'monitor_password',
    database: process.env.DB_NAME || 'oracle_monitoring',
    connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 4000)
  },
  secretsManagerSecretId: process.env.DB_SECRET_ARN || '',
  correlationTimeWindowMinutes: Number(process.env.CORRELATION_WINDOW_MINUTES || 15),
  logLevel: process.env.LOG_LEVEL || 'INFO'
};
