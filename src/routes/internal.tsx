/**
 * F-13 — Internal Product Intelligence route (/internal).
 *
 * Composes the five panels from a single InternalViewModel + a live
 * subscription to the F-18 QualityMetric log (inside QualityMetricLogPanel).
 *
 * Containment: this is the ONE workspace where ProductSignals (incl. the
 * DAEJOO disposal phrase as signal_type='unsupported_free_text_business_condition'),
 * RegressionSignals, and the QualityMetric log surface. The customer and
 * admin route smoke tests assert their DOMs contain NO internal- data-testid,
 * so what renders here cannot leak back.
 */
import { useState } from 'react';
import {
  EMPTY_INTERNAL_VIEW_MODEL,
  type InternalViewModel,
} from '@components/internal/viewModel';
import { GovernanceQueuePanel } from '@components/internal/GovernanceQueuePanel';
import { RegressionSignalsPanel } from '@components/internal/RegressionSignalsPanel';
import { QualityMetricLogPanel } from '@components/internal/QualityMetricLogPanel';
import { CapabilityGapAnalyticsPanel } from '@components/internal/CapabilityGapAnalyticsPanel';
import { RoadmapSignalsPanel } from '@components/internal/RoadmapSignalsPanel';

interface InternalRouteProps {
  readonly initialViewModel?: InternalViewModel;
}

export default function InternalRoute({
  initialViewModel = EMPTY_INTERNAL_VIEW_MODEL,
}: InternalRouteProps) {
  const [vm] = useState<InternalViewModel>(initialViewModel);

  return (
    <div data-testid="internal-route" style={rootStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Internal Product Intelligence</h1>
        <p style={subtitleStyle}>
          Governance queue, model regressions, agent telemetry, capability rollups,
          and the roadmap-signal containment view.
        </p>
      </header>
      <GovernanceQueuePanel queue={vm.governanceQueue} />
      <RoadmapSignalsPanel signals={vm.approvedSignals} />
      <RegressionSignalsPanel signals={vm.regressionSignals} />
      <CapabilityGapAnalyticsPanel gaps={vm.capabilityGaps} />
      <QualityMetricLogPanel />
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
};
const headerStyle: React.CSSProperties = {
  marginBottom: 16,
};
const titleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 500, margin: '0 0 8px', color: '#32363a',
};
const subtitleStyle: React.CSSProperties = {
  fontSize: 14, color: '#5a6168', margin: 0,
};
