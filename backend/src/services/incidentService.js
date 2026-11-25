'use strict';

const incidentRepository = require('../repositories/incidentRepository');
const fusionRepository = require('../repositories/fusionRepository');
const oicRepository = require('../repositories/oicRepository');
const correlationService = require('./correlationService');
const { AppError } = require('../utils/response');

const NON_RETRYABLE_STATUSES = ['Resolved', 'Closed'];

async function listIncidents(filters) {
  return incidentRepository.listIncidents(filters);
}

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
