'use strict';

const fusionRepository = require('../repositories/fusionRepository');
const correlationService = require('./correlationService');
const { AppError } = require('../utils/response');

async function listFusionExecutions(filters) {
  return fusionRepository.listExecutions(filters);
}

async function getFusionExecutionDetail(executionId) {
  const exec = await fusionRepository.getExecutionById(executionId);
  if (!exec) {
    throw new AppError(404, `Fusion execution '${executionId}' was not found`);
  }
  const correlation = await correlationService.buildCorrelationContext({
    correlationId: exec.correlation_id,
    sourceType: 'FUSION',
    processFamily: exec.process_family,
    referenceTime: exec.start_time
  });
  return { ...exec, correlation };
}

module.exports = {
  listFusionExecutions,
  getFusionExecutionDetail
};
