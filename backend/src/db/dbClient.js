'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { testConnection } = require('./pool');
const { MySqlAdapter } = require('./mysqlAdapter');
const { MemoryAdapter } = require('./memoryAdapter');

let activeAdapter = null;
let activeMode = null;

/**
 * Used by: All repositories (fusionRepository, oicRepository, incidentRepository, dashboardRepository)
 * across every API endpoint and Lambda handler.
 * Selects and caches either MySqlAdapter or MemoryAdapter based on DB_MODE ('mysql' | 'memory' | 'auto').
 */
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

/**
 * Used by: GET /dashboard/metadata, GET /dashboard/summary, and GET /health
 * Returns the active store mode ('mysql' or 'memory') displayed in the UI topbar.
 */
function getActiveDbMode() {
  return activeMode || env.dbMode;
}

/**
 * Used by: backend/tests/api.test.js (beforeEach hook)
 * Swaps or resets the cached DB adapter so each unit test runs against clean state.
 */
function resetDbAdapterForTest(customAdapter = null, modeName = 'memory') {
  activeAdapter = customAdapter;
  activeMode = customAdapter ? modeName : null;
}

module.exports = {
  getDbAdapter,
  getActiveDbMode,
  resetDbAdapterForTest
};
