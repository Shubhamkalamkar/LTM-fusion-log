'use strict';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id'
};

function getRequestId(event, context) {
  return (
    (event && event.requestContext && event.requestContext.requestId) ||
    (context && context.awsRequestId) ||
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function ok(data) {
  return json(200, data);
}

function created(data) {
  return json(201, data);
}

function csvResponse(filename, csvContent) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id'
    },
    body: csvContent
  };
}

function errorResponse(statusCode, message, requestId, details) {
  const payload = {
    requestId,
    timestamp: new Date().toISOString(),
    statusCode,
    message
  };
  if (details && details.length) {
    payload.details = details;
  }
  return json(statusCode, payload);
}

class AppError extends Error {
  constructor(statusCode, message, details = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = {
  getRequestId,
  ok,
  created,
  csvResponse,
  errorResponse,
  AppError
};
