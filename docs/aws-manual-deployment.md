# AWS Manual Deployment Guide (Step-by-Step Console Checklist)

Follow these steps in exact order to deploy the **Oracle Fusion Cloud & OIC Job Failure Monitoring** application manually using the **AWS Management Console** (no SAM CLI required).

---

## Part 1: Prepare the Lambda ZIP Package (Local Machine)

1. Open PowerShell and navigate to the `backend` folder:
   ```powershell
   cd "d:\Projects\LTM Assignment\backend"
   ```
2. Create `lambda-backend.zip` containing `src`, `package.json`, and `node_modules` at the **root** of the zip (do **not** nest them inside a `backend/` folder):
   ```powershell
   Compress-Archive -Path src, package.json, node_modules -DestinationPath ..\lambda-backend.zip -Force
   ```
3. Verify `d:\Projects\LTM Assignment\lambda-backend.zip` is created.
   - *(Tip: Inside the zip you should directly see `src/`, `package.json`, and `node_modules/`.)*

---

## Part 2: Create Amazon RDS for MySQL & Load Data

> **Fast Demo Skip:** If you want to test API Gateway + Lambda first **without** creating an RDS database, skip Part 2 and set `DB_MODE = memory` in Part 3 Step 4. Come back to Part 2 when ready for persistent MySQL.

