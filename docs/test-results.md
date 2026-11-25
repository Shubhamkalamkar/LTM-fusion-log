# Test Scenarios & Execution Results

## 1. Backend Lambda & REST API Test Suite (`backend/tests/api.test.js`)

Executed via `npm test` (`node --test tests/*.test.js`) — **8 / 8 passed**.

| # | Scenario | Endpoint / Handler | Expected Result | Observed Result |
|---|---|---|---|---|
| 1 | Dashboard KPIs & Scenario 1 (`Create Accounting` failure) | `GET /dashboard/summary`, `GET /fusion/jobs/FUS1002` | 125 Fusion, 90 OIC, success rates, critical failures, open incidents, FUS1002 Critical | **PASS** (`200 OK`, `fusionTotal=125`, `oicTotal=90`) |
| 2 | Scenario 2 (OIC Payment Integration failure & Banking impact) | `GET /oic/integrations/OIC2006` | Identifies `Banking System` (`Critical`), `FAILED`, linked to `INC005` | **PASS** (`200 OK`) |
| 3 | Scenario 3 (Multi-criteria filtering) | `GET /fusion/jobs?status=FAILED&severity=Critical` | Returns only `FAILED` + `Critical` rows | **PASS** (`200 OK`, 9 matching rows) |
| 4 | Scenario 4 (Retry simulation & audit history) | `POST /incidents/INC005/retry` | Increments `retry_count` (1 -> 2), sets `Retry Initiated`, records `last_retry_at` & `RETRY_SIMULATED` history | **PASS** (`200 OK`) |
| 5 | Scenario 5 (Exact end-to-end correlation) | `GET /incidents/INC004` | Exact correlation `FUS1005 -> OIC2005 -> Warehouse Management System` + business impact statement | **PASS** (`200 OK`, `Exact Correlation`) |
| 6 | Time-window fallback correlation | `GET /fusion/jobs/FUS1006` | Labels `Potential Relationship (Time-Window)` and explicitly notes causation is not confirmed | **PASS** (`200 OK`) |
| 7 | Input validation & negative cases | `GET /fusion/jobs?status=BOGUS`, invalid dates, `FUS9999`, retry on `Resolved` incident | Returns `400` with `requestId` & `timestamp`, `404` on missing ID, `400` on non-retryable incident | **PASS** (`400` / `404`) |
| 8 | CSV export & Data Generator Lambda | `GET /fusion/jobs/failed?format=csv`, `POST /simulator/tick` | Valid `text/csv` payload and `201 Created` simulated failure + auto-incident | **PASS** (`200` / `201`) |

## 2. Full-Stack HTTP Smoke Verification (`local-server.js` + Angular 20 Bundle)

- `GET /` -> `200 OK` (serves Angular 20 production `<app-root>` bundle from `frontend/dist/oracle-monitor/browser`)
- `GET /api/dashboard/summary` -> `200 OK` (`125` Fusion, `90` OIC, `6` Open Incidents)
- `GET /api/incidents/INC004` -> `200 OK` (`Exact Correlation`: `Fusion: Refresh Supply Planning Data (FAILED) -> OIC: Shipment Integration (FAILED) -> Downstream: Warehouse Management System (Critical)`)
- `GET /api/fusion/jobs?status=FAILED&severity=Critical` -> `200 OK` (`9` Critical Fusion failures)

## 3. Angular 20 Frontend Build & Unit Tests

- `npm run build` (`ng build`): **PASS** (`384.68 kB` initial bundle in `frontend/dist/oracle-monitor/browser`)
- `npx ng test --watch=false --browsers=ChromeHeadless`: **PASS** (`Executed 2 of 2 SUCCESS` on Chrome Headless)
