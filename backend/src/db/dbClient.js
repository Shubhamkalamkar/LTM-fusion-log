'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { testConnection } = require('./pool');
const { MySqlAdapter } = require('./mysqlAdapter');
const { MemoryAdapter } = require('./memoryAdapter');

let activeAdapter = null;
let activeMode = null;

async function getDbAdapter() {
  if (activeAdapter) return activeAdapter;

  if (env.dbMode === 'memory') {
    activeAdapter = new MemoryAdapter();
    activeMode = 'memory';
    logger.info({ message: 'Database adapter initialized', mode: 'memory' });
    return activeAdapter;
  }

  if (env.dbMode === 'mysql') {
    activeAdapter = new MySqlAdapter();
    activeMode = 'mysql';
    logger.info({ message: 'Database adapter initialized', mode: 'mysql' });
    return activeAdapter;
  }

  // 'auto' mode: try MySQL first, fall back cleanly to in-memory dataset for zero-DB demo
  try {
    await testConnection();
    activeAdapter = new MySqlAdapter();
    activeMode = 'mysql';
    logger.info({ message: 'Connected to MySQL successfully', mode: 'mysql' });
  } catch (err) {
    activeAdapter = new MemoryAdapter();
    activeMode = 'memory';
    logger.warn({
      message: 'MySQL unreachable in auto mode; using built-in simulated in-memory store',
      reason: err.code || err.message
    });
  }

  return activeAdapter;
}

function getActiveDbMode() {
  return activeMode || env.dbMode;
}

function resetDbAdapterForTest(customAdapter = null, modeName = 'memory') {
  activeAdapter = customAdapter;
  activeMode = customAdapter ? modeName : null;
}

module.exports = {
  getDbAdapter,
  getActiveDbMode,
  resetDbAdapterForTest
};
