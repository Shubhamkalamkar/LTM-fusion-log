-- ============================================================================
-- Oracle Fusion Cloud & OIC Job Failure Monitoring - MySQL 8.0 Schema
-- ============================================================================

CREATE DATABASE IF NOT EXISTS oracle_monitoring
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE oracle_monitoring;

-- Drop in reverse dependency order for clean re-runs
DROP TABLE IF EXISTS incident_history;
DROP TABLE IF EXISTS failure_incidents;
DROP TABLE IF EXISTS oic_integration_executions;
DROP TABLE IF EXISTS oic_integrations;
DROP TABLE IF EXISTS fusion_job_executions;
DROP TABLE IF EXISTS fusion_jobs;
DROP TABLE IF EXISTS downstream_systems;
DROP TABLE IF EXISTS severity_rules;

-- 1. Severity Classification Rules (Config Table - Section 9)
CREATE TABLE severity_rules (
  rule_id INT AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(50) NOT NULL UNIQUE,
  source_type ENUM('FUSION', 'OIC', 'ANY') NOT NULL DEFAULT 'ANY',
  error_category VARCHAR(60) NULL,
  module_or_family VARCHAR(80) NULL,
  target_criticality ENUM('Critical', 'High', 'Medium', 'Low') NULL,
  assigned_severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  auto_create_incident BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Downstream Systems Master
CREATE TABLE downstream_systems (
  system_id VARCHAR(20) PRIMARY KEY,
  system_name VARCHAR(100) NOT NULL,
  system_type VARCHAR(60) NOT NULL,
  criticality ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  owner_team VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Oracle Fusion Scheduled-Process Master
CREATE TABLE fusion_jobs (
  job_id VARCHAR(30) PRIMARY KEY,
  job_name VARCHAR(120) NOT NULL,
  ess_job_definition VARCHAR(120) NOT NULL,
  module VARCHAR(60) NOT NULL,
  process_family VARCHAR(60) NOT NULL,
  default_severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Medium',
  schedule_frequency VARCHAR(50) NOT NULL DEFAULT 'Hourly',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fusion_jobs_module (module)
) ENGINE=InnoDB;

-- 4. Oracle Fusion Job Execution History
CREATE TABLE fusion_job_executions (
  execution_id VARCHAR(30) PRIMARY KEY,
  job_id VARCHAR(30) NOT NULL,
  correlation_id VARCHAR(64) NULL,
  status ENUM('SUCCESS', 'FAILED', 'RUNNING', 'WARNING') NOT NULL,
  severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NULL,
  duration_seconds INT NULL,
  error_code VARCHAR(40) NULL,
  error_category VARCHAR(60) NULL,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  triggered_by VARCHAR(60) NOT NULL DEFAULT 'ESS_SCHEDULER',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fusion_exec_job FOREIGN KEY (job_id) REFERENCES fusion_jobs(job_id),
  INDEX idx_fusion_exec_status (status),
  INDEX idx_fusion_exec_severity (severity),
  INDEX idx_fusion_exec_start (start_time),
  INDEX idx_fusion_exec_corr (correlation_id)
) ENGINE=InnoDB;

-- 5. Oracle Integration Cloud (OIC) Integration Master
CREATE TABLE oic_integrations (
  integration_id VARCHAR(30) PRIMARY KEY,
  integration_name VARCHAR(120) NOT NULL,
  integration_code VARCHAR(80) NOT NULL,
  source_system VARCHAR(80) NOT NULL,
  target_system_id VARCHAR(20) NOT NULL,
  process_family VARCHAR(60) NOT NULL,
  default_severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL DEFAULT 'Medium',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oic_target_system FOREIGN KEY (target_system_id) REFERENCES downstream_systems(system_id),
  INDEX idx_oic_source (source_system),
  INDEX idx_oic_target (target_system_id)
) ENGINE=InnoDB;

-- 6. OIC Integration Execution History
CREATE TABLE oic_integration_executions (
  instance_id VARCHAR(30) PRIMARY KEY,
  integration_id VARCHAR(30) NOT NULL,
  correlation_id VARCHAR(64) NULL,
  status ENUM('SUCCESS', 'FAILED', 'RUNNING', 'WARNING') NOT NULL,
  severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NULL,
  duration_seconds INT NULL,
  error_code VARCHAR(40) NULL,
  error_category VARCHAR(60) NULL,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oic_exec_integration FOREIGN KEY (integration_id) REFERENCES oic_integrations(integration_id),
  INDEX idx_oic_exec_status (status),
  INDEX idx_oic_exec_severity (severity),
  INDEX idx_oic_exec_start (start_time),
  INDEX idx_oic_exec_corr (correlation_id)
) ENGINE=InnoDB;

-- 7. Failure Incidents Workflow Table
CREATE TABLE failure_incidents (
  incident_id VARCHAR(30) PRIMARY KEY,
  source_type ENUM('FUSION', 'OIC') NOT NULL,
  source_execution_id VARCHAR(30) NOT NULL,
  process_name VARCHAR(120) NOT NULL,
  module_or_family VARCHAR(80) NOT NULL,
  downstream_system_id VARCHAR(20) NULL,
  correlation_id VARCHAR(64) NULL,
  severity ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  status ENUM('Open', 'Investigating', 'Retry Initiated', 'Resolved', 'Closed') NOT NULL DEFAULT 'Open',
  error_code VARCHAR(40) NULL,
  error_category VARCHAR(60) NULL,
  error_message TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  last_retry_at DATETIME NULL,
  acknowledged_by VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_incident_downstream FOREIGN KEY (downstream_system_id) REFERENCES downstream_systems(system_id),
  UNIQUE KEY uq_incident_source (source_type, source_execution_id),
  INDEX idx_incident_status (status),
  INDEX idx_incident_severity (severity),
  INDEX idx_incident_corr (correlation_id)
) ENGINE=InnoDB;

-- 8. Incident Audit & Retry History
CREATE TABLE incident_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  incident_id VARCHAR(30) NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NOT NULL,
  notes VARCHAR(500) NULL,
  performed_by VARCHAR(80) NOT NULL DEFAULT 'ops-engineer',
  action_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_incident FOREIGN KEY (incident_id) REFERENCES failure_incidents(incident_id) ON DELETE CASCADE,
  INDEX idx_history_incident (incident_id, action_time)
) ENGINE=InnoDB;
