'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const { generateSimulatedEvent } = require('../services/dataGeneratorService');
const { created } = require('../utils/response');
const { parseJsonBody, validateEnum, VALID_SOURCE_TYPES } = require('../utils/validator');

/**
 * AWS Lambda Handler: DataGeneratorLambda
 * Routes / Triggers handled:
 *  - POST /simulator/tick             -> Manual simulation trigger from UI / API Gateway (returns 201)
 *  - Amazon EventBridge Schedule      -> Automatic event generation every 5 minutes
 */
const handler = withLambdaGuard('DataGeneratorLambda', async (event) => {
  // Route: POST /simulator/tick (HTTP proxy body) OR direct EventBridge event payload
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
