'use strict';

const { getDbAdapter } = require('../db/dbClient');

module.exports = {
  async listIncidents(filters) {
    const db = await getDbAdapter();
    return db.listIncidents(filters);
  },

  async getIncidentById(incidentId) {
    const db = await getDbAdapter();
    return db.getIncidentById(incidentId);
  },

  async updateStatus(incidentId, status, meta) {
    const db = await getDbAdapter();
    return db.updateIncidentStatus(incidentId, status, meta);
  },

  async retryIncident(incidentId, meta) {
    const db = await getDbAdapter();
    return db.retryIncident(incidentId, meta);
  },

  async findCorrelatedExecutions(params) {
    const db = await getDbAdapter();
    return db.findCorrelatedExecutions(params);
  }
};
