'use strict';

const fs = require('fs');
const path = require('path');
const { buildDataset } = require('../backend/src/config/dataset');

function sqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function generateSql() {
  const data = buildDataset();
  const lines = [];

  lines.push('-- ============================================================================');
  lines.push('-- Oracle Fusion Cloud & OIC Job Failure Monitoring - Seed Data');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Counts: ${data.FUSION_JOBS.length} Fusion jobs, ${data.fusionExecutions.length} Fusion executions,`);
  lines.push(`--         ${data.OIC_INTEGRATIONS.length} OIC integrations, ${data.oicExecutions.length} OIC executions,`);
  lines.push(`--         ${data.DOWNSTREAM_SYSTEMS.length} downstream systems, ${data.incidents.length} incidents`);
  lines.push('-- ============================================================================');
  lines.push('USE oracle_monitoring;');
  lines.push('');

  lines.push('-- 1. Severity Rules');
  for (const r of data.SEVERITY_RULES) {
    lines.push(
      `INSERT INTO severity_rules (rule_id, rule_code, source_type, error_category, module_or_family, target_criticality, assigned_severity, auto_create_incident, priority, description) VALUES (` +
      `${sqlVal(r.rule_id)}, ${sqlVal(r.rule_code)}, ${sqlVal(r.source_type)}, ${sqlVal(r.error_category)}, ${sqlVal(r.module_or_family)}, ${sqlVal(r.target_criticality)}, ${sqlVal(r.assigned_severity)}, ${sqlVal(r.auto_create_incident)}, ${sqlVal(r.priority)}, ${sqlVal(r.description)});`
    );
  }
  lines.push('');

  lines.push('-- 2. Downstream Systems');
  for (const s of data.DOWNSTREAM_SYSTEMS) {
    lines.push(
      `INSERT INTO downstream_systems (system_id, system_name, system_type, criticality, owner_team, description) VALUES (` +
      `${sqlVal(s.system_id)}, ${sqlVal(s.system_name)}, ${sqlVal(s.system_type)}, ${sqlVal(s.criticality)}, ${sqlVal(s.owner_team)}, ${sqlVal(s.description)});`
    );
  }
  lines.push('');

  lines.push('-- 3. Fusion Jobs Master');
  for (const j of data.FUSION_JOBS) {
    lines.push(
      `INSERT INTO fusion_jobs (job_id, job_name, ess_job_definition, module, process_family, default_severity, schedule_frequency) VALUES (` +
      `${sqlVal(j.job_id)}, ${sqlVal(j.job_name)}, ${sqlVal(j.ess_job_definition)}, ${sqlVal(j.module)}, ${sqlVal(j.process_family)}, ${sqlVal(j.default_severity)}, ${sqlVal(j.schedule_frequency)});`
    );
  }
  lines.push('');

  lines.push('-- 4. OIC Integrations Master');
  for (const i of data.OIC_INTEGRATIONS) {
    lines.push(
      `INSERT INTO oic_integrations (integration_id, integration_name, integration_code, source_system, target_system_id, process_family, default_severity) VALUES (` +
      `${sqlVal(i.integration_id)}, ${sqlVal(i.integration_name)}, ${sqlVal(i.integration_code)}, ${sqlVal(i.source_system)}, ${sqlVal(i.target_system_id)}, ${sqlVal(i.process_family)}, ${sqlVal(i.default_severity)});`
    );
  }
  lines.push('');

  lines.push('-- 5. Fusion Job Executions');
  for (const e of data.fusionExecutions) {
    lines.push(
      `INSERT INTO fusion_job_executions (execution_id, job_id, correlation_id, status, severity, start_time, end_time, duration_seconds, error_code, error_category, error_message, retry_count) VALUES (` +
      `${sqlVal(e.execution_id)}, ${sqlVal(e.job_id)}, ${sqlVal(e.correlation_id)}, ${sqlVal(e.status)}, ${sqlVal(e.severity)}, ${sqlVal(e.start_time)}, ${sqlVal(e.end_time)}, ${sqlVal(e.duration_seconds)}, ${sqlVal(e.error_code)}, ${sqlVal(e.error_category)}, ${sqlVal(e.error_message)}, ${sqlVal(e.retry_count)});`
    );
  }
  lines.push('');

  lines.push('-- 6. OIC Integration Executions');
  for (const e of data.oicExecutions) {
    lines.push(
      `INSERT INTO oic_integration_executions (instance_id, integration_id, correlation_id, status, severity, start_time, end_time, duration_seconds, error_code, error_category, error_message, retry_count) VALUES (` +
      `${sqlVal(e.instance_id)}, ${sqlVal(e.integration_id)}, ${sqlVal(e.correlation_id)}, ${sqlVal(e.status)}, ${sqlVal(e.severity)}, ${sqlVal(e.start_time)}, ${sqlVal(e.end_time)}, ${sqlVal(e.duration_seconds)}, ${sqlVal(e.error_code)}, ${sqlVal(e.error_category)}, ${sqlVal(e.error_message)}, ${sqlVal(e.retry_count)});`
    );
  }
  lines.push('');

  lines.push('-- 7. Failure Incidents');
  for (const inc of data.incidents) {
    lines.push(
      `INSERT INTO failure_incidents (incident_id, source_type, source_execution_id, process_name, module_or_family, downstream_system_id, correlation_id, severity, status, error_code, error_category, error_message, retry_count, last_retry_at, acknowledged_by, created_at, updated_at) VALUES (` +
      `${sqlVal(inc.incident_id)}, ${sqlVal(inc.source_type)}, ${sqlVal(inc.source_execution_id)}, ${sqlVal(inc.process_name)}, ${sqlVal(inc.module_or_family)}, ${sqlVal(inc.downstream_system_id)}, ${sqlVal(inc.correlation_id)}, ${sqlVal(inc.severity)}, ${sqlVal(inc.status)}, ${sqlVal(inc.error_code)}, ${sqlVal(inc.error_category)}, ${sqlVal(inc.error_message)}, ${sqlVal(inc.retry_count)}, ${sqlVal(inc.last_retry_at)}, ${sqlVal(inc.acknowledged_by)}, ${sqlVal(inc.created_at)}, ${sqlVal(inc.updated_at)});`
    );
  }
  lines.push('');

  lines.push('-- 8. Incident History');
  for (const h of data.incidentHistory) {
    lines.push(
      `INSERT INTO incident_history (history_id, incident_id, action, old_status, new_status, notes, performed_by, action_time) VALUES (` +
      `${sqlVal(h.history_id)}, ${sqlVal(h.incident_id)}, ${sqlVal(h.action)}, ${sqlVal(h.old_status)}, ${sqlVal(h.new_status)}, ${sqlVal(h.notes)}, ${sqlVal(h.performed_by)}, ${sqlVal(h.action_time)});`
    );
  }
  lines.push('');

  const outPath = path.join(__dirname, 'seed.sql');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Generated ${outPath} successfully.`);
  console.log(`Fusion executions: ${data.fusionExecutions.length}, OIC executions: ${data.oicExecutions.length}, Incidents: ${data.incidents.length}`);
}

if (require.main === module) {
  generateSql();
}

module.exports = { generateSql };
