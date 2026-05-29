/**
 * F-13 — Internal Product Intelligence route (S3.REBUILD).
 *
 * New surface composed:
 *   - F-21 ObjectHeader with 5 functional tabs:
 *       Flywheel · Feedback queue · Model regression ·
 *       Capability gaps · Roadmap evidence
 *   - FlywheelDiagram (5 nodes in the verbatim handoff order; the 5th
 *     node, Roadmap evidence, carries an accent class).
 *   - HiddenSignalCard for every approved signal whose signalType is
 *     unsupported_free_text_business_condition (8-attribute grid + the
 *     "Hidden internal signal · not shown to customer" label).
 *   - RoadmapSignalsPanel (F-29 surface — provisional 'Being assessed
 *     for validity' tag + governance_approved no-tag; ranked via F-25
 *     rankRoadmapEvidence + generateRoadmapReason).
 *   - Legacy GovernanceQueuePanel · RegressionSignalsPanel ·
 *     CapabilityGapAnalyticsPanel · QualityMetricLogPanel preserved
 *     for v1 test compatibility (same shim pattern as F-11 + F-12).
 *
 * Containment: this is the ONE workspace where ProductSignals (incl.
 * the DAEJOO disposal phrase as signal_type=
 * 'unsupported_free_text_business_condition') and the QualityMetric log
 * surface. The customer + admin route smoke tests assert their DOMs
 * contain NO internal- data-testid, so what renders here cannot leak.
 */
import { useState } from 'react';
import {
  EMPTY_INTERNAL_VIEW_MODEL,
  type InternalViewModel,
} from '@components/internal/viewModel';
import { getProductSignals } from '@domain/submitCorrection';
import { ObjectHeader, type ObjectHeaderTab } from '@components/shell/ObjectHeader';
import { FlywheelDiagram } from '@components/internal/FlywheelDiagram';
import { HiddenSignalCard } from '@components/internal/HiddenSignalCard';
import { GovernanceQueuePanel } from '@components/internal/GovernanceQueuePanel';
import { RegressionSignalsPanel } from '@components/internal/RegressionSignalsPanel';
import { QualityMetricLogPanel } from '@components/internal/QualityMetricLogPanel';
import { CapabilityGapAnalyticsPanel } from '@components/internal/CapabilityGapAnalyticsPanel';
import { RoadmapSignalsPanel } from '@components/internal/RoadmapSignalsPanel';
import { AgentIoLogPanel } from '@components/shared/AgentIoLogPanel';
import { AgentIOMetricsPanel } from '@components/admin/AgentIOMetricsPanel';

const OBJECT_HEADER_TABS: readonly ObjectHeaderTab[] = Object.freeze([
  { id: 'flywheel', label: 'Flywheel' },
  { id: 'feedback-queue', label: 'Feedback queue' },
  { id: 'model-regression', label: 'Model regression' },
  { id: 'capability-gaps', label: 'Capability gaps' },
  { id: 'roadmap-evidence', label: 'Roadmap evidence' },
]);

interface InternalRouteProps {
  readonly initialViewModel?: InternalViewModel;
}

export default function InternalRoute({
  initialViewModel = EMPTY_INTERNAL_VIEW_MODEL,
}: InternalRouteProps) {
  const [vm] = useState<InternalViewModel>(initialViewModel);
  const [activeTab, setActiveTab] = useState<string>('flywheel');
  // F-30: Agent I/O Log entry point — visible button in the F-21
  // workspace shell on /internal. Same affordance as /admin, same
  // structural guard against /customer.
  const [showAgentIoLog, setShowAgentIoLog] = useState<boolean>(false);

  // F-31 store-read site — symmetric companion to the customer
  // route's append site at src/routes/customer.tsx (F-31 append site).
  // The view-model's approvedSignals carries test-mode seeded fixtures;
  // production reads from the F-09 escape-hatch store (getProductSignals)
  // so signals appended via the conversational consent path
  // (provenance='conversational_notify_team') become visible here. Both
  // sources merge by id to avoid duplicates when tests seed a signal
  // that also lives in the store.
  const storeSignals = getProductSignals();
  const seededIds = new Set(vm.approvedSignals.map((s) => s.id));
  const mergedApprovedSignals = [
    ...vm.approvedSignals,
    ...storeSignals.filter((s) => !seededIds.has(s.id)),
  ];

  const freeTextSignals = mergedApprovedSignals.filter(
    (s) => s.signalType === 'unsupported_free_text_business_condition',
  );

  return (
    <div data-testid="internal-route" style={rootStyle}>
      <ObjectHeader
        crumbs={['Internal', 'Product Intelligence']}
        title="Internal Product Intelligence"
        sub="Governance queue, flywheel evidence, regressions, capability gaps, and the QualityMetric log."
        tabs={OBJECT_HEADER_TABS}
        activeTab={activeTab}
        onTab={setActiveTab}
      />
      <div style={shellActionsStyle}>
        <button
          type="button"
          data-testid="internal-agent-io-log-button"
          onClick={() => setShowAgentIoLog((prev) => !prev)}
          aria-pressed={showAgentIoLog}
          style={agentIoLogButtonStyle}
        >
          Agent I/O Log
        </button>
      </div>
      <div style={contentStyle}>
        <AgentIOMetricsPanel />
        {showAgentIoLog ? <AgentIoLogPanel /> : null}
        <FlywheelDiagram />
        {freeTextSignals.map((signal) => (
          <HiddenSignalCard key={signal.id} signal={signal} />
        ))}
        <GovernanceQueuePanel queue={vm.governanceQueue} />
        <RoadmapSignalsPanel signals={mergedApprovedSignals} />
        <RegressionSignalsPanel signals={vm.regressionSignals} />
        <CapabilityGapAnalyticsPanel gaps={vm.capabilityGaps} />
        <QualityMetricLogPanel />
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-section-gap-y)',
};

const contentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-section-gap-y)',
  padding: '0 var(--app-padding-x) var(--app-padding-x)',
};

const shellActionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '0 var(--app-padding-x)',
};

const agentIoLogButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-button, 4px)',
  border: '1px solid var(--line, #d9d9d9)',
  background: 'var(--panel, #fff)',
  color: 'var(--ink-1, #32363a)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size, 13px)',
  cursor: 'pointer',
};
