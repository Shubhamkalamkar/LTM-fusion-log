'use strict';

const { getDbAdapter } = require('../db/dbClient');

module.exports = {
  async listExecutions(filters) {
    const db = await getDbAdapter();
    return db.listFusionExecutions(filters);
  },

  async getExecutionById(executionId) {
    const db = await getDbAdapter();
    return db.getFusionExecutionById(executionId);
  }
};
