'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resetDbAdapterForTest } = require('../src/db/dbClient');
const { MemoryAdapter } = require('../src/db/memoryAdapter');

const dashboardLambda = require('../src/handlers/dashboard');
const fusionJobsLambda = require('../src/handlers/fusionJobs');
const oicIntegrationsLambda = require('../src/handlers/oicIntegrations');
const incidentsLambda = require('../src/handlers/incidents');
const dataGeneratorLambda = require('../src/handlers/dataGenerator');

function makeEvent({ method = 'GET', path = '/', pathParameters = null, query = null, body = null } = {}) {
  return {
    httpMethod: method,
    path,
    pathParameters,
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : null,
    requestContext: { requestId: `test-req-${Date.now()}` }
  };
}

test.beforeEach(() => {
  resetDbAdapterForTest(new MemoryAdapter(), 'memory');
});

test('Scenario 1 & KPIs: GET /dashboard/summary computes totals, rates, critical failures, and impacted systems', async () => {
  const res = await dashboardLambda.handler(makeEvent({ path: '/dashboard/summary' }), {});
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);

  assert.equal(data.fusionTotal, 125);
  assert.equal(data.oicTotal, 90);
  assert.ok(data.fusionSuccessRate > 75 && data.fusionSuccessRate <= 100);
  assert.ok(data.oicSuccessRate > 75 && data.oicSuccessRate <= 100);
  assert.ok(data.criticalFailures > 0);
  assert.ok(data.openIncidents > 0);
  assert.equal(data.impactedSystems.length, 6);

  // Verify Scenario 1 (Create Accounting FUS1002) is present in Fusion jobs
  const fusRes = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs/FUS1002', pathParameters: { executionId: 'FUS1002' } }),
    {}
  );
  assert.equal(fusRes.statusCode, 200);
  const fus = JSON.parse(fusRes.body);
  assert.equal(fus.job_name, 'Create Accounting');
  assert.equal(fus.severity, 'Critical');
  assert.equal(fus.error_message, 'Accounting period is closed');
});

test('Scenario 2: GET /oic/integrations/OIC2006 identifies Banking System downstream impact and INC005', async () => {
  const res = await oicIntegrationsLambda.handler(
    makeEvent({ path: '/oic/integrations/OIC2006', pathParameters: { instanceId: 'OIC2006' } }),
    {}
  );
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.integration_name, 'Payment Integration');
  assert.equal(data.target_system_name, 'Banking System');
  assert.equal(data.target_criticality, 'Critical');
  assert.equal(data.status, 'FAILED');
  assert.equal(data.incident_id, 'INC005');
});

test('Scenario 3: Filtering status=FAILED&severity=Critical returns only matching failures', async () => {
  const res = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs', query: { status: 'FAILED', severity: 'Critical', limit: '50' } }),
    {}
  );
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok(data.items.length > 0);
  for (const row of data.items) {
    assert.equal(row.status, 'FAILED');
    assert.equal(row.severity, 'Critical');
  }
});

test('Scenario 4: Retry simulation increments retry_count, sets Retry Initiated, and logs history', async () => {
  const beforeRes = await incidentsLambda.handler(
    makeEvent({ path: '/incidents/INC005', pathParameters: { incidentId: 'INC005' } }),
    {}
  );
  const before = JSON.parse(beforeRes.body);
  assert.equal(before.retry_count, 1);

  const retryRes = await incidentsLambda.handler(
    makeEvent({
      method: 'POST',
      path: '/incidents/INC005/retry',
      pathParameters: { incidentId: 'INC005' },
      body: { performedBy: 'qa.engineer', notes: 'Retrying payment gateway after bank maintenance' }
    }),
    {}
  );
  assert.equal(retryRes.statusCode, 200);
  const after = JSON.parse(retryRes.body);
  assert.equal(after.retry_count, 2);
  assert.equal(after.status, 'Retry Initiated');
  assert.ok(after.last_retry_at);
  assert.equal(after.history[0].action, 'RETRY_SIMULATED');
  assert.equal(after.history[0].new_status, 'Retry Initiated');
});

