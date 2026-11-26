'use strict';

const { buildDataset } = require('../config/dataset');

/**
 * Helper used by: GET /fusion/jobs, GET /oic/integrations, GET /dashboard/summary
 * Converts a YYYY-MM-DD date string into start-of-day (00:00:00) or end-of-day (23:59:59) UTC bounds.
 */
function normalizeDateBound(val, isEnd = false) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return isEnd ? `${val} 23:59:59` : `${val} 00:00:00`;
  }
  return val.replace('T', ' ').slice(0, 19);
}

/**
 * Helper used by: PUT /incidents/{incidentId}/status, POST /incidents/{incidentId}/retry
 * Returns the current UTC timestamp formatted as 'YYYY-MM-DD HH:MM:SS'.
 */
function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * In-Memory Zero-DB Data Adapter.
 * Implements the exact same method contract as MySqlAdapter over an in-memory copy of dataset.js.
 * Selected by dbClient.js when DB_MODE=memory, when DB_MODE=auto and MySQL is unreachable,
 * or during unit tests (backend/tests/api.test.js).
 */
class MemoryAdapter {
  /**
   * Used by: dbClient.js & backend/tests/api.test.js
   * Seeds the in-memory store with fresh simulated data on instantiation.
   */
  constructor() {
    this.reset();
  }

  /**
   * Used by: MemoryAdapter constructor & unit tests
   * Reloads clean in-memory arrays (125 Fusion, 90 OIC, 6 downstream systems, 20 incidents) from dataset.js.
   */
  reset() {
    const data = buildDataset();
    this.severityRules = data.SEVERITY_RULES;
    this.downstreamSystems = data.DOWNSTREAM_SYSTEMS;
    this.fusionJobs = data.FUSION_JOBS;
    this.oicIntegrations = data.OIC_INTEGRATIONS;
    this.fusionExecutions = data.fusionExecutions;
    this.oicExecutions = data.oicExecutions;
    this.incidents = data.incidents;
    this.incidentHistory = data.incidentHistory;
  }

  /**
   * Internal helper used by: listFusionExecutions, getFusionExecutionById, getDashboardSummary, findCorrelatedExecutions
   * Simulates SQL JOINs by attaching job_name, module, process_family, and linked incident_id to a Fusion execution row.
   */
  _enrichFusion(row) {
    const job = this.fusionJobs.find((j) => j.job_id === row.job_id) || {};
    const incident = this.incidents.find(
      (i) => i.source_type === 'FUSION' && i.source_execution_id === row.execution_id
    );
    return {
      ...row,
      job_name: job.job_name || row.job_id,
      ess_job_definition: job.ess_job_definition || null,
      module: job.module || 'Unknown',
      process_family: job.process_family || 'General',
      incident_id: incident ? incident.incident_id : null,
      incident_status: incident ? incident.status : null
    };
  }

  /**
   * Internal helper used by: listOicExecutions, getOicExecutionById, getDashboardSummary, findCorrelatedExecutions
   * Simulates SQL JOINs by attaching integration metadata, downstream target system details, and linked incident_id.
   */
  _enrichOic(row) {
    const integ = this.oicIntegrations.find((i) => i.integration_id === row.integration_id) || {};
    const target = this.downstreamSystems.find((s) => s.system_id === integ.target_system_id) || {};
    const incident = this.incidents.find(
      (i) => i.source_type === 'OIC' && i.source_execution_id === row.instance_id
    );
    return {
      ...row,
      integration_name: integ.integration_name || row.integration_id,
      integration_code: integ.integration_code || null,
      source_system: integ.source_system || 'Unknown',
      target_system_id: integ.target_system_id || null,
      target_system_name: target.system_name || 'Unknown',
      target_system_type: target.system_type || null,
      target_criticality: target.criticality || 'Medium',
      process_family: integ.process_family || 'General',
      incident_id: incident ? incident.incident_id : null,
      incident_status: incident ? incident.status : null
    };
  }

  /**
   * Internal helper used by: listIncidents, getIncidentById, getDashboardSummary
   * Simulates SQL LEFT JOIN on downstream_systems to attach target system name, type, and criticality to an incident.
   */
  _enrichIncident(row) {
    const target = row.downstream_system_id
      ? this.downstreamSystems.find((s) => s.system_id === row.downstream_system_id)
      : null;
    return {
      ...row,
      downstream_system_name: target ? target.system_name : null,
      downstream_system_type: target ? target.system_type : null,
      downstream_criticality: target ? target.criticality : null
    };
  }

