'use strict';

const { getDbAdapter, getActiveDbMode } = require('../db/dbClient');

/**
 * Data-access repository for Dashboard, Severity Rules, Master Metadata, and Event Simulation.
 * Delegates queries to the active DB adapter (MySqlAdapter or MemoryAdapter).
 */
module.exports = {
  /**
   * Used by: dashboardService.getDashboardSummary() -> GET /dashboard/summary
   * Fetches filtered Fusion runs, OIC runs, incidents, and downstream systems for KPI calculation.
   */
  async getSummaryDataset(filters) {
    const db = await getDbAdapter();
    return db.getDashboardSummary(filters);
  },

  /**
   * Used by:
   *  - DashboardLambda -> GET /dashboard/metadata
   *  - dashboardService.getDashboardSummary() -> GET /dashboard/summary
   *  - dataGeneratorService.generateSimulatedEvent() -> POST /simulator/tick
   * Returns master lists (modules, sources, jobs, integrations, downstream systems) + activeDbMode.
   */
  async getMetadata() {
    const db = await getDbAdapter();
    const meta = await db.getMetadata();
    return { ...meta, activeDbMode: getActiveDbMode() };
  },

  /**
   * Used by: severityService.classifySeverity() -> POST /simulator/tick & EventBridge schedule
   * Loads priority-ordered severity classification rules from the data store.
   */
  async getSeverityRules() {
    const db = await getDbAdapter();
    return db.getSeverityRules();
  },

  /**
   * Used by: dataGeneratorService.generateSimulatedEvent() -> POST /simulator/tick & EventBridge schedule
   * Persists a newly simulated Fusion/OIC execution and any auto-created incident + history.
   */
  async insertSimulatedExecution(payload) {
    const db = await getDbAdapter();
    return db.insertSimulatedExecution(payload);
  },

  /**
   * Used by: dataGeneratorService.generateSimulatedEvent() -> POST /simulator/tick & EventBridge schedule
   * Fetches next sequential IDs (FUSxxxx, OICxxxx, INCxxx) for new simulated records.
   */
  async getNextIds() {
    const db = await getDbAdapter();
    return db.getNextIds();
  }
};
