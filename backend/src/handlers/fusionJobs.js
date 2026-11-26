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

/**
 * AWS Lambda Handler: FusionJobsLambda
 * Routes handled:
 *  - GET /fusion/jobs/{executionId} -> Single Fusion execution detail + correlation chain
 *  - GET /fusion/jobs/failed        -> Failed Fusion executions (JSON or CSV)
 *  - GET /fusion/jobs               -> Filtered, sorted, paginated Fusion executions (JSON or CSV)
 */
const handler = withLambdaGuard('FusionJobsLambda', async (event) => {
  const path = event.path || '/fusion/jobs';
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  // Route: GET /fusion/jobs/{executionId} (single Fusion execution detail + correlation)
  if (pathParams.executionId) {
    const executionId = assertValidId(pathParams.executionId, 'executionId');
    const detail = await fusionService.getFusionExecutionDetail(executionId);
    return ok(detail);
  }

  const filters = validateExecutionFilters(query, { module: true, jobName: true });

  // Route: GET /fusion/jobs/failed (forces status = 'FAILED' filter)
  if (path.endsWith('/failed')) {
    filters.status = 'FAILED';
  }

  // Route: GET /fusion/jobs?format=csv OR /fusion/jobs/failed?format=csv (downloads all matching rows as CSV)
  if (filters.format === 'csv') {
    const result = await fusionService.listFusionExecutions({ ...filters, all: true });
    const csv = toCsv(result.items, FUSION_CSV_COLUMNS);
    return csvResponse('fusion-executions.csv', csv);
  }

  // Route: GET /fusion/jobs (and /fusion/jobs/failed) returning paginated JSON results
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
