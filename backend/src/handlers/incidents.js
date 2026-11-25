'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const incidentService = require('../services/incidentService');
const { ok, csvResponse, AppError } = require('../utils/response');
const {
  VALID_INCIDENT_STATUSES,
  VALID_SEVERITIES,
  VALID_SOURCE_TYPES,
  assertValidId,
  validateEnum,
  validatePagination,
  parseJsonBody
} = require('../utils/validator');
const { toCsv } = require('../utils/csv');

const INCIDENT_CSV_COLUMNS = [
  { key: 'incident_id', label: 'Incident ID' },
  { key: 'source_type', label: 'Source' },
  { key: 'source_execution_id', label: 'Execution ID' },
  { key: 'process_name', label: 'Process' },
  { key: 'module_or_family', label: 'Module / Family' },
  { key: 'downstream_system_name', label: 'Downstream System' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'retry_count', label: 'Retry Count' },
  { key: 'error_code', label: 'Error Code' },
  { key: 'error_message', label: 'Error Message' },
  { key: 'created_at', label: 'Created At (UTC)' },
  { key: 'last_retry_at', label: 'Last Retry At (UTC)' }
];

const handler = withLambdaGuard('IncidentsLambda', async (event) => {
  const method = (event.httpMethod || 'GET').toUpperCase();
  const path = event.path || '/incidents';
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  // PUT /incidents/{incidentId}/status
  if (method === 'PUT' && path.endsWith('/status')) {
    const incidentId = assertValidId(pathParams.incidentId, 'incidentId');
    const body = parseJsonBody(event);
    const status = validateEnum(body.status, VALID_INCIDENT_STATUSES, 'status');
    if (!status) {
      throw new AppError(400, 'status is required in request body', [`Allowed values: ${VALID_INCIDENT_STATUSES.join(', ')}`]);
    }
    const updated = await incidentService.updateIncidentStatus(incidentId, status, {
      notes: body.notes ? String(body.notes).slice(0, 450) : undefined,
      performedBy: body.performedBy ? String(body.performedBy).slice(0, 60) : 'ops-engineer'
    });
    return ok(updated);
  }

  // POST /incidents/{incidentId}/retry
  if (method === 'POST' && path.endsWith('/retry')) {
    const incidentId = assertValidId(pathParams.incidentId, 'incidentId');
    const body = parseJsonBody(event);
    const updated = await incidentService.retryIncident(incidentId, {
      notes: body.notes ? String(body.notes).slice(0, 450) : undefined,
      performedBy: body.performedBy ? String(body.performedBy).slice(0, 60) : 'ops-engineer'
    });
    return ok(updated);
  }

  // GET /incidents/{incidentId}
  if (method === 'GET' && pathParams.incidentId) {
    const incidentId = assertValidId(pathParams.incidentId, 'incidentId');
    const detail = await incidentService.getIncidentDetail(incidentId);
    return ok(detail);
  }

  // GET /incidents
  if (method === 'GET') {
    const pagination = validatePagination(query);
    const filters = {
      status: validateEnum(query.status, VALID_INCIDENT_STATUSES, 'status'),
      severity: validateEnum(query.severity, VALID_SEVERITIES, 'severity'),
      sourceType: validateEnum(query.sourceType, VALID_SOURCE_TYPES, 'sourceType'),
      module: query.module ? String(query.module).trim() : null,
      search: query.search ? String(query.search).trim() : null,
      format: query.format ? String(query.format).toLowerCase() : 'json',
      ...pagination
    };

    if (filters.format === 'csv') {
      const result = await incidentService.listIncidents({ ...filters, all: true });
      const csv = toCsv(result.items, INCIDENT_CSV_COLUMNS);
      return csvResponse('failure-incidents.csv', csv);
    }

    const result = await incidentService.listIncidents(filters);
    return ok({
      items: result.items,
      total: result.total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(result.total / filters.limit))
    });
  }

  throw new AppError(400, `Unsupported method/path: ${method} ${path}`);
});

module.exports = { handler };
