'use strict';

const incidentRepository = require('../repositories/incidentRepository');
const fusionRepository = require('../repositories/fusionRepository');
const oicRepository = require('../repositories/oicRepository');
const correlationService = require('./correlationService');
const { AppError } = require('../utils/response');

const NON_RETRYABLE_STATUSES = ['Resolved', 'Closed'];

/**
 * Business Service used by: IncidentsLambda -> GET /incidents
 * Retrieves filtered and paginated failure incidents.
 */
async function listIncidents(filters) {
  return incidentRepository.listIncidents(filters);
}

/**
 * Business Service used by:
 *  - IncidentsLambda -> GET /incidents/{incidentId}
 *  - updateIncidentStatus() & retryIncident() (returns refreshed full view)
 * Loads the incident (404 if missing), its source Fusion/OIC execution, audit history,
 * and end-to-end correlation chain + business impact statement.
 */
async function getIncidentDetail(incidentId) {
  const incident = await incidentRepository.getIncidentById(incidentId);
  if (!incident) {
    throw new AppError(404, `Incident '${incidentId}' was not found`);
  }

  let sourceExecution = null;
  let referenceTime = incident.created_at;
  let processFamily = incident.module_or_family;

  if (incident.source_type === 'FUSION') {
    sourceExecution = await fusionRepository.getExecutionById(incident.source_execution_id);
    if (sourceExecution) {
      referenceTime = sourceExecution.start_time;
      processFamily = sourceExecution.process_family;
    }
  } else {
    sourceExecution = await oicRepository.getExecutionById(incident.source_execution_id);
    if (sourceExecution) {
      referenceTime = sourceExecution.start_time;
      processFamily = sourceExecution.process_family;
    }
  }

  const correlation = await correlationService.buildCorrelationContext({
    correlationId: incident.correlation_id,
    sourceType: incident.source_type,
    processFamily,
    referenceTime
  });

  return {
    ...incident,
    sourceExecution,
    correlation
  };
}

/**
 * Business Service used by: IncidentsLambda -> PUT /incidents/{incidentId}/status
 * Validates incident existence (404) and prevents redundant no-op status transitions (400),
 * updates status + audit history, and returns the refreshed incident detail.
 */
async function updateIncidentStatus(incidentId, newStatus, meta = {}) {
  const existing = await incidentRepository.getIncidentById(incidentId);
  if (!existing) {
    throw new AppError(404, `Incident '${incidentId}' was not found`);
  }
  if (existing.status === newStatus) {
    throw new AppError(400, `Incident '${incidentId}' is already in status '${newStatus}'`);
  }
  await incidentRepository.updateStatus(incidentId, newStatus, meta);
  return getIncidentDetail(incidentId);
}

/**
 * Business Service used by: IncidentsLambda -> POST /incidents/{incidentId}/retry
 * Validates incident exists (404) and is retryable (rejects Resolved/Closed with 400),
 * simulates retry (never resubmits real Oracle jobs), and returns refreshed incident detail.
 */
async function retryIncident(incidentId, meta = {}) {
  const existing = await incidentRepository.getIncidentById(incidentId);
  if (!existing) {
    throw new AppError(404, `Incident '${incidentId}' was not found`);
  }
  if (NON_RETRYABLE_STATUSES.includes(existing.status)) {
    throw new AppError(
      400,
      `Incident '${incidentId}' cannot be retried because its status is '${existing.status}'`
    );
  }
  await incidentRepository.retryIncident(incidentId, meta);
  return getIncidentDetail(incidentId);
}

module.exports = {
  listIncidents,
  getIncidentDetail,
  updateIncidentStatus,
  retryIncident
};
