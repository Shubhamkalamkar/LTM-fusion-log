'use strict';

const { buildDataset } = require('../../../database/dataset');

function normalizeDateBound(val, isEnd = false) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return isEnd ? `${val} 23:59:59` : `${val} 00:00:00`;
  }
  return val.replace('T', ' ').slice(0, 19);
}

function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

class MemoryAdapter {
  constructor() {
    this.reset();
  }

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

  async getSeverityRules() {
    return [...this.severityRules].sort((a, b) => a.priority - b.priority);
  }

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

  async getFusionExecutionById(executionId) {
    const row = this.fusionExecutions.find((r) => r.execution_id === executionId);
    return row ? this._enrichFusion(row) : null;
  }

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

  async getOicExecutionById(instanceId) {
    const row = this.oicExecutions.find((r) => r.instance_id === instanceId);
    return row ? this._enrichOic(row) : null;
  }

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

  async retryIncident(incidentId, { notes, performedBy } = {}) {
    const row = this.incidents.find((i) => i.incident_id === incidentId);
    if (!row) return null;
    const oldStatus = row.status;
    const now = nowTimestamp();

    row.retry_count += 1;
    row.last_retry_at = now;
    row.status = 'Retry Initiated';
    row.updated_at = now;

    // Also update underlying execution retry_count
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
