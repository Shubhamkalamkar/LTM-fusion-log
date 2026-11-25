'use strict';

/**
 * Shared deterministic dataset generator for:
 *  1) database/seed.sql (MySQL / Amazon RDS)
 *  2) backend/src/db/memoryAdapter.js (Zero-DB fallback mode)
 *
 * Includes all Section 7 sample rows verbatim plus simulated volume:
 *  - 6 Downstream Systems (DS01..DS06)
 *  - 12 Oracle Fusion Jobs
 *  - 10 OIC Integrations
 *  - 125 Fusion Job Executions (~82% SUCCESS, ~13% FAILED, ~5% RUNNING/WARNING)
 *  - 90 OIC Integration Executions (~82% SUCCESS, ~13% FAILED, ~5% RUNNING/WARNING)
 *  - Correlated Fusion <-> OIC chains (exact correlation_id + time-window near-matches)
 *  - Failure Incidents & Audit History
 */

const SEVERITY_RULES = [
  {
    rule_id: 1,
    rule_code: 'RULE_CRIT_FINANCE_AUTH',
    source_type: 'ANY',
    error_category: 'Authentication / authorization',
    module_or_family: null,
    target_criticality: 'Critical',
    assigned_severity: 'Critical',
    auto_create_incident: true,
    priority: 10,
    description: 'Authentication outage affecting Critical downstream systems'
  },
  {
    rule_id: 2,
    rule_code: 'RULE_CRIT_FINANCE_CTRL',
    source_type: 'FUSION',
    error_category: 'Finance control',
    module_or_family: 'General Ledger',
    target_criticality: null,
    assigned_severity: 'Critical',
    auto_create_incident: true,
    priority: 15,
    description: 'Closed accounting period or invalid ledger blocks GL posting'
  },
  {
    rule_id: 3,
    rule_code: 'RULE_CRIT_TARGET_SYSTEM',
    source_type: 'OIC',
    error_category: null,
    module_or_family: null,
    target_criticality: 'Critical',
    assigned_severity: 'Critical',
    auto_create_incident: true,
    priority: 20,
    description: 'Any OIC failure targeting a Critical system (Payroll, WMS, Banking)'
  },
  {
    rule_id: 4,
    rule_code: 'RULE_CRIT_SCM_PLAN',
    source_type: 'FUSION',
    error_category: 'Application',
    module_or_family: 'Supply Chain',
    target_criticality: null,
    assigned_severity: 'Critical',
    auto_create_incident: true,
    priority: 25,
    description: 'Supply planning collection failure delaying downstream logistics'
  },
  {
    rule_id: 5,
    rule_code: 'RULE_HIGH_CONNECTIVITY',
    source_type: 'ANY',
    error_category: 'Connectivity',
    module_or_family: null,
    target_criticality: null,
    assigned_severity: 'High',
    auto_create_incident: true,
    priority: 30,
    description: 'Connection timeout, DNS failure, or target unavailable'
  },
  {
    rule_id: 6,
    rule_code: 'RULE_HIGH_PAYLOAD_FINANCE',
    source_type: 'ANY',
    error_category: 'Payload / validation',
    module_or_family: null,
    target_criticality: null,
    assigned_severity: 'High',
    auto_create_incident: true,
    priority: 40,
    description: 'Invoice, customer, or purchase-order payload validation failure'
  },
  {
    rule_id: 7,
    rule_code: 'RULE_MED_DATA_QUALITY',
    source_type: 'ANY',
    error_category: 'Data quality',
    module_or_family: null,
    target_criticality: null,
    assigned_severity: 'Medium',
    auto_create_incident: true,
    priority: 50,
    description: 'Reporting, extract, or limited employee/date data quality error'
  },
  {
    rule_id: 8,
    rule_code: 'RULE_LOW_DEFAULT',
    source_type: 'ANY',
    error_category: null,
    module_or_family: null,
    target_criticality: null,
    assigned_severity: 'Low',
    auto_create_incident: false,
    priority: 99,
    description: 'Successful execution or informational warning'
  }
];

