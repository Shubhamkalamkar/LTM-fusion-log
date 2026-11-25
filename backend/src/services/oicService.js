'use strict';

const oicRepository = require('../repositories/oicRepository');
const correlationService = require('./correlationService');
const { AppError } = require('../utils/response');

async function listOicExecutions(filters) {
  return oicRepository.listExecutions(filters);
}

async function getOicExecutionDetail(instanceId) {
  const instance = await oicRepository.getExecutionById(instanceId);
  if (!instance) {
    throw new AppError(404, `OIC integration instance '${instanceId}' was not found`);
  }
  const correlation = await correlationService.buildCorrelationContext({
    correlationId: instance.correlation_id,
    sourceType: 'OIC',
    processFamily: instance.process_family,
    referenceTime: instance.start_time
  });
  return { ...instance, correlation };
}

module.exports = {
  listOicExecutions,
  getOicExecutionDetail
};
