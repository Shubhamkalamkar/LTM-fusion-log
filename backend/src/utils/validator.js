'use strict';

const { AppError } = require('./response');

const VALID_EXEC_STATUSES = ['SUCCESS', 'FAILED', 'RUNNING', 'WARNING'];
const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const VALID_INCIDENT_STATUSES = ['Open', 'Investigating', 'Retry Initiated', 'Resolved', 'Closed'];
const VALID_SOURCE_TYPES = ['FUSION', 'OIC'];

const ID_PATTERN = /^[A-Za-z0-9_-]{2,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/;

function assertValidId(value, fieldName = 'id') {
  if (!value || typeof value !== 'string' || !ID_PATTERN.test(value.trim())) {
    throw new AppError(400, `Invalid ${fieldName} format`, [`${fieldName} must be 2-40 alphanumeric/dash/underscore characters`]);
  }
  return value.trim();
}

function validateEnum(value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (!allowed.includes(value)) {
    throw new AppError(400, `Invalid ${fieldName}: '${value}'`, [`Allowed values: ${allowed.join(', ')}`]);
  }
  return value;
}

function validateDateParam(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  const trimmed = String(value).trim();
  if (!DATE_PATTERN.test(trimmed) || Number.isNaN(Date.parse(trimmed.replace(' ', 'T')))) {
    throw new AppError(400, `Invalid ${fieldName}: '${value}'`, [`${fieldName} must be YYYY-MM-DD or ISO datetime`]);
  }
  return trimmed;
}

function validatePagination(query = {}) {
  const pageRaw = query.page !== undefined ? Number(query.page) : 1;
  const limitRaw = query.limit !== undefined ? Number(query.limit) : 20;

  if (!Number.isInteger(pageRaw) || pageRaw < 1 || pageRaw > 1000) {
    throw new AppError(400, 'Invalid page parameter', ['page must be an integer between 1 and 1000']);
  }
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 200) {
    throw new AppError(400, 'Invalid limit parameter', ['limit must be an integer between 1 and 200']);
  }
  return { page: pageRaw, limit: limitRaw, offset: (pageRaw - 1) * limitRaw };
}

function parseJsonBody(event) {
  if (!event || !event.body) return {};
  if (typeof event.body === 'object') return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    throw new AppError(400, 'Request body must be valid JSON');
  }
}

function validateExecutionFilters(query = {}, extraAllowed = {}) {
  const status = validateEnum(query.status, VALID_EXEC_STATUSES, 'status');
  const severity = validateEnum(query.severity, VALID_SEVERITIES, 'severity');
  const dateFrom = validateDateParam(query.dateFrom, 'dateFrom');
  const dateTo = validateDateParam(query.dateTo, 'dateTo');

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError(400, 'dateFrom cannot be later than dateTo');
  }

  const pagination = validatePagination(query);
  const sortOrder = query.sortOrder && ['asc', 'desc'].includes(String(query.sortOrder).toLowerCase())
    ? String(query.sortOrder).toLowerCase()
    : 'desc';

  const result = {
    status,
    severity,
    dateFrom,
    dateTo,
    search: query.search ? String(query.search).trim() : null,
    sortBy: query.sortBy ? String(query.sortBy).trim() : 'start_time',
    sortOrder,
    format: query.format ? String(query.format).toLowerCase() : 'json',
    ...pagination
  };

  for (const key of Object.keys(extraAllowed)) {
    result[key] = query[key] ? String(query[key]).trim() : null;
  }

  return result;
}

module.exports = {
  VALID_EXEC_STATUSES,
  VALID_SEVERITIES,
  VALID_INCIDENT_STATUSES,
  VALID_SOURCE_TYPES,
  assertValidId,
  validateEnum,
  validateDateParam,
  validatePagination,
  parseJsonBody,
  validateExecutionFilters
};