const DOWNSTREAM_SYSTEMS = [
  { system_id: 'DS01', system_name: 'Salesforce', system_type: 'CRM', criticality: 'Medium', owner_team: 'CRM Ops', description: 'Customer master and order visibility platform' },
  { system_id: 'DS02', system_name: 'Enterprise Data Warehouse', system_type: 'Analytics', criticality: 'Medium', owner_team: 'Data Platform', description: 'Corporate BI and financial reporting warehouse' },
  { system_id: 'DS03', system_name: 'Payroll System', system_type: 'HCM', criticality: 'Critical', owner_team: 'Global Payroll Ops', description: 'Employee compensation and statutory payroll engine' },
  { system_id: 'DS04', system_name: 'Supplier Portal', system_type: 'Procurement', criticality: 'High', owner_team: 'Supplier Enablement', description: 'External PO dispatch and ASN collaboration portal' },
  { system_id: 'DS05', system_name: 'Warehouse Management System', system_type: 'Logistics', criticality: 'Critical', owner_team: 'Logistics IT', description: 'Fulfillment, ASN receiving and shipment dispatch (WMS)' },
  { system_id: 'DS06', system_name: 'Banking System', system_type: 'Finance', criticality: 'Critical', owner_team: 'Treasury & Payments', description: 'ISO 20022 payment settlement gateway' }
];

const FUSION_JOBS = [
  { job_id: 'FJ01', job_name: 'Import Payables Invoices', ess_job_definition: 'APXIIMPT', module: 'Payables', process_family: 'Finance', default_severity: 'High', schedule_frequency: 'Every 30 mins' },
  { job_id: 'FJ02', job_name: 'Create Accounting', ess_job_definition: 'XLAACCPB', module: 'General Ledger', process_family: 'Finance', default_severity: 'Critical', schedule_frequency: 'Hourly' },
  { job_id: 'FJ03', job_name: 'Import AutoInvoice', ess_job_definition: 'RAXTRX', module: 'Receivables', process_family: 'Finance', default_severity: 'High', schedule_frequency: 'Every 30 mins' },
  { job_id: 'FJ04', job_name: 'Import Purchase Orders', ess_job_definition: 'POXPOPDOI', module: 'Procurement', process_family: 'Procurement', default_severity: 'High', schedule_frequency: 'Hourly' },
  { job_id: 'FJ05', job_name: 'Refresh Supply Planning Data', ess_job_definition: 'MSC_COLLECT_DATA', module: 'Supply Chain', process_family: 'Supply Chain', default_severity: 'Critical', schedule_frequency: 'Every 2 hours' },
  { job_id: 'FJ06', job_name: 'HCM Employee Extract', ess_job_definition: 'HCM_EXT_EMP', module: 'HCM', process_family: 'HCM', default_severity: 'Medium', schedule_frequency: 'Every 4 hours' },
  { job_id: 'FJ07', job_name: 'Validate Payables Invoices', ess_job_definition: 'APXVALD', module: 'Payables', process_family: 'Finance', default_severity: 'High', schedule_frequency: 'Hourly' },
  { job_id: 'FJ08', job_name: 'Process Payment Files', ess_job_definition: 'IBY_FD_PAYMENT', module: 'Payments', process_family: 'Finance', default_severity: 'Critical', schedule_frequency: 'Every 2 hours' },
  { job_id: 'FJ09', job_name: 'Post Journal Entries', ess_job_definition: 'GLPPOSS', module: 'General Ledger', process_family: 'Finance', default_severity: 'Critical', schedule_frequency: 'Hourly' },
  { job_id: 'FJ10', job_name: 'Release Pick Waves', ess_job_definition: 'WSH_PICK_RELEASE', module: 'Supply Chain', process_family: 'Supply Chain', default_severity: 'Critical', schedule_frequency: 'Every 30 mins' },
  { job_id: 'FJ11', job_name: 'Synchronize Supplier Master', ess_job_definition: 'POZ_SUPP_SYNC', module: 'Procurement', process_family: 'Procurement', default_severity: 'Medium', schedule_frequency: 'Daily' },
  { job_id: 'FJ12', job_name: 'Load Time and Labor Batches', ess_job_definition: 'HXT_BATCH_LOAD', module: 'HCM', process_family: 'HCM', default_severity: 'Medium', schedule_frequency: 'Every 6 hours' }
];

