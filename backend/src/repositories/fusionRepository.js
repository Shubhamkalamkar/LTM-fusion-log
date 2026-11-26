'use strict';

const { getDbAdapter } = require('../db/dbClient');

/**
 * Data-access repository for Oracle Fusion Cloud job executions.
 * Delegates queries to the active DB adapter (MySqlAdapter or MemoryAdapter).
 */
module.exports = {
  /**
   * Used by: fusionService.listFusionExecutions() -> GET /fusion/jobs & GET /fusion/jobs/failed
   * Returns filtered, sorted, and paginated Fusion execution rows plus total count.
   */
  async listExecutions(filters) {
    const db = await getDbAdapter();
    return db.listFusionExecutions(filters);
  },

  /**
   * Used by:
   *  - fusionService.getFusionExecutionDetail() -> GET /fusion/jobs/{executionId}
   *  - incidentService.getIncidentDetail() -> GET /incidents/{incidentId} (for FUSION incidents)
   * Fetches a single Fusion execution record by executionId.
   */
  async getExecutionById(executionId) {
    const db = await getDbAdapter();
    return db.getFusionExecutionById(executionId);
  }
};
