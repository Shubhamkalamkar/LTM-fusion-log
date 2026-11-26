'use strict';

const { getDbAdapter } = require('../db/dbClient');

/**
 * Data-access repository for failure incidents, audit history, and correlation lookups.
 * Delegates queries to the active DB adapter (MySqlAdapter or MemoryAdapter).
 */
module.exports = {
  /**
   * Used by: incidentService.listIncidents() -> GET /incidents
   * Returns filtered and paginated failure incidents joined with downstream system info.
   */
  async listIncidents(filters) {
    const db = await getDbAdapter();
    return db.listIncidents(filters);
  },

  /**
   * Used by:
   *  - incidentService.getIncidentDetail() -> GET /incidents/{incidentId}
   *  - incidentService.updateIncidentStatus() -> PUT /incidents/{incidentId}/status
   *  - incidentService.retryIncident() -> POST /incidents/{incidentId}/retry
   * Fetches one incident by incidentId along with its incident_history audit trail.
   */
  async getIncidentById(incidentId) {
    const db = await getDbAdapter();
    return db.getIncidentById(incidentId);
  },

  /**
   * Used by: incidentService.updateIncidentStatus() -> PUT /incidents/{incidentId}/status
   * Updates incident workflow status and inserts a STATUS_CHANGED audit record.
   */
  async updateStatus(incidentId, status, meta) {
    const db = await getDbAdapter();
    return db.updateIncidentStatus(incidentId, status, meta);
  },

  /**
   * Used by: incidentService.retryIncident() -> POST /incidents/{incidentId}/retry
   * Increments retry_count, updates status to 'Retry Initiated', sets last_retry_at, and logs RETRY_SIMULATED history.
   */
  async retryIncident(incidentId, meta) {
    const db = await getDbAdapter();
    return db.retryIncident(incidentId, meta);
  },

  /**
   * Used by: correlationService.buildCorrelationContext() -> GET /fusion/jobs/{id}, /oic/integrations/{id}, /incidents/{id}
   * Queries exact correlation_id matches and time-window near-matches across Fusion & OIC executions.
   */
  async findCorrelatedExecutions(params) {
    const db = await getDbAdapter();
    return db.findCorrelatedExecutions(params);
  }
};
