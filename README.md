# Oracle Fusion Cloud & OIC Job Failure Monitoring Web Application

A serverless operations-monitoring prototype built with **Angular 20**, **Node.js (AWS Lambda handlers)**, **Amazon API Gateway (OpenAPI 3.0 + AWS SAM)**, and **MySQL / Amazon RDS for MySQL**.

> Note: No real Oracle Fusion Cloud or OIC instance is required. Operational executions, downstream impacts, correlations, and retries are simulated in AWS/MySQL, and the architecture is structured so real Oracle ESS & OIC REST pollers can replace the simulator with zero UI changes.

---

## 1. Repository Structure

```text
.
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                  # DB mode, MySQL/RDS & correlation window config
│   │   │   └── severityRules.json      # Configurable severity rules (fallback to DB table)
│   │   ├── db/
│   │   │   ├── pool.js                 # MySQL2 connection pool with Lambda reuse
│   │   │   ├── mysqlAdapter.js         # Parameterized SQL queries & transactions
│   │   │   ├── memoryAdapter.js        # Zero-DB in-memory fallback using the same dataset
│   │   │   └── dbClient.js             # Auto-selects MySQL or in-memory store
│   │   ├── repositories/               # Data-access layer (Fusion, OIC, Incidents, Dashboard)
│   │   ├── services/                   # Business rules: severity, correlation, retry, simulator
│   │   ├── handlers/                   # AWS Lambda handlers (Dashboard, Fusion, OIC, Incidents, DataGenerator)
│   │   ├── utils/                      # CloudWatch JSON logger, response builder, validator, CSV
│   │   └── local-server.js             # Local Express runner adapting req/res to Lambda Proxy events
│   └── tests/
│       └── api.test.js                 # Node.js test suite (all demo, validation, retry & correlation scenarios)
├── database/
│   ├── schema.sql                      # MySQL 8.0 DDL (8 normalized tables)
│   ├── dataset.js                      # Deterministic sample & 125/90 volume dataset generator
│   ├── generate-seed.js                # Generates database/seed.sql
│   ├── seed.sql                        # Pre-generated SQL seed script
│   └── docker-compose.yml              # One-command MySQL 8.0 container
├── frontend/                           # Angular 20 Standalone SPA
│   ├── angular.json
│   ├── proxy.conf.json                 # Dev proxy (/api -> http://localhost:3000)
│   └── src/app/
│       ├── models/                     # TypeScript domain interfaces
│       ├── services/                   # HttpClient REST API service & signals
│       ├── shared/                     # Reusable CorrelationPanelComponent & formatters
│       └── pages/                      # Dashboard, Fusion Monitor, OIC Monitor, Incidents & Detail views
├── infrastructure/
│   ├── template.yaml                   # AWS SAM template (API Gateway + 5 Lambdas + EventBridge)
│   └── openapi.yaml                    # OpenAPI 3.0 REST API specification
└── docs/
    ├── architecture.md                 # Mermaid diagrams & Real Oracle API migration guide
    └── test-results.md                 # Executed test scenarios and results
```

---

## 2. Quick Start (Local Development)

### Prerequisites
- **Node.js 20+** (`v24` verified)
- *(Optional for live MySQL)* **Docker Desktop** or local **MySQL 8.0**

### Step 1: Install Dependencies & Build Angular 20 UI
```powershell
cd "d:\Projects\LTM Assignment\backend"
npm install

cd "d:\Projects\LTM Assignment\frontend"
npm install
npm run build:local
```

### Step 2A: Run Instantly (Auto / In-Memory Fallback Mode)
If MySQL is not running locally, `DB_MODE=auto` automatically serves the exact same seeded dataset (125 Fusion executions, 90 OIC executions, 6 downstream systems, 24 incidents) in memory:
```powershell
cd "d:\Projects\LTM Assignment\backend"
npm start
```
Open **http://localhost:3000** in your browser.

