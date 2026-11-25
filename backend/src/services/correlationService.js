'use strict';

const env = require('../config/env');
const incidentRepository = require('../repositories/incidentRepository');

const FAMILY_IMPACT_MAP = {
  'Supply Chain': 'Supply-chain planning and warehouse fulfillment/shipment dispatch may be delayed.',
  Finance: 'Financial accounting, invoice processing, or supplier/bank payments may be delayed.',
  Procurement: 'Purchase order transmission and supplier ASN synchronization may be disrupted.',
  HCM: 'Employee master synchronization and payroll processing may be impacted.'
};

/**
 * Resolves end-to-end correlation across Fusion Jobs, OIC Integrations, and Downstream Systems.
 * Rule 1: Match exact correlation_id first ("Exact Correlation").
 * Rule 2: Optionally correlate by process_family within a configurable time window,
 *         explicitly labeled "Potential Relationship" without claiming causation.
 */
async function buildCorrelationContext({ correlationId, sourceType, processFamily, referenceTime }) {
  const windowMinutes = env.correlationTimeWindowMinutes;
  const raw = await incidentRepository.findCorrelatedExecutions({
    correlationId,
    sourceType,
    processFamily,
    referenceTime,
    windowMinutes
  });

  const hasExactCrossMatch = raw.exactFusion.length > 0 && raw.exactOic.length > 0;
  const hasExactSingle = raw.exactFusion.length > 0 || raw.exactOic.length > 0;

  let relationshipType = 'None';
  let fusionChain = [];
  let oicChain = [];

  if (hasExactCrossMatch) {
    relationshipType = 'Exact Correlation';
    fusionChain = raw.exactFusion;
    oicChain = raw.exactOic;
  } else if (raw.nearbyFusion.length > 0 || raw.nearbyOic.length > 0) {
    relationshipType = 'Potential Relationship (Time-Window)';
    fusionChain = raw.exactFusion.length ? raw.exactFusion : raw.nearbyFusion;
    oicChain = raw.exactOic.length ? raw.exactOic : raw.nearbyOic;
  } else if (hasExactSingle) {
    relationshipType = 'Single-Tier Execution';
    fusionChain = raw.exactFusion;
    oicChain = raw.exactOic;
  }

  const impactedDownstream = [];
  const seenSystems = new Set();
  for (const o of oicChain) {
    if (o.target_system_id && !seenSystems.has(o.target_system_id)) {
      seenSystems.add(o.target_system_id);
      impactedDownstream.push({
        system_id: o.target_system_id,
        system_name: o.target_system_name,
        criticality: o.target_criticality || 'Medium'
      });
    }
  }

  const chainSteps = [];
  if (fusionChain.length > 0) {
    const f = fusionChain[0];
    chainSteps.push(`Fusion: ${f.job_name} (${f.status})`);
  }
  if (oicChain.length > 0) {
    const o = oicChain[0];
    chainSteps.push(`OIC: ${o.integration_name} (${o.status})`);
  }
  if (impactedDownstream.length > 0) {
    const d = impactedDownstream[0];
    chainSteps.push(`Downstream: ${d.system_name} (${d.criticality})`);
  }

  const familyNote = FAMILY_IMPACT_MAP[processFamily] || 'Downstream business operations may require reconciliation.';
  let businessImpact = '';
  if (relationshipType === 'Exact Correlation') {
    businessImpact = `${chainSteps.join(' -> ')}. Business impact: ${familyNote}`;
  } else if (relationshipType === 'Potential Relationship (Time-Window)') {
    businessImpact = `Potential relationship detected within ±${windowMinutes} mins in ${processFamily} (${chainSteps.join(' -> ')}). Note: shared time window only; causation is not confirmed. ${familyNote}`;
  } else if (chainSteps.length > 0) {
    businessImpact = `${chainSteps.join(' -> ')}. Business impact: ${familyNote}`;
  } else {
    businessImpact = 'No correlated cross-tier execution found for this record.';
  }

  return {
    correlationId: correlationId || null,
    relationshipType,
    isExactMatch: relationshipType === 'Exact Correlation',
    timeWindowMinutes: windowMinutes,
    chainSummary: chainSteps.join(' -> '),
    businessImpact,
    fusionExecutions: fusionChain,
    oicExecutions: oicChain,
    impactedDownstream
  };
}

module.exports = { buildCorrelationContext };
