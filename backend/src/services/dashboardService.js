'use strict';

const dashboardRepository = require('../repositories/dashboardRepository');

/**
 * Helper used by: getDashboardSummary()
 * Computes a 1-decimal success rate percentage while excluding still-running jobs from the denominator.
 */
function pct(successCount, totalFinished) {
  if (!totalFinished) return 100.0;
  return Number(((successCount / totalFinished) * 100).toFixed(1));
}

/**
 * Business Service used by: DashboardLambda -> GET /dashboard/summary
 * Aggregates Fusion/OIC execution counts, success rates, critical failure count, open incident count,
 * top 10 recent failures, per-downstream-system health status, and root-cause category breakdown.
 */
async function getDashboardSummary(filters = {}) {
  const { fusion, oic, incidents, downstreamSystems } = await dashboardRepository.getSummaryDataset(filters);

  const fusionTotal = fusion.length;
  const fusionSuccess = fusion.filter((r) => r.status === 'SUCCESS').length;
  const fusionFailed = fusion.filter((r) => r.status === 'FAILED').length;
  const fusionRunning = fusion.filter((r) => r.status === 'RUNNING').length;
  const fusionWarning = fusion.filter((r) => r.status === 'WARNING').length;
  const fusionSuccessRate = pct(fusionSuccess, fusionTotal - fusionRunning);

  const oicTotal = oic.length;
  const oicSuccess = oic.filter((r) => r.status === 'SUCCESS').length;
  const oicFailed = oic.filter((r) => r.status === 'FAILED').length;
  const oicRunning = oic.filter((r) => r.status === 'RUNNING').length;
  const oicWarning = oic.filter((r) => r.status === 'WARNING').length;
  const oicSuccessRate = pct(oicSuccess, oicTotal - oicRunning);

  const criticalFailures =
    fusion.filter((r) => r.status === 'FAILED' && r.severity === 'Critical').length +
    oic.filter((r) => r.status === 'FAILED' && r.severity === 'Critical').length;

  const openIncidents = incidents.filter((i) => !['Resolved', 'Closed'].includes(i.status)).length;

  // Recent critical/high failures across both Fusion and OIC
  const recentCriticalFailures = [
    ...fusion
      .filter((r) => r.status === 'FAILED')
      .map((r) => ({
        sourceType: 'FUSION',
        executionId: r.execution_id,
        processName: r.job_name,
        moduleOrFamily: r.module,
        downstreamSystem: null,
        severity: r.severity,
        errorCode: r.error_code,
        errorCategory: r.error_category,
        errorMessage: r.error_message,
        startTime: r.start_time,
        correlationId: r.correlation_id,
        incidentId: r.incident_id,
        incidentStatus: r.incident_status
      })),
    ...oic
      .filter((r) => r.status === 'FAILED')
      .map((r) => ({
        sourceType: 'OIC',
        executionId: r.instance_id,
        processName: r.integration_name,
        moduleOrFamily: r.process_family,
        downstreamSystem: r.target_system_name,
        severity: r.severity,
        errorCode: r.error_code,
        errorCategory: r.error_category,
        errorMessage: r.error_message,
        startTime: r.start_time,
        correlationId: r.correlation_id,
        incidentId: r.incident_id,
        incidentStatus: r.incident_status
      }))
  ]
    .sort((a, b) => {
      const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      if (a.startTime !== b.startTime) return a.startTime < b.startTime ? 1 : -1;
      return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    })
    .slice(0, 10);

  // Impacted downstream systems summary
  const impactedSystems = downstreamSystems.map((sys) => {
    const sysOic = oic.filter((r) => r.target_system_id === sys.system_id);
    const failedRuns = sysOic.filter((r) => r.status === 'FAILED');
    const activeIncidents = incidents.filter(
      (i) => i.downstream_system_id === sys.system_id && !['Resolved', 'Closed'].includes(i.status)
    );
    return {
      system_id: sys.system_id,
      system_name: sys.system_name,
      system_type: sys.system_type,
      criticality: sys.criticality,
      totalExecutions: sysOic.length,
      failedExecutions: failedRuns.length,
      openIncidents: activeIncidents.length,
      healthStatus: failedRuns.some((f) => f.severity === 'Critical') || activeIncidents.length > 0
        ? 'Impacted'
        : failedRuns.length > 0
        ? 'Degraded'
        : 'Healthy'
    };
  });

  // Breakdown by error category for operational insight
  const categoryMap = new Map();
  for (const r of [...fusion, ...oic].filter((x) => x.status === 'FAILED')) {
    const cat = r.error_category || 'Uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }
  const failureByCategory = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const meta = await dashboardRepository.getMetadata();

  return {
    fusionTotal,
    fusionSuccess,
    fusionFailed,
    fusionRunning,
    fusionWarning,
    fusionSuccessRate,
    oicTotal,
    oicSuccess,
    oicFailed,
    oicRunning,
    oicWarning,
    oicSuccessRate,
    criticalFailures,
    openIncidents,
    recentCriticalFailures,
    impactedSystems,
    failureByCategory,
    availableModules: meta.modules,
    activeDbMode: meta.activeDbMode
  };
}

module.exports = { getDashboardSummary };