### Step 2B: Run with MySQL 8.0 via Docker
```powershell
cd "d:\Projects\LTM Assignment\database"
docker compose up -d
```
Wait ~15 seconds for MySQL initialization (`schema.sql` and `seed.sql` load automatically), then start the backend in MySQL mode:
```powershell
cd "d:\Projects\LTM Assignment\backend"
$env:DB_MODE="mysql"
$env:DB_HOST="127.0.0.1"
$env:DB_USER="monitor_app"
$env:DB_PASSWORD="monitor_password"
$env:DB_NAME="oracle_monitoring"
npm start
```

### Step 3: Angular 20 Hot-Reload Mode (Optional)
Run the backend on port `3000` and Angular CLI dev server on port `4200`:
```powershell
cd "d:\Projects\LTM Assignment\frontend"
npm start -- --proxy-config proxy.conf.json
```

---

## 3. Running Automated Tests

```powershell
cd "d:\Projects\LTM Assignment\backend"
npm test
```

---

## 4. REST API Endpoints

| Method | Path | Lambda Handler | Purpose |
|---|---|---|---|
| `GET` | `/dashboard/summary` | `DashboardLambda` | KPIs, success rates, critical failures, downstream health |
| `GET` | `/fusion/jobs` | `FusionJobsLambda` | Filter/sort/paginate Fusion executions (`?format=csv` supported) |
| `GET` | `/fusion/jobs/failed` | `FusionJobsLambda` | List failed Fusion executions |
| `GET` | `/fusion/jobs/{executionId}` | `FusionJobsLambda` | Execution detail + correlation context |
| `GET` | `/oic/integrations` | `OicIntegrationsLambda` | Filter/sort/paginate OIC executions (`?format=csv` supported) |
| `GET` | `/oic/integrations/failed` | `OicIntegrationsLambda` | List failed OIC executions |
| `GET` | `/oic/integrations/{instanceId}` | `OicIntegrationsLambda` | Instance detail + downstream impact + correlation |
| `GET` | `/incidents` | `IncidentsLambda` | Filter/paginate incidents (`?format=csv` supported) |
| `GET` | `/incidents/{incidentId}` | `IncidentsLambda` | Incident detail + correlation chain + audit history |
| `PUT` | `/incidents/{incidentId}/status` | `IncidentsLambda` | Update status (`Open`, `Investigating`, `Retry Initiated`, `Resolved`, `Closed`) |
| `POST` | `/incidents/{incidentId}/retry` | `IncidentsLambda` | Simulate retry, increment retry count, record timestamp & history |
| `POST` | `/simulator/tick` | `DataGeneratorLambda` | Trigger simulated Fusion/OIC execution & auto-incident creation |

---

## 5. AWS Deployment (SAM + RDS + S3/CloudFront)

1. Provision Amazon RDS for MySQL 8.0 and run `database/schema.sql` followed by `database/seed.sql`.
2. Build and deploy the full AWS stack (API Gateway + 5 Lambdas + Private S3 Bucket + CloudFront OAC Distribution), passing `DbHost`, `DbUser`, and `DbPassword` during `sam deploy`:
   ```powershell
   sam build -t infrastructure/template.yaml
   sam deploy --guided
   ```
   Note the stack outputs: `ApiEndpoint`, `FrontendBucketName`, `CloudFrontDistributionId`, and `CloudFrontUrl`.
4. Update `apiBaseUrl` in `frontend/src/environments/environment.prod.ts` with your deployed `ApiEndpoint`, then build the production Angular 20 bundle:
   ```powershell
   cd "d:\Projects\LTM Assignment\frontend"
   npm run build
   ```
5. Sync the Angular 20 build to S3 and invalidate CloudFront cache:
   ```powershell
   aws s3 sync dist/oracle-monitor/browser/ s3://<FrontendBucketName>/ --delete
   aws cloudfront create-invalidation --distribution-id <CloudFrontDistributionId> --paths "/*"
   ```
6. Open `<CloudFrontUrl>` in your browser! Locally, `npm run build:local` uses `environment.ts` (`apiBaseUrl: '/api'`) so `http://localhost:3000` keeps working out of the box.
