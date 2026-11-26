'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const oicService = require('../services/oicService');
const { ok, csvResponse } = require('../utils/response');
const { assertValidId, validateExecutionFilters } = require('../utils/validator');
const { toCsv } = require('../utils/csv');

const OIC_CSV_COLUMNS = [
  { key: 'instance_id', label: 'Instance ID' },
  { key: 'integration_name', label: 'Integration Name' },
  { key: 'source_system', label: 'Source System' },
  { key: 'target_system_name', label: 'Downstream Target' },
  { key: 'target_criticality', label: 'Target Criticality' },
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
 * AWS Lambda Handler: OicIntegrationsLambda
 * Routes handled:
 *  - GET /oic/integrations/{instanceId} -> Single OIC instance detail + downstream impact + correlation
 *  - GET /oic/integrations/failed       -> Failed OIC instances (JSON or CSV)
 *  - GET /oic/integrations              -> Filtered, sorted, paginated OIC instances (JSON or CSV)
 */
const handler = withLambdaGuard('OicIntegrationsLambda', async (event) => {
  const path = event.path || '/oic/integrations';
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  // Route: GET /oic/integrations/{instanceId} (single OIC instance detail + correlation)
  if (pathParams.instanceId) {
    const instanceId = assertValidId(pathParams.instanceId, 'instanceId');
    const detail = await oicService.getOicExecutionDetail(instanceId);
    return ok(detail);
  }

  const filters = validateExecutionFilters(query, { source: true, target: true, integration: true });

  // Route: GET /oic/integrations/failed (forces status = 'FAILED' filter)
  if (path.endsWith('/failed')) {
    filters.status = 'FAILED';
  }

  // Route: GET /oic/integrations?format=csv OR /oic/integrations/failed?format=csv (CSV export)
  if (filters.format === 'csv') {
    const result = await oicService.listOicExecutions({ ...filters, all: true });
    const csv = toCsv(result.items, OIC_CSV_COLUMNS);
    return csvResponse('oic-integrations.csv', csv);
  }

  // Route: GET /oic/integrations (and /oic/integrations/failed) returning paginated JSON results
  const result = await oicService.listOicExecutions(filters);
  return ok({
    items: result.items,
    total: result.total,
    page: filters.page,
    limit: filters.limit,
    totalPages: Math.max(1, Math.ceil(result.total / filters.limit))
  });
});

module.exports = { handler };
