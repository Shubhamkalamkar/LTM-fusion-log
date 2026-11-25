export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'RUNNING' | 'WARNING';
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export type IncidentStatus = 'Open' | 'Investigating' | 'Retry Initiated' | 'Resolved' | 'Closed';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FusionExecution {
  execution_id: string;
  job_id: string;
  job_name: string;
  ess_job_definition?: string;
  module: string;
  process_family: string;
  correlation_id: string | null;
  status: ExecutionStatus;
  severity: SeverityLevel;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  error_code: string | null;
  error_category: string | null;
  error_message: string | null;
  retry_count: number;
  incident_id: string | null;
  incident_status: IncidentStatus | null;
  correlation?: CorrelationContext;
}

export interface OicExecution {
  instance_id: string;
  integration_id: string;
  integration_name: string;
  integration_code?: string;
  source_system: string;
  target_system_id: string;
  target_system_name: string;
  target_system_type?: string;
  target_criticality: SeverityLevel;
  process_family: string;
  correlation_id: string | null;
  status: ExecutionStatus;
  severity: SeverityLevel;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  error_code: string | null;
  error_category: string | null;
  error_message: string | null;
  retry_count: number;
  incident_id: string | null;
  incident_status: IncidentStatus | null;
  correlation?: CorrelationContext;
}

export interface CorrelationContext {
  correlationId: string | null;
  relationshipType: string;
  isExactMatch: boolean;
  timeWindowMinutes: number;
  chainSummary: string;
  businessImpact: string;
  fusionExecutions: FusionExecution[];
  oicExecutions: OicExecution[];
  impactedDownstream: Array<{
    system_id: string;
    system_name: string;
    criticality: SeverityLevel;
  }>;
}

export interface IncidentHistoryEntry {
  history_id: number;
  incident_id: string;
  action: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  performed_by: string;
  action_time: string;
}

export interface FailureIncident {
  incident_id: string;
  source_type: 'FUSION' | 'OIC';
  source_execution_id: string;
  process_name: string;
  module_or_family: string;
  downstream_system_id: string | null;
  downstream_system_name: string | null;
  downstream_system_type: string | null;
  downstream_criticality: SeverityLevel | null;
  correlation_id: string | null;
  severity: SeverityLevel;
  status: IncidentStatus;
  error_code: string | null;
  error_category: string | null;
  error_message: string | null;
  retry_count: number;
  last_retry_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
  history?: IncidentHistoryEntry[];
  sourceExecution?: FusionExecution | OicExecution | null;
  correlation?: CorrelationContext;
}

export interface DashboardSummary {
  fusionTotal: number;
  fusionSuccess: number;
  fusionFailed: number;
  fusionRunning: number;
  fusionWarning: number;
  fusionSuccessRate: number;
  oicTotal: number;
  oicSuccess: number;
  oicFailed: number;
  oicRunning: number;
  oicWarning: number;
  oicSuccessRate: number;
  criticalFailures: number;
  openIncidents: number;
  recentCriticalFailures: Array<{
    sourceType: 'FUSION' | 'OIC';
    executionId: string;
    processName: string;
    moduleOrFamily: string;
    downstreamSystem: string | null;
    severity: SeverityLevel;
    errorCode: string | null;
    errorCategory: string | null;
    errorMessage: string | null;
    startTime: string;
    correlationId: string | null;
    incidentId: string | null;
    incidentStatus: IncidentStatus | null;
  }>;
  impactedSystems: Array<{
    system_id: string;
    system_name: string;
    system_type: string;
    criticality: SeverityLevel;
    totalExecutions: number;
    failedExecutions: number;
    openIncidents: number;
    healthStatus: 'Impacted' | 'Degraded' | 'Healthy';
  }>;
  failureByCategory: Array<{ category: string; count: number }>;
  availableModules: string[];
  activeDbMode: string;
}
