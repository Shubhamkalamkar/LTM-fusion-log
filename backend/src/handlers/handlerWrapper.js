'use strict';

const logger = require('../utils/logger');
const { getRequestId, errorResponse, AppError } = require('../utils/response');

/**
 * Wraps AWS Lambda handlers with:
 *  - context.callbackWaitsForEmptyEventLoop = false (for RDS pool reuse)
 *  - CloudWatch structured logging (requestId, endpoint, status, durationMs)
 *  - Sanitized error responses without stack trace leakage
 */
function withLambdaGuard(handlerName, fn) {
  return async (event = {}, context = {}) => {
    if (context && typeof context === 'object') {
      context.callbackWaitsForEmptyEventLoop = false;
    }

    const requestId = getRequestId(event, context);
    const endpoint = `${event.httpMethod || 'EVENT'} ${event.path || handlerName}`;
    const startMs = Date.now();

    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id'
        },
        body: ''
      };
    }

    try {
      const result = await fn(event, context, requestId);
      const durationMs = Date.now() - startMs;
      logger.info({ handler: handlerName, requestId, endpoint, statusCode: result.statusCode, durationMs });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      if (err instanceof AppError) {
        logger.warn({ handler: handlerName, requestId, endpoint, statusCode: err.statusCode, durationMs, message: err.message });
        return errorResponse(err.statusCode, err.message, requestId, err.details);
      }
      logger.error({ handler: handlerName, requestId, endpoint, statusCode: 500, durationMs }, err);
      return errorResponse(500, 'An internal server error occurred while processing the request.', requestId);
    }
  };
}

module.exports = { withLambdaGuard };
