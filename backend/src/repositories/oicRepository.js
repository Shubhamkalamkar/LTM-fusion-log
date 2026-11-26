'use strict';

const { getDbAdapter } = require('../db/dbClient');

/**
 * Data-access repository for Oracle Integration Cloud (OIC) executions.
 * Delegates queries to the active DB adapter (MySqlAdapter or MemoryAdapter).
 */
module.exports = {
  /**
   * Used by: oicService.listOicExecutions() -> GET /oic/integrations & GET /oic/integrations/failed
   * Returns filtered, sorted, and paginated OIC integration rows plus total count.
   */
  async listExecutions(filters) {
    const db = await getDbAdapter();
    return db.listOicExecutions(filters);
  },

  /**
   * Used by:
   *  - oicService.getOicExecutionDetail() -> GET /oic/integrations/{instanceId}
   *  - incidentService.getIncidentDetail() -> GET /incidents/{incidentId} (for OIC incidents)
   * Fetches a single OIC integration execution record by instanceId.
   */
  async getExecutionById(instanceId) {
    const db = await getDbAdapter();
    return db.getOicExecutionById(instanceId);
  }
};