  /**
   * Used by:
   *  - GET /dashboard/metadata (DashboardLambda)
   *  - GET /dashboard/summary (DashboardLambda -> availableModules list)
   *  - POST /simulator/tick & EventBridge schedule (DataGeneratorLambda)
   * Returns master reference lists (modules, OIC sources, downstream systems, Fusion jobs, OIC integrations).
   */
  async getMetadata() {
    return {
      mode: 'memory',
      modules: [...new Set(this.fusionJobs.map((j) => j.module))].sort(),
      sources: [...new Set(this.oicIntegrations.map((i) => i.source_system))].sort(),
      downstreamSystems: this.downstreamSystems,
      fusionJobs: this.fusionJobs,
      oicIntegrations: this.oicIntegrations
    };
  }

  /**
   * Used by: POST /simulator/tick & EventBridge schedule (DataGeneratorLambda -> severityService)
   * Returns severity classification rules sorted by ascending priority.
   */
  async getSeverityRules() {
    return [...this.severityRules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Used by:
   *  - GET /fusion/jobs (FusionJobsLambda, including ?format=csv)
   *  - GET /fusion/jobs/failed (FusionJobsLambda)
   * Filters, sorts, and paginates in-memory Fusion job executions.
   */
  async listFusionExecutions(filters = {}) {
    let rows = this.fusionExecutions.map((r) => this._enrichFusion(r));

    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.severity) rows = rows.filter((r) => r.severity === filters.severity);
    if (filters.module) rows = rows.filter((r) => r.module.toLowerCase() === filters.module.toLowerCase());
    if (filters.jobName) {
      const q = filters.jobName.toLowerCase();
      rows = rows.filter((r) => r.job_name.toLowerCase().includes(q));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        [r.execution_id, r.job_name, r.module, r.error_code, r.error_message, r.correlation_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }

    const from = normalizeDateBound(filters.dateFrom, false);
    const to = normalizeDateBound(filters.dateTo, true);
    if (from) rows = rows.filter((r) => r.start_time >= from);
    if (to) rows = rows.filter((r) => r.start_time <= to);

    const sortKey = ['execution_id', 'job_name', 'module', 'status', 'severity', 'start_time', 'duration_seconds', 'retry_count']
      .includes(filters.sortBy)
      ? filters.sortBy
      : 'start_time';
    const dir = filters.sortOrder === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    const total = rows.length;
    const paged = filters.all ? rows : rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 20));
    return { items: paged, total };
  }

  /**
   * Used by:
   *  - GET /fusion/jobs/{executionId} (FusionJobsLambda)
   *  - GET /incidents/{incidentId} (IncidentsLambda, when source_type === 'FUSION')
   * Finds one Fusion execution by execution_id and enriches it with job & incident details.
   */
  async getFusionExecutionById(executionId) {
    const row = this.fusionExecutions.find((r) => r.execution_id === executionId);
    return row ? this._enrichFusion(row) : null;
  }

