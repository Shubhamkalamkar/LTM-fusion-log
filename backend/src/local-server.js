'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const logger = require('./utils/logger');
const { getDbAdapter, getActiveDbMode } = require('./db/dbClient');
const dashboardLambda = require('./handlers/dashboard');
const fusionJobsLambda = require('./handlers/fusionJobs');
const oicIntegrationsLambda = require('./handlers/oicIntegrations');
const incidentsLambda = require('./handlers/incidents');
const dataGeneratorLambda = require('./handlers/dataGenerator');

/**
 * Adapts Express req/res into an AWS API Gateway Proxy Event & Context,
 * invoking the exact same Lambda handler functions used in production AWS.
 */
function invokeLambda(lambdaModule, pathParamKeys = []) {
  return async (req, res) => {
    const pathParameters = {};
    for (const k of pathParamKeys) {
      if (req.params[k] !== undefined) pathParameters[k] = req.params[k];
    }

    const requestId = req.header('X-Request-Id') || crypto.randomUUID();
    const normalizedPath = req.path.replace(/^\/api/, '') || '/';

    const event = {
      httpMethod: req.method,
      path: normalizedPath,
      pathParameters: Object.keys(pathParameters).length ? pathParameters : null,
      queryStringParameters: Object.keys(req.query).length ? req.query : null,
      headers: req.headers,
      body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null,
      requestContext: { requestId }
    };

    const context = {
      awsRequestId: requestId,
      callbackWaitsForEmptyEventLoop: false
    };

    const result = await lambdaModule.handler(event, context);
    res.status(result.statusCode || 200);
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }
    res.send(result.body);
  };
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve Angular 20 production build output
  const angularDistDir = path.join(__dirname, '../../frontend/dist/oracle-monitor/browser');
  app.use(express.static(angularDistDir));

  // Mount REST routes on both "/" and "/api" prefixes (matching OpenAPI & SPA)
  const prefixes = ['', '/api'];
  for (const prefix of prefixes) {
    app.get(`${prefix}/dashboard/summary`, invokeLambda(dashboardLambda));
    app.get(`${prefix}/dashboard/metadata`, invokeLambda(dashboardLambda));

    app.get(`${prefix}/fusion/jobs`, invokeLambda(fusionJobsLambda));
    app.get(`${prefix}/fusion/jobs/failed`, invokeLambda(fusionJobsLambda));
    app.get(`${prefix}/fusion/jobs/:executionId`, invokeLambda(fusionJobsLambda, ['executionId']));

    app.get(`${prefix}/oic/integrations`, invokeLambda(oicIntegrationsLambda));
    app.get(`${prefix}/oic/integrations/failed`, invokeLambda(oicIntegrationsLambda));
    app.get(`${prefix}/oic/integrations/:instanceId`, invokeLambda(oicIntegrationsLambda, ['instanceId']));

    app.get(`${prefix}/incidents`, invokeLambda(incidentsLambda));
    app.get(`${prefix}/incidents/:incidentId`, invokeLambda(incidentsLambda, ['incidentId']));
    app.put(`${prefix}/incidents/:incidentId/status`, invokeLambda(incidentsLambda, ['incidentId']));
    app.post(`${prefix}/incidents/:incidentId/retry`, invokeLambda(incidentsLambda, ['incidentId']));

    app.post(`${prefix}/simulator/tick`, invokeLambda(dataGeneratorLambda));
  }

  // Health probe
  app.get('/health', async (req, res) => {
    await getDbAdapter();
    res.json({ status: 'ok', dbMode: getActiveDbMode(), timestamp: new Date().toISOString() });
  });

  // Fallback to Angular 20 SPA index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(angularDistDir, 'index.html'));
  });

  return app;
}

if (require.main === module) {
  (async () => {
    await getDbAdapter();
    const app = createApp();
    app.listen(env.port, () => {
      logger.info({
        message: `Oracle Cloud Monitoring local server running at http://localhost:${env.port}`,
        dbMode: getActiveDbMode()
      });
    });
  })();
}

module.exports = { createApp };