const OIC_INTEGRATIONS = [
  { integration_id: 'INT01', integration_name: 'Customer Sync', integration_code: 'ERP_SFDC_CUST_SYNC', source_system: 'Fusion ERP', target_system_id: 'DS01', process_family: 'Finance', default_severity: 'Medium' },
  { integration_id: 'INT02', integration_name: 'AP Invoice Distribution', integration_code: 'ERP_EDW_AP_DIST', source_system: 'Fusion ERP', target_system_id: 'DS02', process_family: 'Finance', default_severity: 'High' },
  { integration_id: 'INT03', integration_name: 'Employee Sync', integration_code: 'HCM_PAYROLL_EMP_SYNC', source_system: 'Fusion HCM', target_system_id: 'DS03', process_family: 'HCM', default_severity: 'Critical' },
  { integration_id: 'INT04', integration_name: 'Purchase Order Integration', integration_code: 'PROC_SUPP_PO_OUT', source_system: 'Fusion Procurement', target_system_id: 'DS04', process_family: 'Procurement', default_severity: 'High' },
  { integration_id: 'INT05', integration_name: 'Shipment Integration', integration_code: 'SCM_WMS_SHIPMENT_OUT', source_system: 'Fusion SCM', target_system_id: 'DS05', process_family: 'Supply Chain', default_severity: 'Critical' },
  { integration_id: 'INT06', integration_name: 'Payment Integration', integration_code: 'ERP_BANK_ISO20022_PAY', source_system: 'Fusion ERP', target_system_id: 'DS06', process_family: 'Finance', default_severity: 'Critical' },
  { integration_id: 'INT07', integration_name: 'GL Balance Analytics Feed', integration_code: 'GL_EDW_BALANCES', source_system: 'Fusion ERP', target_system_id: 'DS02', process_family: 'Finance', default_severity: 'Medium' },
  { integration_id: 'INT08', integration_name: 'Inventory Receipt Sync', integration_code: 'WMS_SCM_RECEIPT_IN', source_system: 'Fusion SCM', target_system_id: 'DS05', process_family: 'Supply Chain', default_severity: 'Critical' },
  { integration_id: 'INT09', integration_name: 'Supplier ASN Inbound', integration_code: 'SUPP_PROC_ASN_IN', source_system: 'Fusion Procurement', target_system_id: 'DS04', process_family: 'Procurement', default_severity: 'High' },
  { integration_id: 'INT10', integration_name: 'Sales Order Opportunity Sync', integration_code: 'ERP_SFDC_ORDER_SYNC', source_system: 'Fusion ERP', target_system_id: 'DS01', process_family: 'Finance', default_severity: 'Medium' }
];

const FAILURE_CATALOG = [
  { code: 'AUTH-401', category: 'Authentication / authorization', msg: 'Authentication failed: OAuth2 bearer token expired (HTTP 401)' },
  { code: 'AUTH-403', category: 'Authentication / authorization', msg: 'HTTP 403 Forbidden: service account missing integration role' },
  { code: 'NET-TIMEOUT', category: 'Connectivity', msg: 'Connection timeout after 30000ms reaching downstream endpoint' },
  { code: 'NET-DNS', category: 'Connectivity', msg: 'DNS failure resolving external partner gateway hostname' },
  { code: 'APP-500', category: 'Application', msg: 'HTTP 500 from target system during synchronous API invocation' },
  { code: 'APP-UNAVAIL', category: 'Application', msg: 'Target unavailable: service returned 503 Service Unavailable' },
  { code: 'PAY-CUST', category: 'Payload / validation', msg: 'Invalid customer account reference in AutoInvoice interface batch' },
  { code: 'PAY-MAND', category: 'Payload / validation', msg: 'Invalid payload: missing mandatory field CURRENCY_CODE' },
  { code: 'FIN-PERIOD', category: 'Finance control', msg: 'Accounting period is closed for Primary US Ledger (NOV-26)' },
  { code: 'FIN-LEDGER', category: 'Finance control', msg: 'Invalid ledger or business unit mapping for intercompany journal' },
  { code: 'DQ-EMP', category: 'Data quality', msg: 'Employee record validation failure: missing national identifier' },
  { code: 'DQ-DUP', category: 'Data quality', msg: 'Duplicate transaction detected for external invoice reference' }
];

function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function addMinutes(baseDate, minutes) {
  return new Date(baseDate.getTime() + minutes * 60000);
}

