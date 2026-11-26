'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardRepository = require('../src/repositories/dashboardRepository');
const fusionRepository = require('../src/repositories/fusionRepository');
const oicRepository = require('../src/repositories/oicRepository');
const incidentRepository = require('../src/repositories/incidentRepository');

const dashboardLambda = require('../src/handlers/dashboard');
const fusionJobsLambda = require('../src/handlers/fusionJobs');
const oicIntegrationsLambda = require('../src/handlers/oicIntegrations');
const incidentsLambda = require('../src/handlers/incidents');

function makeEvent({ method = 'GET', path = '/', pathParameters = null, query = null, body = null } = {}) {
  return {
    httpMethod: method,
    path,
    pathParameters,
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : null,
    requestContext: { requestId: 'req-test-1' }
  };
}

test('GET /dashboard/summary calculates KPIs and success rates', async (t) => {
  t.mock.method(dashboardRepository, 'getSummaryDataset', async () => ({
    fusion: [
      { execution_id: 'FUS1001', job_name: 'Import Payables', module: 'Payables', status: 'SUCCESS', severity: 'Low', start_time: '2026-11-25 09:00:00' },
      { execution_id: 'FUS1002', job_name: 'Create Accounting', module: 'General Ledger', status: 'FAILED', severity: 'Critical', error_code: 'FIN-PERIOD', error_category: 'Finance control', error_message: 'Accounting period is closed', start_time: '2026-11-25 09:10:00', incident_id: 'INC001', incident_status: 'Open' }
    ],
    oic: [
      { instance_id: 'OIC2006', integration_name: 'Payment Integration', process_family: 'Finance', target_system_id: 'DS06', target_system_name: 'Banking System', status: 'FAILED', severity: 'Critical', error_code: 'APP-500', error_category: 'Application', error_message: 'HTTP 500 from target', start_time: '2026-11-25 11:15:00', incident_id: 'INC005', incident_status: 'Investigating' }
    ],
    incidents: [
      { incident_id: 'INC001', downstream_system_id: null, status: 'Open' },
      { incident_id: 'INC005', downstream_system_id: 'DS06', status: 'Investigating' }
    ],
    downstreamSystems: [
      { system_id: 'DS06', system_name: 'Banking System', system_type: 'Finance', criticality: 'Critical' }
    ]
  }));
  t.mock.method(dashboardRepository, 'getMetadata', async () => ({ modules: ['General Ledger', 'Payables'] }));

  const res = await dashboardLambda.handler(makeEvent({ path: '/dashboard/summary' }), {});
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.fusionTotal, 2);
  assert.equal(body.fusionFailed, 1);
  assert.equal(body.fusionSuccessRate, 50);
  assert.equal(body.criticalFailures, 2);
  assert.equal(body.openIncidents, 2);
  assert.equal(body.impactedSystems[0].healthStatus, 'Impacted');
});

test('GET /fusion/jobs validates query parameters and returns 400 on invalid input', async () => {
  const badStatus = await fusionJobsLambda.handler(makeEvent({ path: '/fusion/jobs', query: { status: 'INVALID' } }), {});
  assert.equal(badStatus.statusCode, 400);

  const badDates = await fusionJobsLambda.handler(makeEvent({ path: '/fusion/jobs', query: { dateFrom: '2026-11-26', dateTo: '2026-11-20' } }), {});
  assert.equal(badDates.statusCode, 400);
});

test('GET /oic/integrations/{instanceId} returns 404 when missing and correlation when found', async (t) => {
  t.mock.method(oicRepository, 'getExecutionById', async (id) => (
    id === 'OIC2005'
      ? { instance_id: 'OIC2005', integration_name: 'Shipment Integration', process_family: 'Supply Chain', correlation_id: 'CORR-SCM-05', start_time: '2026-11-25 10:07:00', target_system_name: 'Warehouse Management System', target_criticality: 'Critical', status: 'FAILED' }
      : null
  ));
  t.mock.method(incidentRepository, 'findCorrelatedExecutions', async () => ({
    exactFusion: [{ execution_id: 'FUS1005', job_name: 'Refresh Supply Planning Data', status: 'FAILED' }],
    exactOic: [{ instance_id: 'OIC2005', integration_name: 'Shipment Integration', status: 'FAILED', target_system_id: 'DS05', target_system_name: 'Warehouse Management System', target_criticality: 'Critical' }],
    nearbyFusion: [],
    nearbyOic: []
  }));

  const missing = await oicIntegrationsLambda.handler(makeEvent({ path: '/oic/integrations/OIC9999', pathParameters: { instanceId: 'OIC9999' } }), {});
  assert.equal(missing.statusCode, 404);

  const found = await oicIntegrationsLambda.handler(makeEvent({ path: '/oic/integrations/OIC2005', pathParameters: { instanceId: 'OIC2005' } }), {});
  assert.equal(found.statusCode, 200);
  const data = JSON.parse(found.body);
  assert.equal(data.correlation.relationshipType, 'Exact Correlation');
  assert.equal(data.correlation.isExactMatch, true);
});

test('POST /incidents/{incidentId}/retry simulates retry and blocks resolved incidents', async (t) => {
  let retried = false;
  t.mock.method(incidentRepository, 'getIncidentById', async (id) => {
    if (id === 'INC001') return { incident_id: 'INC001', status: 'Resolved' };
    return {
      incident_id: 'INC005',
      source_type: 'OIC',
      source_execution_id: 'OIC2006',
      module_or_family: 'Finance',
      status: retried ? 'Retry Initiated' : 'Investigating',
      retry_count: retried ? 2 : 1,
      created_at: '2026-11-25 11:15:25',
      history: []
    };
  });
  t.mock.method(oicRepository, 'getExecutionById', async () => ({ instance_id: 'OIC2006', process_family: 'Finance', start_time: '2026-11-25 11:15:00' }));
  t.mock.method(incidentRepository, 'findCorrelatedExecutions', async () => ({ exactFusion: [], exactOic: [], nearbyFusion: [], nearbyOic: [] }));
  t.mock.method(incidentRepository, 'retryIncident', async () => { retried = true; });

  const blocked = await incidentsLambda.handler(makeEvent({ method: 'POST', path: '/incidents/INC001/retry', pathParameters: { incidentId: 'INC001' } }), {});
  assert.equal(blocked.statusCode, 400);

  const okRes = await incidentsLambda.handler(makeEvent({ method: 'POST', path: '/incidents/INC005/retry', pathParameters: { incidentId: 'INC005' }, body: { performedBy: 'ops' } }), {});
  assert.equal(okRes.statusCode, 200);
  const updated = JSON.parse(okRes.body);
  assert.equal(updated.status, 'Retry Initiated');
  assert.equal(updated.retry_count, 2);
});
