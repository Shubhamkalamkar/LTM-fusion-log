'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const dashboardService = require('../services/dashboardService');
const dashboardRepository = require('../repositories/dashboardRepository');
const { ok } = require('../utils/response');
const { validateDateParam } = require('../utils/validator');

/**
 * AWS Lambda Handler: DashboardLambda
 * Routes handled:
 *  - GET /dashboard/metadata -> Master metadata & active DB mode
 *  - GET /dashboard/summary  -> KPIs, success rates, critical failures & downstream health
 */
const handler = withLambdaGuard('DashboardLambda', async (event) => {
  const path = event.path || '/dashboard/summary';
  const query = event.queryStringParameters || {};

  // Route: GET /dashboard/metadata (returns modules, sources, downstream systems & active store mode)
  if (path.endsWith('/metadata')) {
    const meta = await dashboardRepository.getMetadata();
    return ok(meta);
  }

  // Route: GET /dashboard/summary?module=...&dateFrom=...&dateTo=... (computes dashboard KPIs & metrics)
  const dateFrom = validateDateParam(query.dateFrom, 'dateFrom');
  const dateTo = validateDateParam(query.dateTo, 'dateTo');
  const moduleFilter = query.module ? String(query.module).trim() : null;

  const summary = await dashboardService.getDashboardSummary({
    dateFrom,
    dateTo,
    module: moduleFilter
  });

  return ok(summary);
});

module.exports = { handler };
