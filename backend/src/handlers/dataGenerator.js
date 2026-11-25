'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const { generateSimulatedEvent } = require('../services/dataGeneratorService');
const { created } = require('../utils/response');
const { parseJsonBody, validateEnum, VALID_SOURCE_TYPES } = require('../utils/validator');

/**
 * Triggered either by Amazon EventBridge (scheduled every 1-5 mins)
 * or manually via POST /simulator/tick for interactive demos.
 */
const handler = withLambdaGuard('DataGeneratorLambda', async (event) => {
  const body = event.httpMethod ? parseJsonBody(event) : event;
  const sourceType = validateEnum(body.sourceType, VALID_SOURCE_TYPES, 'sourceType');
  const forceFailure = Boolean(body.forceFailure);

  const generated = await generateSimulatedEvent({
    sourceType: sourceType || undefined,
    forceFailure,
    correlationId: body.correlationId || undefined
  });

  return created(generated);
});

module.exports = { handler };
