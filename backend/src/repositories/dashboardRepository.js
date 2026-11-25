'use strict';

const { getDbAdapter, getActiveDbMode } = require('../db/dbClient');

module.exports = {
  async getSummaryDataset(filters) {
    const db = await getDbAdapter();
    return db.getDashboardSummary(filters);
  },

  async getMetadata() {
    const db = await getDbAdapter();
    const meta = await db.getMetadata();
    return { ...meta, activeDbMode: getActiveDbMode() };
  },

  async getSeverityRules() {
    const db = await getDbAdapter();
    return db.getSeverityRules();
  },

  async insertSimulatedExecution(payload) {
    const db = await getDbAdapter();
    return db.insertSimulatedExecution(payload);
  },

  async getNextIds() {
    const db = await getDbAdapter();
    return db.getNextIds();
  }
};