function createRng(seed = 20261125) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildDataset() {
  const rng = createRng(20261125);
  const anchor = new Date('2026-11-25T13:30:00Z');

  const fusionExecutions = [];
  const oicExecutions = [];
  const incidents = [];
  const incidentHistory = [];

  // 1. Exact Sample Fusion Executions from Section 7.1 (FUS1001..FUS1006)
  const sampleFusion = [
    {
      execution_id: 'FUS1001',
      job_id: 'FJ01',
      correlation_id: 'CORR-FIN-20261125-01',
      status: 'SUCCESS',
      severity: 'Low',
      start_time: '2026-11-25 09:00:00',
      end_time: '2026-11-25 09:03:15',
      duration_seconds: 195,
      error_code: null,
      error_category: null,
      error_message: null,
      retry_count: 0
    },
    {
      execution_id: 'FUS1002',
      job_id: 'FJ02',
      correlation_id: 'CORR-GL-20261125-02',
      status: 'FAILED',
      severity: 'Critical',
      start_time: '2026-11-25 09:10:00',
      end_time: '2026-11-25 09:12:40',
      duration_seconds: 160,
      error_code: 'FIN-PERIOD',
      error_category: 'Finance control',
      error_message: 'Accounting period is closed',
      retry_count: 0
    },
    {
      execution_id: 'FUS1003',
      job_id: 'FJ03',
      correlation_id: 'CORR-AR-20261125-03',
      status: 'FAILED',
      severity: 'High',
      start_time: '2026-11-25 09:20:00',
      end_time: '2026-11-25 09:24:10',
      duration_seconds: 250,
      error_code: 'PAY-CUST',
      error_category: 'Payload / validation',
      error_message: 'Invalid customer account',
      retry_count: 1
    },
    {
      execution_id: 'FUS1004',
      job_id: 'FJ04',
      correlation_id: 'CORR-PROC-20261125-04',
      status: 'SUCCESS',
      severity: 'Low',
      start_time: '2026-11-25 09:30:00',
      end_time: '2026-11-25 09:32:20',
      duration_seconds: 140,
      error_code: null,
      error_category: null,
      error_message: null,
      retry_count: 0
    },
    {
      execution_id: 'FUS1005',
      job_id: 'FJ05',
      correlation_id: 'CORR-SCM-20261125-05',
      status: 'FAILED',
      severity: 'Critical',
      start_time: '2026-11-25 10:00:00',
      end_time: '2026-11-25 10:06:30',
      duration_seconds: 390,
      error_code: 'APP-SRC',
      error_category: 'Application',
      error_message: 'Source collection failed',
      retry_count: 0
    },
    {
      execution_id: 'FUS1006',
      job_id: 'FJ06',
      correlation_id: null,
      status: 'FAILED',
      severity: 'Medium',
      start_time: '2026-11-25 10:30:00',
      end_time: '2026-11-25 10:33:45',
      duration_seconds: 225,
      error_code: 'DQ-EMP',
      error_category: 'Data quality',
      error_message: 'Employee record validation failure',
      retry_count: 0
    }
  ];
  fusionExecutions.push(...sampleFusion);

  // 2. Exact Sample OIC Executions from Section 7.2 (OIC2001..OIC2006)
  const sampleOic = [
    {
      instance_id: 'OIC2001',
      integration_id: 'INT01',
      correlation_id: 'CORR-AR-20261125-01',
      status: 'SUCCESS',
      severity: 'Low',
      start_time: '2026-11-25 09:05:00',
      end_time: '2026-11-25 09:05:38',
      duration_seconds: 38,
      error_code: null,
      error_category: null,
      error_message: null,
      retry_count: 0
    },
    {
      instance_id: 'OIC2002',
      integration_id: 'INT02',
      correlation_id: 'CORR-FIN-20261125-02',
      status: 'FAILED',
      severity: 'High',
      start_time: '2026-11-25 09:15:00',
      end_time: '2026-11-25 09:15:32',
      duration_seconds: 32,
      error_code: 'NET-TIMEOUT',
      error_category: 'Connectivity',
      error_message: 'Connection timeout',
      retry_count: 0
    },
    {
      instance_id: 'OIC2003',
      integration_id: 'INT03',
      correlation_id: 'CORR-HCM-20261125-03',
      status: 'FAILED',
      severity: 'Critical',
      start_time: '2026-11-25 10:34:00',
      end_time: '2026-11-25 10:34:14',
      duration_seconds: 14,
      error_code: 'AUTH-401',
      error_category: 'Authentication / authorization',
      error_message: 'Authentication failed',
      retry_count: 2
    },
    {
      instance_id: 'OIC2004',
      integration_id: 'INT04',
      correlation_id: 'CORR-PROC-20261125-04',
      status: 'SUCCESS',
      severity: 'Low',
      start_time: '2026-11-25 09:33:00',
      end_time: '2026-11-25 09:33:25',
      duration_seconds: 25,
      error_code: null,
      error_category: null,
      error_message: null,
      retry_count: 0
    },
    {
      instance_id: 'OIC2005',
      integration_id: 'INT05',
      correlation_id: 'CORR-SCM-20261125-05',
      status: 'FAILED',
      severity: 'Critical',
      start_time: '2026-11-25 10:07:00',
      end_time: '2026-11-25 10:07:45',
      duration_seconds: 45,
      error_code: 'APP-UNAVAIL',
      error_category: 'Application',
      error_message: 'Target unavailable',
      retry_count: 0
    },
    {
      instance_id: 'OIC2006',
      integration_id: 'INT06',
      correlation_id: 'CORR-PAY-20261125-06',
      status: 'FAILED',
      severity: 'Critical',
      start_time: '2026-11-25 11:15:00',
      end_time: '2026-11-25 11:15:19',
      duration_seconds: 19,
      error_code: 'APP-500',
      error_category: 'Application',
      error_message: 'HTTP 500 from target',
      retry_count: 1
    }
  ];
  oicExecutions.push(...sampleOic);

  // 3. Exact Sample Incidents from Section 7.4 (INC001..INC005)
  const sampleIncidents = [
    {
      incident_id: 'INC001',
      source_type: 'FUSION',
      source_execution_id: 'FUS1002',
      process_name: 'Create Accounting',
      module_or_family: 'General Ledger',
      downstream_system_id: null,
      correlation_id: 'CORR-GL-20261125-02',
      severity: 'Critical',
      status: 'Open',
      error_code: 'FIN-PERIOD',
      error_category: 'Finance control',
      error_message: 'Accounting period is closed',
      retry_count: 0,
      last_retry_at: null,
      acknowledged_by: null,
      created_at: '2026-11-25 09:12:45',
      updated_at: '2026-11-25 09:12:45'
    },
    {
      incident_id: 'INC002',
      source_type: 'FUSION',
      source_execution_id: 'FUS1003',
      process_name: 'Import AutoInvoice',
      module_or_family: 'Receivables',
      downstream_system_id: null,
      correlation_id: 'CORR-AR-20261125-03',
      severity: 'High',
      status: 'Investigating',
      error_code: 'PAY-CUST',
      error_category: 'Payload / validation',
      error_message: 'Invalid customer account',
      retry_count: 1,
      last_retry_at: '2026-11-25 09:35:00',
      acknowledged_by: 'ananya.rao',
      created_at: '2026-11-25 09:24:15',
      updated_at: '2026-11-25 09:35:00'
    },
    {
      incident_id: 'INC003',
      source_type: 'OIC',
      source_execution_id: 'OIC2003',
      process_name: 'Employee Sync',
      module_or_family: 'HCM',
      downstream_system_id: 'DS03',
      correlation_id: 'CORR-HCM-20261125-03',
      severity: 'Critical',
      status: 'Open',
      error_code: 'AUTH-401',
      error_category: 'Authentication / authorization',
      error_message: 'Authentication failed',
      retry_count: 2,
      last_retry_at: '2026-11-25 10:50:00',
      acknowledged_by: null,
      created_at: '2026-11-25 10:34:20',
      updated_at: '2026-11-25 10:50:00'
    },
    {
      incident_id: 'INC004',
      source_type: 'OIC',
      source_execution_id: 'OIC2005',
      process_name: 'Shipment Integration',
      module_or_family: 'Supply Chain',
      downstream_system_id: 'DS05',
      correlation_id: 'CORR-SCM-20261125-05',
      severity: 'Critical',
      status: 'Open',
      error_code: 'APP-UNAVAIL',
      error_category: 'Application',
      error_message: 'Target unavailable',
      retry_count: 0,
      last_retry_at: null,
      acknowledged_by: null,
      created_at: '2026-11-25 10:07:50',
      updated_at: '2026-11-25 10:07:50'
    },
    {
      incident_id: 'INC005',
      source_type: 'OIC',
      source_execution_id: 'OIC2006',
      process_name: 'Payment Integration',
      module_or_family: 'Finance',
      downstream_system_id: 'DS06',
      correlation_id: 'CORR-PAY-20261125-06',
      severity: 'Critical',
      status: 'Investigating',
      error_code: 'APP-500',
      error_category: 'Application',
      error_message: 'HTTP 500 from target',
      retry_count: 1,
      last_retry_at: '2026-11-25 11:25:00',
      acknowledged_by: 'vikram.mehta',
      created_at: '2026-11-25 11:15:25',
      updated_at: '2026-11-25 11:25:00'
    }
  ];
  incidents.push(...sampleIncidents);

  incidentHistory.push(
    { history_id: 1, incident_id: 'INC001', action: 'CREATED', old_status: null, new_status: 'Open', notes: 'Auto-detected Critical Fusion job failure (FIN-PERIOD)', performed_by: 'monitor-engine', action_time: '2026-11-25 09:12:45' },
    { history_id: 2, incident_id: 'INC002', action: 'CREATED', old_status: null, new_status: 'Open', notes: 'Auto-detected High Fusion job failure (PAY-CUST)', performed_by: 'monitor-engine', action_time: '2026-11-25 09:24:15' },
    { history_id: 3, incident_id: 'INC002', action: 'RETRY_SIMULATED', old_status: 'Open', new_status: 'Retry Initiated', notes: 'Retry #1 triggered after customer sync check', performed_by: 'ananya.rao', action_time: '2026-11-25 09:35:00' },
    { history_id: 4, incident_id: 'INC002', action: 'STATUS_CHANGED', old_status: 'Retry Initiated', new_status: 'Investigating', notes: 'Assigned to Receivables ops for customer account master fix', performed_by: 'ananya.rao', action_time: '2026-11-25 09:42:00' },
    { history_id: 5, incident_id: 'INC003', action: 'CREATED', old_status: null, new_status: 'Open', notes: 'Auto-detected Critical OIC failure impacting Payroll System', performed_by: 'monitor-engine', action_time: '2026-11-25 10:34:20' },
    { history_id: 6, incident_id: 'INC003', action: 'RETRY_SIMULATED', old_status: 'Open', new_status: 'Retry Initiated', notes: 'Retry #1 simulated; token refresh pending', performed_by: 'ops-engineer', action_time: '2026-11-25 10:40:00' },
    { history_id: 7, incident_id: 'INC003', action: 'RETRY_SIMULATED', old_status: 'Retry Initiated', new_status: 'Open', notes: 'Retry #2 returned HTTP 401; escalated to IAM', performed_by: 'ops-engineer', action_time: '2026-11-25 10:50:00' },
    { history_id: 8, incident_id: 'INC004', action: 'CREATED', old_status: null, new_status: 'Open', notes: 'Auto-detected Critical OIC failure impacting WMS (correlated with FUS1005)', performed_by: 'monitor-engine', action_time: '2026-11-25 10:07:50' },
    { history_id: 9, incident_id: 'INC005', action: 'CREATED', old_status: null, new_status: 'Open', notes: 'Auto-detected Critical OIC failure impacting Banking System', performed_by: 'monitor-engine', action_time: '2026-11-25 11:15:25' },
    { history_id: 10, incident_id: 'INC005', action: 'STATUS_CHANGED', old_status: 'Open', new_status: 'Investigating', notes: 'Reviewing ISO 20022 payload with Banking gateway team', performed_by: 'vikram.mehta', action_time: '2026-11-25 11:25:00' }
  );

  // 4. Generate remaining Fusion executions (FUS1007..FUS1125 -> 125 total)
  //    Target distribution across all 125: ~82% SUCCESS (103), ~13% FAILED (16), ~5% RUNNING/WARNING (6)
  let nextIncNum = 6;
  let nextHistId = 11;

  for (let idx = 7; idx <= 125; idx++) {
    const execId = `FUS${1000 + idx}`;
    const job = FUSION_JOBS[(idx - 1) % FUSION_JOBS.length];
    const minutesBack = Math.floor((126 - idx) * 52 + rng() * 25);
    const startDt = addMinutes(anchor, -minutesBack);

    let status = 'SUCCESS';
    if (idx >= 122) {
      status = 'RUNNING'; // 4 running
    } else if (idx === 119 || idx === 120) {
      status = 'WARNING'; // 2 warning -> 6 running/warning = 4.8%
    } else if ([14, 23, 34, 45, 56, 67, 78, 89, 98, 108, 115, 118].includes(idx)) {
      status = 'FAILED'; // 12 + 4 sample = 16 failed = 12.8%
    }

    let severity = 'Low';
    let errorCode = null;
    let errorCategory = null;
    let errorMessage = null;
    const durationSeconds = status === 'RUNNING' ? null : Math.floor(60 + rng() * 340);
    const endDt = status === 'RUNNING' ? null : new Date(startDt.getTime() + durationSeconds * 1000);

    if (status === 'FAILED') {
      const err = FAILURE_CATALOG[Math.floor(rng() * FAILURE_CATALOG.length)];
      errorCode = err.code;
      errorCategory = err.category;
      errorMessage = err.msg;
      if (job.default_severity === 'Critical' || err.category === 'Finance control' || err.category === 'Authentication / authorization') {
        severity = rng() < 0.55 ? 'Critical' : 'High';
      } else if (err.category === 'Data quality') {
        severity = 'Medium';
      } else {
        severity = job.default_severity;
      }
    } else if (status === 'WARNING') {
      errorCode = 'WARN-SLA';
      errorCategory = 'Data quality';
      errorMessage = 'Execution completed with partial warning rows skipped';
      severity = 'Low';
    }

    const corrId = `CORR-${job.process_family.slice(0, 3).toUpperCase()}-202611-${String(idx).padStart(3, '0')}`;
    const row = {
      execution_id: execId,
      job_id: job.job_id,
      correlation_id: corrId,
      status,
      severity,
      start_time: formatDateTime(startDt),
      end_time: endDt ? formatDateTime(endDt) : null,
      duration_seconds: durationSeconds,
      error_code: errorCode,
      error_category: errorCategory,
      error_message: errorMessage,
      retry_count: status === 'FAILED' && rng() < 0.3 ? 1 : 0
    };
    fusionExecutions.push(row);

    if (status === 'FAILED' && (severity === 'Critical' || severity === 'High')) {
      const incId = `INC${String(nextIncNum++).padStart(3, '0')}`;
      const isRecent = idx >= 115;
      const incStatus = isRecent ? (severity === 'Critical' ? 'Open' : 'Investigating') : (rng() < 0.65 ? 'Resolved' : 'Closed');
      const createdTime = formatDateTime(endDt || startDt);
      const updatedTime = formatDateTime(addMinutes(endDt || startDt, 22));
      incidents.push({
        incident_id: incId,
        source_type: 'FUSION',
        source_execution_id: execId,
        process_name: job.job_name,
        module_or_family: job.module,
        downstream_system_id: null,
        correlation_id: corrId,
        severity,
        status: incStatus,
        error_code: errorCode,
        error_category: errorCategory,
        error_message: errorMessage,
        retry_count: row.retry_count,
        last_retry_at: row.retry_count > 0 ? updatedTime : null,
        acknowledged_by: incStatus === 'Open' ? null : 'ops-engineer',
        created_at: createdTime,
        updated_at: updatedTime
      });
      incidentHistory.push({
        history_id: nextHistId++,
        incident_id: incId,
        action: 'CREATED',
        old_status: null,
        new_status: 'Open',
        notes: `Auto-detected ${severity} Fusion failure (${errorCode})`,
        performed_by: 'monitor-engine',
        action_time: createdTime
      });
      if (incStatus !== 'Open') {
        incidentHistory.push({
          history_id: nextHistId++,
          incident_id: incId,
          action: 'STATUS_CHANGED',
          old_status: 'Open',
          new_status: incStatus,
          notes: incStatus === 'Resolved' ? 'Root cause remediated and verified on subsequent run' : 'Closed after verification',
          performed_by: 'ops-engineer',
          action_time: updatedTime
        });
      }
    }
  }

  // 5. Generate remaining OIC executions (OIC2007..OIC2090 -> 90 total)
  //    Target distribution across all 90: ~82.2% SUCCESS (74), ~12.2% FAILED (11), ~5.6% RUNNING/WARNING (5)
  for (let idx = 7; idx <= 90; idx++) {
    const instanceId = `OIC${2000 + idx}`;
    const integ = OIC_INTEGRATIONS[(idx - 1) % OIC_INTEGRATIONS.length];
    const targetSys = DOWNSTREAM_SYSTEMS.find((s) => s.system_id === integ.target_system_id);
    const minutesBack = Math.floor((91 - idx) * 65 + rng() * 30);
    const startDt = addMinutes(anchor, -minutesBack);

    let status = 'SUCCESS';
    if (idx >= 89) {
      status = 'RUNNING'; // 2 running
    } else if (idx === 83 || idx === 84 || idx === 85) {
      status = 'WARNING'; // 3 warning -> 5 running/warning = 5.6%
    } else if ([15, 29, 41, 55, 68, 79, 86].includes(idx)) {
      status = 'FAILED'; // 7 + 4 sample = 11 failed = 12.2%
    }

    let corrId = `CORR-${integ.process_family.slice(0, 3).toUpperCase()}-202611-O${String(idx).padStart(2, '0')}`;
    if (idx === 86) {
      const fusFinFail = fusionExecutions.find((f) => f.status === 'FAILED' && f.execution_id !== 'FUS1002' && f.correlation_id);
      if (fusFinFail) corrId = fusFinFail.correlation_id;
    }

    let severity = 'Low';
    let errorCode = null;
    let errorCategory = null;
    let errorMessage = null;
    const durationSeconds = status === 'RUNNING' ? null : Math.floor(8 + rng() * 65);
    const endDt = status === 'RUNNING' ? null : new Date(startDt.getTime() + durationSeconds * 1000);

    if (status === 'FAILED') {
      const err = FAILURE_CATALOG[Math.floor(rng() * FAILURE_CATALOG.length)];
      errorCode = err.code;
      errorCategory = err.category;
      errorMessage = err.msg;
      if (targetSys.criticality === 'Critical' && err.category !== 'Data quality') {
        severity = 'Critical';
      } else if (targetSys.criticality === 'High' || err.category === 'Connectivity') {
        severity = 'High';
      } else {
        severity = 'Medium';
      }
    } else if (status === 'WARNING') {
      errorCode = 'WARN-THROTTLE';
      errorCategory = 'Connectivity';
      errorMessage = 'Downstream API rate-limit threshold approached; retried automatically';
      severity = 'Low';
    }

    const row = {
      instance_id: instanceId,
      integration_id: integ.integration_id,
      correlation_id: corrId,
      status,
      severity,
      start_time: formatDateTime(startDt),
      end_time: endDt ? formatDateTime(endDt) : null,
      duration_seconds: durationSeconds,
      error_code: errorCode,
      error_category: errorCategory,
      error_message: errorMessage,
      retry_count: status === 'FAILED' && rng() < 0.25 ? 1 : 0
    };
    oicExecutions.push(row);

    if (status === 'FAILED' && (severity === 'Critical' || severity === 'High')) {
      const incId = `INC${String(nextIncNum++).padStart(3, '0')}`;
      const isRecent = idx >= 82;
      const incStatus = isRecent ? 'Open' : (rng() < 0.7 ? 'Resolved' : 'Closed');
      const createdTime = formatDateTime(endDt || startDt);
      const updatedTime = formatDateTime(addMinutes(endDt || startDt, 18));
      incidents.push({
        incident_id: incId,
        source_type: 'OIC',
        source_execution_id: instanceId,
        process_name: integ.integration_name,
        module_or_family: integ.process_family,
        downstream_system_id: integ.target_system_id,
        correlation_id: corrId,
        severity,
        status: incStatus,
        error_code: errorCode,
        error_category: errorCategory,
        error_message: errorMessage,
        retry_count: row.retry_count,
        last_retry_at: row.retry_count > 0 ? updatedTime : null,
        acknowledged_by: incStatus === 'Open' ? null : 'ops-engineer',
        created_at: createdTime,
        updated_at: updatedTime
      });
      incidentHistory.push({
        history_id: nextHistId++,
        incident_id: incId,
        action: 'CREATED',
        old_status: null,
        new_status: 'Open',
        notes: `Auto-detected ${severity} OIC failure impacting ${targetSys.system_name}`,
        performed_by: 'monitor-engine',
        action_time: createdTime
      });
      if (incStatus !== 'Open') {
        incidentHistory.push({
          history_id: nextHistId++,
          incident_id: incId,
          action: 'STATUS_CHANGED',
          old_status: 'Open',
          new_status: incStatus,
          notes: 'Resolved after downstream service recovery',
          performed_by: 'ops-engineer',
          action_time: updatedTime
        });
      }
    }
  }

  return {
    SEVERITY_RULES,
    DOWNSTREAM_SYSTEMS,
    FUSION_JOBS,
    OIC_INTEGRATIONS,
    fusionExecutions,
    oicExecutions,
    incidents,
    incidentHistory
  };
}

module.exports = {
  SEVERITY_RULES,
  DOWNSTREAM_SYSTEMS,
  FUSION_JOBS,
  OIC_INTEGRATIONS,
  FAILURE_CATALOG,
  buildDataset
};
