'use strict';

const { MySqlAdapter } = require('./mysqlAdapter');

let adapter = null;

/**
 * Returns the shared MySQL data adapter instance across Lambda invocations.
 */
async function getDbAdapter() {
  if (!adapter) {
    adapter = new MySqlAdapter();
  }
  return adapter;
}

module.exports = { getDbAdapter };
