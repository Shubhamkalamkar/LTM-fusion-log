'use strict';

const rulesConfig = require('../config/severityRules.json');
const dashboardRepository = require('../repositories/dashboardRepository');

/**
 * Classifies execution severity using configured rules (DB table or JSON fallback).
 */
async function classifySeverity({ sourceType, status, errorCategory, moduleOrFamily, targetCriticality, defaultSeverity }) {
  if (status === 'SUCCESS' || status === 'RUNNING' || status === 'WARNING') {
    return { severity: 'Low', autoCreateIncident: false, matchedRule: 'RULE_LOW_DEFAULT' };
  }

  let rules;
  try {
    const dbRules = await dashboardRepository.getSeverityRules();
    rules = dbRules.map((r) => ({
      ruleCode: r.rule_code,
      sourceType: r.source_type,
      errorCategory: r.error_category,
      moduleOrFamily: r.module_or_family,
      targetCriticality: r.target_criticality,
      assignedSeverity: r.assigned_severity,
      autoCreateIncident: Boolean(r.auto_create_incident),
      priority: r.priority
    }));
  } catch {
    rules = rulesConfig.rules;
  }

  rules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

  for (const rule of rules) {
    if (rule.sourceType && rule.sourceType !== 'ANY' && rule.sourceType !== sourceType) continue;
    if (rule.errorCategory && rule.errorCategory !== errorCategory) continue;
    if (rule.moduleOrFamily && rule.moduleOrFamily !== moduleOrFamily) continue;
    if (rule.targetCriticality && rule.targetCriticality !== targetCriticality) continue;

    return {
      severity: rule.assignedSeverity,
      autoCreateIncident: rule.autoCreateIncident,
      matchedRule: rule.ruleCode
    };
  }

  return {
    severity: defaultSeverity || 'Medium',
    autoCreateIncident: true,
    matchedRule: 'DEFAULT_FALLBACK'
  };
}

module.exports = { classifySeverity };
