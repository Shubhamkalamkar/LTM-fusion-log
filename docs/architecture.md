# Solution Architecture & Real Oracle Integration Migration Guide

## 1. Logical Architecture

```mermaid
flowchart LR
    User["Operations Engineer / Support User"] -->|"HTTPS"| SPA["Angular 20 SPA (S3 / CloudFront)"]
    SPA -->|"HTTPS / JSON REST"| APIGW["Amazon API Gateway"]
    APIGW --> L1["Lambda: Dashboard"]
    APIGW --> L2["Lambda: Fusion Jobs"]
    APIGW --> L3["Lambda: OIC Integrations"]
    APIGW --> L4["Lambda: Incidents & Retry"]
    EB["Amazon EventBridge (1-5 min schedule)"] --> L5["Lambda: Data Generator"]

    L1 & L2 & L3 & L4 & L5 -->|"SQL / Connection Pool (RDS Proxy)"| RDS[("Amazon RDS for MySQL")]
    L1 & L2 & L3 & L4 & L5 -->|"Structured JSON Logs"| CW["Amazon CloudWatch"]
    L1 & L2 & L3 & L4 -.->|"Optional Secret Lookup"| SM["AWS Secrets Manager"]
```

## 2. Entity-Relationship Model

```mermaid
erDiagram
    FUSION_JOBS ||--o{ FUSION_JOB_EXECUTIONS : "has many"
    DOWNSTREAM_SYSTEMS ||--o{ OIC_INTEGRATIONS : "targeted by"
    OIC_INTEGRATIONS ||--o{ OIC_INTEGRATION_EXECUTIONS : "has many"
    DOWNSTREAM_SYSTEMS ||--o{ FAILURE_INCIDENTS : "impacted by"
    FAILURE_INCIDENTS ||--o{ INCIDENT_HISTORY : "audit trail"
    FUSION_JOB_EXECUTIONS ||--o| FAILURE_INCIDENTS : "triggers"
    OIC_INTEGRATION_EXECUTIONS ||--o| FAILURE_INCIDENTS : "triggers"
```

## 3. Correlation & Retry Simulation Flow

```mermaid
sequenceDiagram
    participant UI as Angular 20 UI
    participant GW as API Gateway
    participant INC as Incidents Lambda
    participant CORR as Correlation Service
    participant DB as MySQL / RDS

    UI->>GW: GET /incidents/INC004
    GW->>INC: Invoke handler
    INC->>DB: Load incident + history + source execution
    INC->>CORR: Resolve correlation_id (CORR-SCM-20261125-05)
    CORR->>DB: Query exact correlation_id match across Fusion & OIC
    CORR-->>INC: Exact chain: FUS1005 -> OIC2005 -> WMS (DS05)
    INC-->>UI: 200 OK (Incident + Correlation + History)

    UI->>GW: POST /incidents/INC004/retry
    GW->>INC: Invoke handler
    INC->>DB: Validate retryable, increment retry_count, set Retry Initiated, insert history
    INC-->>UI: 200 OK (Updated incident)
```

## 4. Replacing Simulated Feeds with Real Oracle Monitoring APIs

Because the Angular 20 UI and core REST APIs consume normalized domain models from MySQL via repository interfaces, replacing simulated data with live Oracle Cloud feeds requires **zero UI changes** and **zero changes to Dashboard/Incidents service boundaries**:

1. **Replace `DataGeneratorLambda` with an `OraclePollerLambda` (EventBridge every 1-5 mins):**
   - **Oracle Fusion Cloud ESS Jobs:** Poll Fusion REST API (`/fscmRestApi/resources/11.13.18.05/erpintegrations` or ESS `getESSExecutionDetails` SOAP/REST) using OAuth2 client credentials stored in **AWS Secrets Manager**.
   - **Oracle Integration Cloud (OIC):** Poll OIC Monitoring REST API (`/ic/api/integration/v1/monitoring/instances?q={status:'FAILED'}`) and fetch instance fault details (`/ic/api/integration/v1/monitoring/instances/{id}/error`).
2. **Upsert into MySQL:** Map Oracle ESS `requestId` -> `fusion_job_executions.execution_id` and OIC `id` -> `oic_integration_executions.instance_id`, preserving `correlation_id` from Oracle ECID (`ecid`) or custom business tracking headers.
3. **Real Retry Execution (Optional Phase 2):** Swap `incidentRepository.retryIncident()`'s simulation flag to call:
   - Fusion ESS `submitESSJobRequest` for Fusion incidents, or
   - OIC `POST /ic/api/integration/v1/monitoring/instances/{id}/resubmit` for OIC incidents.
4. **Production VPC & Connection Pooling:** Deploy Lambdas into private VPC subnets with **Amazon RDS Proxy** in front of RDS MySQL so bursty API Gateway traffic and scheduled pollers reuse pooled connections without exhausting `max_connections`.
