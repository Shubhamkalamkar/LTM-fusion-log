'use strict';

const { getDbAdapter } = require('../db/dbClient');

module.exports = {
  async listExecutions(filters) {
    const db = await getDbAdapter();
    return db.listOicExecutions(filters);
  },

  async getExecutionById(instanceId) {
    const db = await getDbAdapter();
    return db.getOicExecutionById(instanceId);
  }
};
