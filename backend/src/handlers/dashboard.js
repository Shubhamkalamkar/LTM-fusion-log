'use strict';

const { withLambdaGuard } = require('./handlerWrapper');
const dashboardService = require('../services/dashboardService');
const dashboardRepository = require('../repositories/dashboardRepository');
const { ok } = require('../utils/response');
const { validateDateParam } = require('../utils/validator');

const handler = withLambdaGuard('DashboardLambda', async (event) => {
  const path = event.path || '/dashboard/summary';
  const query = event.queryStringParameters || {};

  if (path.endsWith('/metadata')) {
    const meta = await dashboardRepository.getMetadata();
    return ok(meta);
  }

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