test('Scenario 5: Correlation links Fusion SCM (FUS1005) -> OIC Shipment (OIC2005) -> WMS (DS05)', async () => {
  const res = await incidentsLambda.handler(
    makeEvent({ path: '/incidents/INC004', pathParameters: { incidentId: 'INC004' } }),
    {}
  );
  assert.equal(res.statusCode, 200);
  const inc = JSON.parse(res.body);
  assert.equal(inc.correlation.relationshipType, 'Exact Correlation');
  assert.equal(inc.correlation.isExactMatch, true);
  assert.equal(inc.correlation.fusionExecutions[0].execution_id, 'FUS1005');
  assert.equal(inc.correlation.oicExecutions[0].instance_id, 'OIC2005');
  assert.equal(inc.correlation.impactedDownstream[0].system_name, 'Warehouse Management System');
  assert.match(inc.correlation.businessImpact, /Supply-chain/i);
});

test('Correlation time-window fallback labels Potential Relationship without claiming causation', async () => {
  const res = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs/FUS1006', pathParameters: { executionId: 'FUS1006' } }),
    {}
  );
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.equal(data.correlation.relationshipType, 'Potential Relationship (Time-Window)');
  assert.equal(data.correlation.isExactMatch, false);
  assert.match(data.correlation.businessImpact, /causation is not confirmed/i);
});

test('Validation & Negative cases: returns 400 on bad params, 404 on missing IDs, 400 on retrying Resolved incident', async () => {
  // Invalid status query
  const badStatus = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs', query: { status: 'BOGUS' } }),
    {}
  );
  assert.equal(badStatus.statusCode, 400);
  const badStatusBody = JSON.parse(badStatus.body);
  assert.ok(badStatusBody.requestId);
  assert.ok(badStatusBody.timestamp);

  // Invalid date range
  const badDates = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs', query: { dateFrom: '2026-11-26', dateTo: '2026-11-20' } }),
    {}
  );
  assert.equal(badDates.statusCode, 400);

  // Missing execution 404
  const notFound = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs/FUS9999', pathParameters: { executionId: 'FUS9999' } }),
    {}
  );
  assert.equal(notFound.statusCode, 404);

  // Resolve incident then verify retry is rejected with 400
  const resolveRes = await incidentsLambda.handler(
    makeEvent({
      method: 'PUT',
      path: '/incidents/INC001/status',
      pathParameters: { incidentId: 'INC001' },
      body: { status: 'Resolved', notes: 'Period opened' }
    }),
    {}
  );
  assert.equal(resolveRes.statusCode, 200);

  const retryClosed = await incidentsLambda.handler(
    makeEvent({ method: 'POST', path: '/incidents/INC001/retry', pathParameters: { incidentId: 'INC001' } }),
    {}
  );
  assert.equal(retryClosed.statusCode, 400);
});

test('CSV export & Data Generator Lambda produce valid CSV and new simulated failures', async () => {
  const csvRes = await fusionJobsLambda.handler(
    makeEvent({ path: '/fusion/jobs/failed', query: { format: 'csv' } }),
    {}
  );
  assert.equal(csvRes.statusCode, 200);
  assert.match(csvRes.headers['Content-Type'], /text\/csv/);
  assert.match(csvRes.body, /^Execution ID,Job Name,Module/);

  const simRes = await dataGeneratorLambda.handler(
    makeEvent({ method: 'POST', path: '/simulator/tick', body: { sourceType: 'OIC', forceFailure: true } }),
    {}
  );
  assert.equal(simRes.statusCode, 201);
  const simBody = JSON.parse(simRes.body);
  assert.equal(simBody.sourceType, 'OIC');
  assert.equal(simBody.execution.status, 'FAILED');
  assert.ok(simBody.incident);
});
