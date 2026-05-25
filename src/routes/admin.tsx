/**
 * F-12 — Admin Control Plane route (/admin).
 *
 * Composes the six admin panels against a single AdminViewModel.
 * The recommendation queue is rendered from view-model state that has
 * already been projected through filterRecommendationsForAdminSurface,
 * so the N2 invariant is enforced at the rendering boundary.
 */
import { useState } from 'react';
import {
  EMPTY_ADMIN_VIEW_MODEL,
  type AdminViewModel,
} from '@components/admin/viewModel';
import { PromptVersionPanel } from '@components/admin/PromptVersionPanel';
import { ThresholdInspectorPanel } from '@components/admin/ThresholdInspectorPanel';
import { AutoConfirmCriteriaPanel } from '@components/admin/AutoConfirmCriteriaPanel';
import { SchemaQualityPanel } from '@components/admin/SchemaQualityPanel';
import { CorrectionTrendPanel } from '@components/admin/CorrectionTrendPanel';
import { RecommendationQueuePanel } from '@components/admin/RecommendationQueuePanel';

interface AdminRouteProps {
  readonly initialViewModel?: AdminViewModel;
}

export default function AdminRoute({
  initialViewModel = EMPTY_ADMIN_VIEW_MODEL,
}: AdminRouteProps) {
  const [vm] = useState<AdminViewModel>(initialViewModel);

  return (
    <div data-testid="admin-route" style={rootStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Admin Control Plane</h1>
        <p style={subtitleStyle}>
          Inspect prompt versions, field thresholds, and auto-confirm criteria.
          Review correction trends and the recommendation queue.
        </p>
      </header>
      <PromptVersionPanel versions={vm.promptVersions} />
      <ThresholdInspectorPanel inspector={vm.thresholdInspector} />
      <AutoConfirmCriteriaPanel criteria={vm.autoConfirmCriteria} />
      <SchemaQualityPanel fields={vm.schemaQuality} />
      <CorrectionTrendPanel corrections={vm.correctionTrend} />
      <RecommendationQueuePanel recommendations={vm.recommendations} />
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