  /**
   * Used by:
   *  - GET /oic/integrations (OicIntegrationsLambda, including ?format=csv)
   *  - GET /oic/integrations/failed (OicIntegrationsLambda)
   * Filters, sorts, and paginates in-memory OIC integration executions.
   */
  async listOicExecutions(filters = {}) {
    let rows = this.oicExecutions.map((r) => this._enrichOic(r));

    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.severity) rows = rows.filter((r) => r.severity === filters.severity);
    if (filters.source) rows = rows.filter((r) => r.source_system.toLowerCase() === filters.source.toLowerCase());
    if (filters.target) {
      const t = filters.target.toLowerCase();
      rows = rows.filter(
        (r) => (r.target_system_id || '').toLowerCase() === t || (r.target_system_name || '').toLowerCase().includes(t)
      );
    }
    if (filters.integration) {
      const q = filters.integration.toLowerCase();
      rows = rows.filter((r) => r.integration_name.toLowerCase().includes(q));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        [r.instance_id, r.integration_name, r.source_system, r.target_system_name, r.error_code, r.error_message, r.correlation_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }

    const from = normalizeDateBound(filters.dateFrom, false);
    const to = normalizeDateBound(filters.dateTo, true);
    if (from) rows = rows.filter((r) => r.start_time >= from);
    if (to) rows = rows.filter((r) => r.start_time <= to);

    const sortKey = ['instance_id', 'integration_name', 'source_system', 'target_system_name', 'status', 'severity', 'start_time', 'duration_seconds', 'retry_count']
      .includes(filters.sortBy)
      ? filters.sortBy
      : 'start_time';
    const dir = filters.sortOrder === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    const total = rows.length;
    const paged = filters.all ? rows : rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 20));
    return { items: paged, total };
  }

  /**
   * Used by:
   *  - GET /oic/integrations/{instanceId} (OicIntegrationsLambda)
   *  - GET /incidents/{incidentId} (IncidentsLambda, when source_type === 'OIC')
   * Finds one OIC execution by instance_id and enriches it with downstream target & incident details.
   */
  async getOicExecutionById(instanceId) {
    const row = this.oicExecutions.find((r) => r.instance_id === instanceId);
    return row ? this._enrichOic(row) : null;
  }

  /**
   * Used by: GET /dashboard/summary (DashboardLambda)
   * Filters in-memory Fusion, OIC, and incident collections by module and date range
   * so dashboardService can compute KPIs, success rates, and impacted downstream systems.
   */
  async getDashboardSummary(filters = {}) {
    const from = normalizeDateBound(filters.dateFrom, false);
    const to = normalizeDateBound(filters.dateTo, true);

    let fusion = this.fusionExecutions.map((r) => this._enrichFusion(r));
    let oic = this.oicExecutions.map((r) => this._enrichOic(r));
    let incs = this.incidents.map((i) => this._enrichIncident(i));

    if (filters.module) {
      const mod = filters.module.toLowerCase();
      fusion = fusion.filter((r) => r.module.toLowerCase() === mod || r.process_family.toLowerCase() === mod);
      oic = oic.filter((r) => r.process_family.toLowerCase() === mod);
      incs = incs.filter((i) => i.module_or_family.toLowerCase() === mod);
    }
    if (from) {
      fusion = fusion.filter((r) => r.start_time >= from);
      oic = oic.filter((r) => r.start_time >= from);
      incs = incs.filter((i) => i.created_at >= from);
    }
    if (to) {
      fusion = fusion.filter((r) => r.start_time <= to);
      oic = oic.filter((r) => r.start_time <= to);
      incs = incs.filter((i) => i.created_at <= to);
    }

    return {
      fusion,
      oic,
      incidents: incs,
      downstreamSystems: this.downstreamSystems
    };
  }

  /**
   * Used by: GET /incidents (IncidentsLambda, including ?format=csv)
   * Filters and paginates in-memory incidents sorted newest first.
   */
  async listIncidents(filters = {}) {
    let rows = this.incidents.map((i) => this._enrichIncident(i));

    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.severity) rows = rows.filter((r) => r.severity === filters.severity);
    if (filters.sourceType) rows = rows.filter((r) => r.source_type === filters.sourceType);
    if (filters.module) {
      const m = filters.module.toLowerCase();
      rows = rows.filter((r) => r.module_or_family.toLowerCase() === m);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        [r.incident_id, r.source_execution_id, r.process_name, r.downstream_system_name, r.error_code, r.error_message, r.correlation_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }

    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const total = rows.length;
    const paged = filters.all ? rows : rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 20));
    return { items: paged, total };
  }

  /**
   * Used by:
   *  - GET /incidents/{incidentId} (IncidentsLambda)
   *  - PUT /incidents/{incidentId}/status (IncidentsLambda)
   *  - POST /incidents/{incidentId}/retry (IncidentsLambda)
   * Finds one incident by ID and attaches its sorted incident_history audit trail.
   */
  async getIncidentById(incidentId) {
    const row = this.incidents.find((i) => i.incident_id === incidentId);
    if (!row) return null;
    const history = this.incidentHistory
      .filter((h) => h.incident_id === incidentId)
      .sort((a, b) => (a.action_time < b.action_time ? 1 : -1));
    return {
      ...this._enrichIncident(row),
      history
    };
  }

  /**
   * Used by: PUT /incidents/{incidentId}/status (IncidentsLambda)
   * Updates incident status/acknowledged_by in memory and appends a STATUS_CHANGED entry to incidentHistory.
   */
  async updateIncidentStatus(incidentId, newStatus, { notes, performedBy } = {}) {
    const row = this.incidents.find((i) => i.incident_id === incidentId);
    if (!row) return null;
    const oldStatus = row.status;
    const now = nowTimestamp();
    row.status = newStatus;
    row.updated_at = now;
    if (!row.acknowledged_by && performedBy) {
      row.acknowledged_by = performedBy;
    }

    const nextId = this.incidentHistory.reduce((m, h) => Math.max(m, h.history_id), 0) + 1;
    this.incidentHistory.push({
      history_id: nextId,
      incident_id: incidentId,
      action: 'STATUS_CHANGED',
      old_status: oldStatus,
      new_status: newStatus,
      notes: notes || `Status updated from ${oldStatus} to ${newStatus}`,
      performed_by: performedBy || 'ops-engineer',
      action_time: now
    });

    return this.getIncidentById(incidentId);
  }

  /**
   * Used by: POST /incidents/{incidentId}/retry (IncidentsLambda)
   * Increments retry_count on the incident and its underlying Fusion/OIC execution,
   * sets status to 'Retry Initiated', records last_retry_at, and appends a RETRY_SIMULATED history entry.
   */
  async retryIncident(incidentId, { notes, performedBy } = {}) {
    const row = this.incidents.find((i) => i.incident_id === incidentId);
    if (!row) return null;
    const oldStatus = row.status;
    const now = nowTimestamp();

    row.retry_count += 1;
    row.last_retry_at = now;
    row.status = 'Retry Initiated';
    row.updated_at = now;

    if (row.source_type === 'FUSION') {
      const f = this.fusionExecutions.find((e) => e.execution_id === row.source_execution_id);
      if (f) f.retry_count += 1;
    } else {
      const o = this.oicExecutions.find((e) => e.instance_id === row.source_execution_id);
      if (o) o.retry_count += 1;
    }

    const nextId = this.incidentHistory.reduce((m, h) => Math.max(m, h.history_id), 0) + 1;
    this.incidentHistory.push({
      history_id: nextId,
      incident_id: incidentId,
      action: 'RETRY_SIMULATED',
      old_status: oldStatus,
      new_status: 'Retry Initiated',
      notes: notes || `Simulated retry #${row.retry_count} initiated by operations console`,
      performed_by: performedBy || 'ops-engineer',
      action_time: now
    });

    return this.getIncidentById(incidentId);
  }

  /**
   * Used by:
   *  - GET /fusion/jobs/{executionId} (FusionJobsLambda -> correlationService)
   *  - GET /oic/integrations/{instanceId} (OicIntegrationsLambda -> correlationService)
   *  - GET /incidents/{incidentId} (IncidentsLambda -> correlationService)
   * Finds exact correlation_id matches plus nearby same-process-family executions within windowMinutes.
   */
  async findCorrelatedExecutions({ correlationId, sourceType, processFamily, referenceTime, windowMinutes }) {
    const exactFusion = correlationId
      ? this.fusionExecutions.filter((f) => f.correlation_id === correlationId).map((f) => this._enrichFusion(f))
      : [];
    const exactOic = correlationId
      ? this.oicExecutions.filter((o) => o.correlation_id === correlationId).map((o) => this._enrichOic(o))
      : [];

    const refMs = referenceTime ? Date.parse(referenceTime.replace(' ', 'T') + 'Z') : null;
    const windowMs = (windowMinutes || 15) * 60000;

    let nearbyFusion = [];
    let nearbyOic = [];
    if (refMs && processFamily) {
      nearbyFusion = this.fusionExecutions
        .map((f) => this._enrichFusion(f))
        .filter((f) => {
          if (correlationId && f.correlation_id === correlationId) return false;
          const t = Date.parse(f.start_time.replace(' ', 'T') + 'Z');
          return f.process_family === processFamily && Math.abs(t - refMs) <= windowMs;
        });
      nearbyOic = this.oicExecutions
        .map((o) => this._enrichOic(o))
        .filter((o) => {
          if (correlationId && o.correlation_id === correlationId) return false;
          const t = Date.parse(o.start_time.replace(' ', 'T') + 'Z');
          return o.process_family === processFamily && Math.abs(t - refMs) <= windowMs;
        });
    }

    return { exactFusion, exactOic, nearbyFusion, nearbyOic, sourceType };
  }

  /**
   * Used by: POST /simulator/tick & EventBridge 5-min schedule (DataGeneratorLambda)
   * Prepends a simulated Fusion/OIC execution and (when applicable) auto-creates an incident + history record.
   */
  async insertSimulatedExecution({ sourceType, execution, incident }) {
    if (sourceType === 'FUSION') {
      this.fusionExecutions.unshift(execution);
    } else {
      this.oicExecutions.unshift(execution);
    }
    if (incident) {
      this.incidents.unshift(incident);
      const nextId = this.incidentHistory.reduce((m, h) => Math.max(m, h.history_id), 0) + 1;
      this.incidentHistory.push({
        history_id: nextId,
        incident_id: incident.incident_id,
        action: 'CREATED',
        old_status: null,
        new_status: incident.status,
        notes: `Simulated ${incident.severity} ${sourceType} failure detected (${incident.error_code})`,
        performed_by: 'data-generator-lambda',
        action_time: incident.created_at
      });
    }
    return { execution, incident };
  }

  /**
   * Used by: POST /simulator/tick & EventBridge schedule (DataGeneratorLambda)
   * Computes next sequential IDs (FUSxxxx, OICxxxx, INCxxx) from the in-memory collections.
   */
  async getNextIds() {
    const maxFus = this.fusionExecutions.reduce((m, r) => {
      const n = Number(String(r.execution_id).replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1000);
    const maxOic = this.oicExecutions.reduce((m, r) => {
      const n = Number(String(r.instance_id).replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 2000);
    const maxInc = this.incidents.reduce((m, r) => {
      const n = Number(String(r.incident_id).replace(/\D/g, ''));
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return {
      nextFusionId: `FUS${maxFus + 1}`,
      nextOicId: `OIC${maxOic + 1}`,
      nextIncidentId: `INC${String(maxInc + 1).padStart(3, '0')}`
    };
  }
}

module.exports = { MemoryAdapter };
