'use strict';

const { getPool } = require('./pool');
const { AppError } = require('../utils/response');

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

async function query(sql, params = []) {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (err) {
    if (err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST')) {
      throw new AppError(503, 'Database connection unavailable or timed out. Please retry shortly.');
    }
    throw err;
  }
}

class MySqlAdapter {
  async getMetadata() {
    const [modulesRows, sourcesRows, downstreamSystems, fusionJobs, oicIntegrations] = await Promise.all([
      query('SELECT DISTINCT module FROM fusion_jobs ORDER BY module'),
      query('SELECT DISTINCT source_system FROM oic_integrations ORDER BY source_system'),
      query('SELECT * FROM downstream_systems ORDER BY system_id'),
      query('SELECT * FROM fusion_jobs ORDER BY job_id'),
      query('SELECT * FROM oic_integrations ORDER BY integration_id')
    ]);
    return {
      mode: 'mysql',
      modules: modulesRows.map((r) => r.module),
      sources: sourcesRows.map((r) => r.source_system),
      downstreamSystems,
      fusionJobs,
      oicIntegrations
    };
  }

  async getSeverityRules() {
    return query('SELECT * FROM severity_rules ORDER BY priority ASC');
  }

  async listFusionExecutions(filters = {}) {
    const where = ['1=1'];
    const params = [];

    if (filters.status) {
      where.push('e.status = ?');
      params.push(filters.status);
    }
    if (filters.severity) {
      where.push('e.severity = ?');
      params.push(filters.severity);
    }
    if (filters.module) {
      where.push('LOWER(j.module) = LOWER(?)');
      params.push(filters.module);
    }
    if (filters.jobName) {
      where.push('LOWER(j.job_name) LIKE LOWER(?)');
      params.push(`%${filters.jobName}%`);
    }
    if (filters.search) {
      where.push('(e.execution_id LIKE ? OR j.job_name LIKE ? OR j.module LIKE ? OR e.error_code LIKE ? OR e.error_message LIKE ? OR e.correlation_id LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like, like, like, like, like);
    }

    const from = normalizeDateBound(filters.dateFrom, false);
    const to = normalizeDateBound(filters.dateTo, true);
    if (from) {
      where.push('e.start_time >= ?');
      params.push(from);
    }
    if (to) {
      where.push('e.start_time <= ?');
      params.push(to);
    }

    const sortColumns = {
      execution_id: 'e.execution_id',
      job_name: 'j.job_name',
      module: 'j.module',
      status: 'e.status',
      severity: 'e.severity',
      start_time: 'e.start_time',
      duration_seconds: 'e.duration_seconds',
      retry_count: 'e.retry_count'
    };
    const sortExpr = sortColumns[filters.sortBy] || 'e.start_time';
    const dir = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const whereClause = where.join(' AND ');
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM fusion_job_executions e INNER JOIN fusion_jobs j ON e.job_id = j.job_id WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const limitClause = filters.all ? '' : `LIMIT ${Number(filters.limit || 20)} OFFSET ${Number(filters.offset || 0)}`;
    const items = await query(
      `SELECT e.*, j.job_name, j.ess_job_definition, j.module, j.process_family,
              fi.incident_id, fi.status AS incident_status
       FROM fusion_job_executions e
       INNER JOIN fusion_jobs j ON e.job_id = j.job_id
       LEFT JOIN failure_incidents fi ON fi.source_type = 'FUSION' AND fi.source_execution_id = e.execution_id
       WHERE ${whereClause}
       ORDER BY ${sortExpr} ${dir}
       ${limitClause}`,
      params
    );

    return { items, total };
  }

  async getFusionExecutionById(executionId) {
    const rows = await query(
      `SELECT e.*, j.job_name, j.ess_job_definition, j.module, j.process_family,
              fi.incident_id, fi.status AS incident_status
       FROM fusion_job_executions e
       INNER JOIN fusion_jobs j ON e.job_id = j.job_id
       LEFT JOIN failure_incidents fi ON fi.source_type = 'FUSION' AND fi.source_execution_id = e.execution_id
       WHERE e.execution_id = ?`,
      [executionId]
    );
    return rows[0] || null;
  }

  async listOicExecutions(filters = {}) {
    const where = ['1=1'];
    const params = [];

    if (filters.status) {
      where.push('e.status = ?');
      params.push(filters.status);
    }
    if (filters.severity) {
      where.push('e.severity = ?');
      params.push(filters.severity);
    }
    if (filters.source) {
      where.push('LOWER(i.source_system) = LOWER(?)');
      params.push(filters.source);
    }
    if (filters.target) {
      where.push('(LOWER(d.system_id) = LOWER(?) OR LOWER(d.system_name) LIKE LOWER(?))');
      params.push(filters.target, `%${filters.target}%`);
    }
    if (filters.integration) {
      where.push('LOWER(i.integration_name) LIKE LOWER(?)');
      params.push(`%${filters.integration}%`);
    }
    if (filters.search) {
      where.push('(e.instance_id LIKE ? OR i.integration_name LIKE ? OR i.source_system LIKE ? OR d.system_name LIKE ? OR e.error_code LIKE ? OR e.error_message LIKE ? OR e.correlation_id LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const from = normalizeDateBound(filters.dateFrom, false);
    const to = normalizeDateBound(filters.dateTo, true);
    if (from) {
      where.push('e.start_time >= ?');
      params.push(from);
    }
    if (to) {
      where.push('e.start_time <= ?');
      params.push(to);
    }

    const sortColumns = {
      instance_id: 'e.instance_id',
      integration_name: 'i.integration_name',
      source_system: 'i.source_system',
      target_system_name: 'd.system_name',
      status: 'e.status',
      severity: 'e.severity',
      start_time: 'e.start_time',
      duration_seconds: 'e.duration_seconds',
      retry_count: 'e.retry_count'
    };
    const sortExpr = sortColumns[filters.sortBy] || 'e.start_time';
    const dir = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const whereClause = where.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM oic_integration_executions e
       INNER JOIN oic_integrations i ON e.integration_id = i.integration_id
       INNER JOIN downstream_systems d ON i.target_system_id = d.system_id
       WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const limitClause = filters.all ? '' : `LIMIT ${Number(filters.limit || 20)} OFFSET ${Number(filters.offset || 0)}`;
    const items = await query(
      `SELECT e.*, i.integration_name, i.integration_code, i.source_system, i.target_system_id, i.process_family,
              d.system_name AS target_system_name, d.system_type AS target_system_type, d.criticality AS target_criticality,
              fi.incident_id, fi.status AS incident_status
       FROM oic_integration_executions e
       INNER JOIN oic_integrations i ON e.integration_id = i.integration_id
       INNER JOIN downstream_systems d ON i.target_system_id = d.system_id
       LEFT JOIN failure_incidents fi ON fi.source_type = 'OIC' AND fi.source_execution_id = e.instance_id
       WHERE ${whereClause}
       ORDER BY ${sortExpr} ${dir}
       ${limitClause}`,
      params
    );

    return { items, total };
  }

  async getOicExecutionById(instanceId) {
    const rows = await query(
      `SELECT e.*, i.integration_name, i.integration_code, i.source_system, i.target_system_id, i.process_family,
              d.system_name AS target_system_name, d.system_type AS target_system_type, d.criticality AS target_criticality,
              fi.incident_id, fi.status AS incident_status
       FROM oic_integration_executions e
       INNER JOIN oic_integrations i ON e.integration_id = i.integration_id
       INNER JOIN downstream_systems d ON i.target_system_id = d.system_id
       LEFT JOIN failure_incidents fi ON fi.source_type = 'OIC' AND fi.source_execution_id = e.instance_id
       WHERE e.instance_id = ?`,
      [instanceId]
    );
    return rows[0] || null;
  }

  async getDashboardSummary(filters = {}) {
    const [fusionRes, oicRes, incRes, downstreamSystems] = await Promise.all([
      this.listFusionExecutions({ ...filters, all: true }),
      this.listOicExecutions({ ...filters, all: true }),
      this.listIncidents({ module: filters.module, all: true }),
      query('SELECT * FROM downstream_systems ORDER BY system_id')
    ]);
    return {
      fusion: fusionRes.items,
      oic: oicRes.items,
      incidents: incRes.items,
      downstreamSystems
    };
  }

  async listIncidents(filters = {}) {
    const where = ['1=1'];
    const params = [];

    if (filters.status) {
      where.push('fi.status = ?');
      params.push(filters.status);
    }
    if (filters.severity) {
      where.push('fi.severity = ?');
      params.push(filters.severity);
    }
    if (filters.sourceType) {
      where.push('fi.source_type = ?');
      params.push(filters.sourceType);
    }
    if (filters.module) {
      where.push('LOWER(fi.module_or_family) = LOWER(?)');
      params.push(filters.module);
    }
    if (filters.search) {
      where.push('(fi.incident_id LIKE ? OR fi.source_execution_id LIKE ? OR fi.process_name LIKE ? OR d.system_name LIKE ? OR fi.error_code LIKE ? OR fi.error_message LIKE ? OR fi.correlation_id LIKE ?)');
      const like = `%${filters.search}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const whereClause = where.join(' AND ');
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM failure_incidents fi LEFT JOIN downstream_systems d ON fi.downstream_system_id = d.system_id WHERE ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);
    const limitClause = filters.all ? '' : `LIMIT ${Number(filters.limit || 20)} OFFSET ${Number(filters.offset || 0)}`;

    const items = await query(
      `SELECT fi.*, d.system_name AS downstream_system_name, d.system_type AS downstream_system_type, d.criticality AS downstream_criticality
       FROM failure_incidents fi
       LEFT JOIN downstream_systems d ON fi.downstream_system_id = d.system_id
       WHERE ${whereClause}
       ORDER BY fi.created_at DESC
       ${limitClause}`,
      params
    );
    return { items, total };
  }

  async getIncidentById(incidentId) {
    const rows = await query(
      `SELECT fi.*, d.system_name AS downstream_system_name, d.system_type AS downstream_system_type, d.criticality AS downstream_criticality
       FROM failure_incidents fi
       LEFT JOIN downstream_systems d ON fi.downstream_system_id = d.system_id
       WHERE fi.incident_id = ?`,
      [incidentId]
    );
    if (!rows[0]) return null;
    const history = await query(
      'SELECT * FROM incident_history WHERE incident_id = ? ORDER BY action_time DESC, history_id DESC',
      [incidentId]
    );
    return { ...rows[0], history };
  }

  async updateIncidentStatus(incidentId, newStatus, { notes, performedBy } = {}) {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM failure_incidents WHERE incident_id = ? FOR UPDATE', [incidentId]);
      if (!rows[0]) {
        await conn.rollback();
        return null;
      }
      const oldStatus = rows[0].status;
      const now = nowTimestamp();
      await conn.execute(
        'UPDATE failure_incidents SET status = ?, acknowledged_by = COALESCE(acknowledged_by, ?), updated_at = ? WHERE incident_id = ?',
        [newStatus, performedBy || 'ops-engineer', now, incidentId]
      );
      await conn.execute(
        'INSERT INTO incident_history (incident_id, action, old_status, new_status, notes, performed_by, action_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [incidentId, 'STATUS_CHANGED', oldStatus, newStatus, notes || `Status updated from ${oldStatus} to ${newStatus}`, performedBy || 'ops-engineer', now]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return this.getIncidentById(incidentId);
  }

  async retryIncident(incidentId, { notes, performedBy } = {}) {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT * FROM failure_incidents WHERE incident_id = ? FOR UPDATE', [incidentId]);
      if (!rows[0]) {
        await conn.rollback();
        return null;
      }
      const row = rows[0];
      const now = nowTimestamp();
      const nextCount = Number(row.retry_count) + 1;

      await conn.execute(
        'UPDATE failure_incidents SET retry_count = ?, last_retry_at = ?, status = ?, updated_at = ? WHERE incident_id = ?',
        [nextCount, now, 'Retry Initiated', now, incidentId]
      );

      if (row.source_type === 'FUSION') {
        await conn.execute('UPDATE fusion_job_executions SET retry_count = retry_count + 1 WHERE execution_id = ?', [row.source_execution_id]);
      } else {
        await conn.execute('UPDATE oic_integration_executions SET retry_count = retry_count + 1 WHERE instance_id = ?', [row.source_execution_id]);
      }

      await conn.execute(
        'INSERT INTO incident_history (incident_id, action, old_status, new_status, notes, performed_by, action_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [incidentId, 'RETRY_SIMULATED', row.status, 'Retry Initiated', notes || `Simulated retry #${nextCount} initiated`, performedBy || 'ops-engineer', now]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return this.getIncidentById(incidentId);
  }

  async findCorrelatedExecutions({ correlationId, sourceType, processFamily, referenceTime, windowMinutes }) {
    const exactFusion = correlationId
      ? await query(
          `SELECT e.*, j.job_name, j.module, j.process_family
           FROM fusion_job_executions e INNER JOIN fusion_jobs j ON e.job_id = j.job_id
           WHERE e.correlation_id = ?`,
          [correlationId]
        )
      : [];
    const exactOic = correlationId
      ? await query(
          `SELECT e.*, i.integration_name, i.source_system, i.target_system_id, i.process_family,
                  d.system_name AS target_system_name, d.criticality AS target_criticality
           FROM oic_integration_executions e
           INNER JOIN oic_integrations i ON e.integration_id = i.integration_id
           INNER JOIN downstream_systems d ON i.target_system_id = d.system_id
           WHERE e.correlation_id = ?`,
          [correlationId]
        )
      : [];

    let nearbyFusion = [];
    let nearbyOic = [];
    if (referenceTime && processFamily) {
      const win = Number(windowMinutes || 15);
      nearbyFusion = await query(
        `SELECT e.*, j.job_name, j.module, j.process_family
         FROM fusion_job_executions e INNER JOIN fusion_jobs j ON e.job_id = j.job_id
         WHERE j.process_family = ?
           AND (? IS NULL OR e.correlation_id IS NULL OR e.correlation_id <> ?)
           AND ABS(TIMESTAMPDIFF(MINUTE, e.start_time, ?)) <= ?`,
        [processFamily, correlationId || null, correlationId || null, referenceTime, win]
      );
      nearbyOic = await query(
        `SELECT e.*, i.integration_name, i.source_system, i.target_system_id, i.process_family,
                d.system_name AS target_system_name, d.criticality AS target_criticality
         FROM oic_integration_executions e
         INNER JOIN oic_integrations i ON e.integration_id = i.integration_id
         INNER JOIN downstream_systems d ON i.target_system_id = d.system_id
         WHERE i.process_family = ?
           AND (? IS NULL OR e.correlation_id IS NULL OR e.correlation_id <> ?)
           AND ABS(TIMESTAMPDIFF(MINUTE, e.start_time, ?)) <= ?`,
        [processFamily, correlationId || null, correlationId || null, referenceTime, win]
      );
    }

    return { exactFusion, exactOic, nearbyFusion, nearbyOic, sourceType };
  }

  async insertSimulatedExecution({ sourceType, execution, incident }) {
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (sourceType === 'FUSION') {
        await conn.execute(
          `INSERT INTO fusion_job_executions (execution_id, job_id, correlation_id, status, severity, start_time, end_time, duration_seconds, error_code, error_category, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [execution.execution_id, execution.job_id, execution.correlation_id, execution.status, execution.severity, execution.start_time, execution.end_time, execution.duration_seconds, execution.error_code, execution.error_category, execution.error_message, execution.retry_count]
        );
      } else {
        await conn.execute(
          `INSERT INTO oic_integration_executions (instance_id, integration_id, correlation_id, status, severity, start_time, end_time, duration_seconds, error_code, error_category, error_message, retry_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [execution.instance_id, execution.integration_id, execution.correlation_id, execution.status, execution.severity, execution.start_time, execution.end_time, execution.duration_seconds, execution.error_code, execution.error_category, execution.error_message, execution.retry_count]
        );
      }
      if (incident) {
        await conn.execute(
          `INSERT INTO failure_incidents (incident_id, source_type, source_execution_id, process_name, module_or_family, downstream_system_id, correlation_id, severity, status, error_code, error_category, error_message, retry_count, last_retry_at, acknowledged_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [incident.incident_id, incident.source_type, incident.source_execution_id, incident.process_name, incident.module_or_family, incident.downstream_system_id, incident.correlation_id, incident.severity, incident.status, incident.error_code, incident.error_category, incident.error_message, incident.retry_count, incident.last_retry_at, incident.acknowledged_by, incident.created_at, incident.updated_at]
        );
        await conn.execute(
          'INSERT INTO incident_history (incident_id, action, old_status, new_status, notes, performed_by, action_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [incident.incident_id, 'CREATED', null, incident.status, `Simulated ${incident.severity} ${sourceType} failure detected (${incident.error_code})`, 'data-generator-lambda', incident.created_at]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return { execution, incident };
  }

  async getNextIds() {
    const [fRows, oRows, iRows] = await Promise.all([
      query("SELECT COALESCE(MAX(CAST(SUBSTRING(execution_id, 4) AS UNSIGNED)), 1000) AS max_id FROM fusion_job_executions WHERE execution_id REGEXP '^FUS[0-9]+$'"),
      query("SELECT COALESCE(MAX(CAST(SUBSTRING(instance_id, 4) AS UNSIGNED)), 2000) AS max_id FROM oic_integration_executions WHERE instance_id REGEXP '^OIC[0-9]+$'"),
      query("SELECT COALESCE(MAX(CAST(SUBSTRING(incident_id, 4) AS UNSIGNED)), 0) AS max_id FROM failure_incidents WHERE incident_id REGEXP '^INC[0-9]+$'")
    ]);
    return {
      nextFusionId: `FUS${Number(fRows[0].max_id) + 1}`,
      nextOicId: `OIC${Number(oRows[0].max_id) + 1}`,
      nextIncidentId: `INC${String(Number(iRows[0].max_id) + 1).padStart(3, '0')}`
    };
  }
}

module.exports = { MySqlAdapter };