1. Open **AWS Console → RDS → Databases → Create database**.
2. Choose:
   - **Engine type**: `MySQL` (version `8.0.x`)
   - **Templates**: `Free tier` (or `Dev/Test`)
   - **DB instance identifier**: `oracle-monitoring-db`
   - **Master username**: `admin` (or `monitor_app`)
   - **Credentials management**: Select **Self managed** and enter your master password (note down username and password).
   - **Additional configuration → Initial database name**: `oracle_monitoring`
   - **Connectivity → Public access**: `Yes` *(if you want to connect from your laptop's MySQL Workbench; restrict Inbound Rule to your IP!)*.
3. Click **Create database** and wait until status becomes **Available**.
4. Open the RDS instance → **Connectivity & security**:
   - Copy the **Endpoint** (e.g. `oracle-monitoring-db.xxxxxx.ap-south-1.rds.amazonaws.com`).
   - Click its **VPC security group** → **Edit inbound rules** → ensure **MYSQL/Aurora (TCP 3306)** allows:
     - Your current IP (for MySQL Workbench setup), and
     - Lambda access (either the Lambda Security Group if Lambdas are in the same VPC, or `0.0.0.0/0` temporarily for public RDS testing only).
5. Open **MySQL Workbench 8.0** on your PC → create a connection to the RDS Endpoint (`port 3306`, username/password from step 2):
   - Open and execute `database/schema.sql`.
   - Open and execute `database/seed.sql`.
   - Verify tables and counts (`125` rows in `fusion_job_executions`, `90` in `oic_integration_executions`, `20` in `failure_incidents`).

---

## Part 3: Create the 5 AWS Lambda Functions

Repeat Steps 1–5 for each of the **5 functions** listed in the table below.

1. Open **AWS Console → Lambda → Create function**.
2. Select **Author from scratch**:
   - **Function name**: *(from table below)*
   - **Runtime**: `Node.js 20.x`
   - **Architecture**: `x86_64`
   - Click **Create function**.
3. **Upload Code**:
   - Go to **Code** tab → **Upload from** → **.zip file** → select `d:\Projects\LTM Assignment\lambda-backend.zip` → **Save**.
   - Scroll to **Runtime settings** → click **Edit** → set **Handler** *(from table below)* → **Save**.

| # | Function Name | Handler |
|---|---|---|
| 1 | `oracle-monitor-dashboard` | `src/handlers/dashboard.handler` |
| 2 | `oracle-monitor-fusion-jobs` | `src/handlers/fusionJobs.handler` |
| 3 | `oracle-monitor-oic-integrations` | `src/handlers/oicIntegrations.handler` |
| 4 | `oracle-monitor-incidents` | `src/handlers/incidents.handler` |
| 5 | `oracle-monitor-data-generator` | `src/handlers/dataGenerator.handler` |

4. **Configure Timeout & Environment Variables** (on **all 5** functions):
   - Go to **Configuration → General configuration → Edit**:
     - Set **Memory**: `256 MB`
     - Set **Timeout**: `0 min 15 sec` → **Save**.
   - Go to **Configuration → Environment variables → Edit** and add:
     - **If using In-Memory mode (no RDS):**
       - `DB_MODE` = `memory`
     - **If using RDS MySQL:**
       - `DB_MODE` = `mysql`
       - `DB_HOST` = `<your-rds-endpoint>`
       - `DB_PORT` = `3306`
       - `DB_NAME` = `oracle_monitoring`
       - `DB_USER` = `<your-rds-username>`
       - `DB_PASSWORD` = `<your-rds-password>`
       - `CORRELATION_WINDOW_MINUTES` = `15`
5. *(Only if RDS is in a private VPC without public access)*:
   - Go to **Configuration → VPC → Edit** and select the same VPC, private subnets, and Lambda security group allowed by RDS port `3306`.
6. **Quick Lambda Smoke Test**:
   - On `oracle-monitor-dashboard` → **Test** tab → create test event `{ "httpMethod": "GET", "path": "/dashboard/summary" }` → click **Test** → verify `"statusCode": 200`.

---

## Part 4: Create & Configure Amazon API Gateway

1. Open **AWS Console → API Gateway → Create API**.
2. Under **REST API** (not Private), click **Build**.
3. Choose **New API**:
   - **API name**: `OracleCloudMonitoringApi`
   - **Endpoint Type**: `Regional`
   - Click **Create API**.
4. Create the following **Resources & Methods**. For **every** method, set:
   - **Integration type**: `Lambda Function`
   - **Lambda Proxy integration**: **CHECKED (ON)** *(critical so `event.pathParameters`, `event.queryStringParameters`, and `statusCode` work)*
   - **Lambda Function**: *(matching function from table below)*

| Path | Method | Target Lambda Function |
|---|---|---|
| `/dashboard/summary` | `GET` | `oracle-monitor-dashboard` |
| `/dashboard/metadata` | `GET` | `oracle-monitor-dashboard` |
| `/fusion/jobs` | `GET` | `oracle-monitor-fusion-jobs` |
| `/fusion/jobs/failed` | `GET` | `oracle-monitor-fusion-jobs` |
| `/fusion/jobs/{executionId}` | `GET` | `oracle-monitor-fusion-jobs` |
| `/oic/integrations` | `GET` | `oracle-monitor-oic-integrations` |
| `/oic/integrations/failed` | `GET` | `oracle-monitor-oic-integrations` |
| `/oic/integrations/{instanceId}` | `GET` | `oracle-monitor-oic-integrations` |
| `/incidents` | `GET` | `oracle-monitor-incidents` |
| `/incidents/{incidentId}` | `GET` | `oracle-monitor-incidents` |
| `/incidents/{incidentId}/status` | `PUT` | `oracle-monitor-incidents` |
| `/incidents/{incidentId}/retry` | `POST` | `oracle-monitor-incidents` |
| `/simulator/tick` | `POST` | `oracle-monitor-data-generator` |

> **Note on `{executionId}`, `{instanceId}`, `{incidentId}`:** When creating those child resources, check **"Configure as proxy resource"** = OFF and enter exact resource path `{executionId}`, `{instanceId}`, or `{incidentId}`.

5. **Enable CORS on Resources**:
   - Select each resource (or top-level resources) → **Enable CORS**:
     - **Access-Control-Allow-Methods**: `GET,POST,PUT,OPTIONS`
     - **Access-Control-Allow-Headers**: `Content-Type,Authorization,X-Request-Id`
     - **Access-Control-Allow-Origin**: `*`
   - Click **Save**.
6. **Deploy API**:
   - Click **Deploy API** → **Stage**: `*New Stage*` → **Stage name**: `prod` → **Deploy**.
   - Copy the **Invoke URL** shown at the top, e.g.:
     `https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod`
7. **Test API Gateway**:
   - Open `<Invoke-URL>/dashboard/summary` in your browser or `curl`. You should get JSON metrics (`fusionTotal`, `oicTotal`, etc.).

---

## Part 5: (Optional) Schedule Automatic Event Simulation

1. Open **AWS Console → Amazon EventBridge → Rules → Create rule**.
2. **Name**: `oracle-monitor-simulator-5min` → **Rule type**: `Schedule`.
3. Choose **A schedule that runs at a regular rate**: `5` `Minutes`.
4. **Target**: `AWS service` → `Lambda function` → select `oracle-monitor-data-generator`.
5. Click **Create rule**. Now a new simulated Fusion/OIC execution is inserted every 5 minutes.

---

## Part 6: Deploy Angular 20 Frontend to Amazon S3 + CloudFront

1. Open `frontend/src/environments/environment.prod.ts` and replace `apiBaseUrl` with your **API Gateway Invoke URL** from Part 4 Step 6:
   ```ts
   export const environment = {
     production: true,
     apiBaseUrl: 'https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod'
   };
   ```
2. Build the production Angular 20 bundle:
   ```powershell
   cd "d:\Projects\LTM Assignment\frontend"
   npm.cmd run build
   ```
   *(Output is created in `frontend/dist/oracle-monitor/browser/`.)*
3. **Create Private S3 Bucket**:
   - Open **AWS Console → S3 → Create bucket**.
   - **Bucket name**: e.g. `oracle-monitor-ui-<your-unique-suffix>`.
   - Keep **Block all public access** = **ON (checked)**.
   - Click **Create bucket**.
4. **Upload Frontend Files to S3**:
   - Open the bucket → **Upload** → **Add files & Add folder** → upload **everything inside** `frontend/dist/oracle-monitor/browser/` (`index.html`, `main-*.js`, `polyfills-*.js`, `styles-*.css`, `favicon.ico`).
   - *(Ensure `index.html` is at the root of the S3 bucket, not inside a `browser/` folder.)*
5. **Create CloudFront Distribution with OAC**:
   - Open **AWS Console → CloudFront → Create distribution**.
   - **Origin domain**: select your S3 bucket (`oracle-monitor-ui-...`).
   - **Origin access**: select **Origin access control settings (recommended)** → click **Create new OAC** → **Create**.
   - **Viewer protocol policy**: `Redirect HTTP to HTTPS`.
   - **Web Application Firewall (WAF)**: `Do not enable security protections` *(for prototype cost savings)*.
   - **Default root object**: `index.html`.
   - Click **Create distribution**.
6. **Apply S3 Bucket Policy for CloudFront**:
   - Right after creating the distribution, CloudFront shows a blue/yellow banner **"The S3 bucket policy needs to be updated"** → click **Copy policy**.
   - Open your **S3 bucket → Permissions → Bucket policy → Edit** → paste the copied policy → **Save changes**.
7. **Configure Angular SPA Route Fallback (Important!)**:
   - Open your **CloudFront Distribution → Error pages → Create custom error response**:
     - **Response 1**: HTTP error code `403` → Customize error response `Yes` → Response page path `/index.html` → HTTP response code `200 OK` → **Create**.
     - **Response 2**: HTTP error code `404` → Customize error response `Yes` → Response page path `/index.html` → HTTP response code `200 OK` → **Create**.
8. Wait ~3–5 minutes for CloudFront status to become **Deployed**, then open the **Distribution domain name** (`https://dxxxxxxxx.cloudfront.net`) in your browser!

---

## Part 7: Verify End-to-End & Monitor Logs

1. In the CloudFront dashboard UI:
   - Check KPIs load on **Operations Dashboard**.
   - Filter `Status = FAILED` & `Severity = Critical` on **Fusion Job Monitor**.
   - Open `OIC2006` on **OIC Integration Monitor** and verify `Banking System` impact.
   - Open `INC004` on **Incidents & Correlation** and verify `FUS1005 -> OIC2005 -> Warehouse Management System`.
   - Click **Simulate Retry** on an open incident and confirm `retry_count` increments and `incident_history` updates.
2. Open **AWS Console → CloudWatch → Log groups** → inspect `/aws/lambda/oracle-monitor-*` to verify structured JSON logs (`requestId`, `endpoint`, `statusCode`, `durationMs`).

> **Note for Local Development:** After deploying to AWS, if you want to continue testing locally on `http://localhost:3000`, run `npm.cmd run build:local` inside `frontend/` so `dist/oracle-monitor/browser` uses `environment.ts` (`http://localhost:3000/api`) again.
