'use strict';

const dashboardRepository = require('../repositories/dashboardRepository');
const { classifySeverity } = require('./severityService');
const { FAILURE_CATALOG } = require('../config/dataset');

function formatUtc(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Generates a realistic simulated Fusion or OIC execution event.
 * Invoked by the scheduled Data Generator Lambda (EventBridge every 1-5 mins)
 * or manually from the UI "Simulate Event" trigger.
 */
async function generateSimulatedEvent(options = {}) {
  const meta = await dashboardRepository.getMetadata();
  const ids = await dashboardRepository.getNextIds();

  const sourceType = options.sourceType || (Math.random() < 0.55 ? 'FUSION' : 'OIC');
  const forceFailure = options.forceFailure === true;
  const roll = Math.random();
  const status = forceFailure ? 'FAILED' : roll < 0.72 ? 'SUCCESS' : roll < 0.94 ? 'FAILED' : 'WARNING';

  const now = new Date();
  const durationSeconds = Math.floor(15 + Math.random() * 180);
  const startDt = new Date(now.getTime() - durationSeconds * 1000);
  const corrId = options.correlationId || `CORR-SIM-${Date.now().toString().slice(-6)}`;

  let errorCode = null;
  let errorCategory = null;
  let errorMessage = null;
  if (status === 'FAILED') {
    const err = FAILURE_CATALOG[Math.floor(Math.random() * FAILURE_CATALOG.length)];
    errorCode = err.code;
    errorCategory = err.category;
    errorMessage = err.msg;
  } else if (status === 'WARNING') {
    errorCode = 'WARN-SLA';
    errorCategory = 'Data quality';
    errorMessage = 'Simulated warning: execution duration exceeded baseline threshold';
  }

  if (sourceType === 'FUSION') {
    const job = meta.fusionJobs[Math.floor(Math.random() * meta.fusionJobs.length)];
    const sev = await classifySeverity({
      sourceType: 'FUSION',
      status,
      errorCategory,
      moduleOrFamily: job.module,
      targetCriticality: null,
      defaultSeverity: job.default_severity
    });

    const execution = {
      execution_id: ids.nextFusionId,
      job_id: job.job_id,
      correlation_id: corrId,
      status,
      severity: sev.severity,
      start_time: formatUtc(startDt),
      end_time: formatUtc(now),
      duration_seconds: durationSeconds,
      error_code: errorCode,
      error_category: errorCategory,
      error_message: errorMessage,
      retry_count: 0
    };

    const incident = status === 'FAILED' && sev.autoCreateIncident
      ? {
          incident_id: ids.nextIncidentId,
          source_type: 'FUSION',
          source_execution_id: execution.execution_id,
          process_name: job.job_name,
          module_or_family: job.module,
          downstream_system_id: null,
          correlation_id: corrId,
          severity: sev.severity,
          status: 'Open',
          error_code: errorCode,
          error_category: errorCategory,
          error_message: errorMessage,
          retry_count: 0,
          last_retry_at: null,
          acknowledged_by: null,
          created_at: formatUtc(now),
          updated_at: formatUtc(now)
        }
      : null;

    await dashboardRepository.insertSimulatedExecution({ sourceType: 'FUSION', execution, incident });
    return { sourceType: 'FUSION', execution, incident, matchedRule: sev.matchedRule };
  }

  const integ = meta.oicIntegrations[Math.floor(Math.random() * meta.oicIntegrations.length)];
  const targetSys = meta.downstreamSystems.find((d) => d.system_id === integ.target_system_id);
  const sev = await classifySeverity({
    sourceType: 'OIC',
    status,
    errorCategory,
    moduleOrFamily: integ.process_family,
    targetCriticality: targetSys ? targetSys.criticality : 'Medium',
    defaultSeverity: integ.default_severity
  });

  const execution = {
    instance_id: ids.nextOicId,
    integration_id: integ.integration_id,
    correlation_id: corrId,
    status,
    severity: sev.severity,
    start_time: formatUtc(startDt),
    end_time: formatUtc(now),
    duration_seconds: durationSeconds,
    error_code: errorCode,
    error_category: errorCategory,
    error_message: errorMessage,
    retry_count: 0
  };

  const incident = status === 'FAILED' && sev.autoCreateIncident
    ? {
        incident_id: ids.nextIncidentId,
        source_type: 'OIC',
        source_execution_id: execution.instance_id,
        process_name: integ.integration_name,
        module_or_family: integ.process_family,
        downstream_system_id: integ.target_system_id,
        correlation_id: corrId,
        severity: sev.severity,
        status: 'Open',
        error_code: errorCode,
        error_category: errorCategory,
        error_message: errorMessage,
        retry_count: 0,
        last_retry_at: null,
        acknowledged_by: null,
        created_at: formatUtc(now),
        updated_at: formatUtc(now)
      }
    : null;

  await dashboardRepository.insertSimulatedExecution({ sourceType: 'OIC', execution, incident });
  return { sourceType: 'OIC', execution, incident, matchedRule: sev.matchedRule };
}

module.exports = { generateSimulatedEvent };
