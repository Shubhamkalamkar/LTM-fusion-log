'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const fusionService = require('../services/fusionService');
const { ok, csvResponse } = require('../utils/response');
const { assertValidId, validateExecutionFilters } = require('../utils/validator');
const { toCsv } = require('../utils/csv');

const FUSION_CSV_COLUMNS = [
  { key: 'execution_id', label: 'Execution ID' },
  { key: 'job_name', label: 'Job Name' },
  { key: 'module', label: 'Module' },
  { key: 'status', label: 'Status' },
  { key: 'severity', label: 'Severity' },
  { key: 'start_time', label: 'Start Time (UTC)' },
  { key: 'end_time', label: 'End Time (UTC)' },
  { key: 'duration_seconds', label: 'Duration (s)' },
  { key: 'error_code', label: 'Error Code' },
  { key: 'error_category', label: 'Error Category' },
  { key: 'error_message', label: 'Error Message' },
  { key: 'retry_count', label: 'Retry Count' },
  { key: 'correlation_id', label: 'Correlation ID' },
  { key: 'incident_id', label: 'Incident ID' }
];

const handler = withLambdaGuard('FusionJobsLambda', async (event) => {
  const path = event.path || '/fusion/jobs';
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  // GET /fusion/jobs/{executionId}
  if (pathParams.executionId) {
    const executionId = assertValidId(pathParams.executionId, 'executionId');
    const detail = await fusionService.getFusionExecutionDetail(executionId);
    return ok(detail);
  }

  const filters = validateExecutionFilters(query, { module: true, jobName: true });

  // GET /fusion/jobs/failed
  if (path.endsWith('/failed')) {
    filters.status = 'FAILED';
  }

  if (filters.format === 'csv') {
    const result = await fusionService.listFusionExecutions({ ...filters, all: true });
    const csv = toCsv(result.items, FUSION_CSV_COLUMNS);
    return csvResponse('fusion-executions.csv', csv);
  }

  const result = await fusionService.listFusionExecutions(filters);
  return ok({
    items: result.items,
    total: result.total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(result.total / filters.limit))
  });
});

module.exports = { handler };
