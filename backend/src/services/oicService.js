'use strict';

const oicRepository = require('../repositories/oicRepository');
const correlationService = require('./correlationService');
const { AppError } = require('../utils/response');

/**
 * Business Service used by: OicIntegrationsLambda -> GET /oic/integrations & GET /oic/integrations/failed
 * Retrieves filtered, sorted, and paginated OIC integration instances.
 */
async function listOicExecutions(filters) {
  return oicRepository.listExecutions(filters);
}

/**
 * Business Service used by: OicIntegrationsLambda -> GET /oic/integrations/{instanceId}
 * Fetches one OIC integration instance (throws 404 if missing) along with downstream target
 * impact and its end-to-end Fusion -> OIC -> Downstream correlation context.
 */
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
