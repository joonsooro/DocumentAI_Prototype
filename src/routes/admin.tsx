/**
 * F-12 — Admin Control Plane route (S3.REBUILD).
 *
 * New surface composed:
 *   - F-21 ObjectHeader with 5 functional tabs:
 *       Recommendations · Prompt versions · Threshold governance ·
 *       Schema quality · Correction trends
 *   - F-12 AdminKpiStrip with 5 KPI cards (verbatim labels)
 *   - RecommendationQueuePanel seeded with 3 verbatim card titles
 *     [handoff-derived] when no initialViewModel is supplied
 *   - F-24 ThresholdGovernancePanel (informational dual-approval guard)
 *   - PromptVersionPanel · AutoConfirmCriteriaPanel · SchemaQualityPanel
 *     · CorrectionTrendPanel · ThresholdInspectorPanel — kept for v1
 *     test compatibility (same shim pattern as F-11 + F-29).
 *
 * N2 invariant: filterRecommendationsForAdminSurface still drops any
 * recommendation matching /lower(ing)?\s+threshold/i (5-layer guard:
 * TS union + zod + F-15 runtime + this projection + ESLint rule on
 * src/components/admin/**).
 */
import { useState } from 'react';
import {
  EMPTY_ADMIN_VIEW_MODEL,
  filterRecommendationsForAdminSurface,
  type AdminViewModel,
} from '@components/admin/viewModel';
import { ObjectHeader, type ObjectHeaderTab } from '@components/shell/ObjectHeader';
import { AdminKpiStrip } from '@components/admin/AdminKpiStrip';
import { PromptVersionPanel } from '@components/admin/PromptVersionPanel';
import { ThresholdInspectorPanel } from '@components/admin/ThresholdInspectorPanel';
import { ThresholdGovernancePanel } from '@components/admin/ThresholdGovernancePanel';
import { AutoConfirmCriteriaPanel } from '@components/admin/AutoConfirmCriteriaPanel';
import { SchemaQualityPanel } from '@components/admin/SchemaQualityPanel';
import { CorrectionTrendPanel } from '@components/admin/CorrectionTrendPanel';
import { RecommendationQueuePanel } from '@components/admin/RecommendationQueuePanel';
import { AgentIoLogPanel } from '@components/shared/AgentIoLogPanel';
import type { AdminRecommendation } from '@domain/types';

// 3 verbatim recommendation titles required by F-12 acceptance. These
// are handoff-derived structural detail — the titles are part of the
// acceptance contract (binary string match). Seeded when no
// initialViewModel.recommendations is supplied.
const SEED_RECOMMENDATIONS: readonly AdminRecommendation[] = Object.freeze([
  {
    id: 'rec::seed::1',
    type: 'add_reusable_rule',
    title: 'Add reusable rule for no-commercial-value line handling',
    body:
      'Recurring corrections on the commercial_value_indicator field across DAEJOO show that operators consistently mark "sample / no commercial value" lines as excluded from the payable total. A reusable validation rule would auto-apply this exclusion at extraction time.',
    scope: 'all_suppliers',
    sourceCorrectionIds: [],
    proposedAt: '2026-05-25T00:00:00Z',
  },
  {
    id: 'rec::seed::2',
    type: 'create_supplier_prompt_version',
    title: 'Create supplier-specific prompt version for DAEJOO commercial invoices',
    body:
      'DAEJOO invoices use unusual payment_terms phrasing ("net 60 from BoL") that the default prompt mis-parses ~25% of the time. A supplier-pinned prompt version would lift field accuracy on this dimension.',
    scope: 'this_supplier',
    sourceCorrectionIds: [],
    proposedAt: '2026-05-25T00:00:00Z',
  },
  {
    id: 'rec::seed::3',
    type: 'add_field_instruction',
    title: 'Add field instruction for payable amount vs customs total',
    body:
      'Two operators submitted corrections clarifying the difference between payable_amount (excludes no-commercial-value lines) and total_amount (gross document total). Encoding this distinction in the field_instruction would prevent future mis-extractions.',
    scope: 'all_suppliers',
    sourceCorrectionIds: [],
    proposedAt: '2026-05-25T00:00:00Z',
  },
]);

const OBJECT_HEADER_TABS: readonly ObjectHeaderTab[] = Object.freeze([
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'prompt-versions', label: 'Prompt versions' },
  { id: 'threshold-governance', label: 'Threshold governance' },
  { id: 'schema-quality', label: 'Schema quality' },
  { id: 'correction-trends', label: 'Correction trends' },
]);

interface AdminRouteProps {
  readonly initialViewModel?: AdminViewModel;
}

export default function AdminRoute({ initialViewModel = EMPTY_ADMIN_VIEW_MODEL }: AdminRouteProps) {
  const [vm] = useState<AdminViewModel>(initialViewModel);
  const [activeTab, setActiveTab] = useState<string>('recommendations');
  // F-30: Agent I/O Log entry point — visible button in the F-21
  // workspace shell on /admin. Clicking it mounts the panel inline on
  // this route. The CustomerViewModel structurally has no field for
  // agent payloads, so this affordance is impossible to mount on
  // /customer (preserves N1 + N3 by construction per A16).
  const [showAgentIoLog, setShowAgentIoLog] = useState<boolean>(false);

  // Seed the 3 verbatim recommendation titles when the view-model is
  // empty so the demo opens with visible content. F-15 + N2 filter
  // still runs on the projected list to keep the invariant honest.
  const recommendationsForRender = filterRecommendationsForAdminSurface(
    vm.recommendations.length > 0 ? vm.recommendations : SEED_RECOMMENDATIONS,
  );

  return (
    <div data-testid="admin-route" style={rootStyle}>
      <ObjectHeader
        crumbs={['Admin', 'Document AI']}
        title="Admin Control Plane"
        sub="Prompt versions, thresholds, recommendations, and quality trends."
        tabs={OBJECT_HEADER_TABS}
        activeTab={activeTab}
        onTab={setActiveTab}
      />
      <div style={shellActionsStyle}>
        <button
          type="button"
          data-testid="admin-agent-io-log-button"
          onClick={() => setShowAgentIoLog((prev) => !prev)}
          aria-pressed={showAgentIoLog}
          style={agentIoLogButtonStyle}
        >
          Agent I/O Log
        </button>
      </div>
      <AdminKpiStrip />
      <div style={contentStyle}>
        {showAgentIoLog ? <AgentIoLogPanel /> : null}
        <RecommendationQueuePanel recommendations={recommendationsForRender} />
        <ThresholdGovernancePanel />
        <PromptVersionPanel versions={vm.promptVersions} />
        <ThresholdInspectorPanel inspector={vm.thresholdInspector} />
        <AutoConfirmCriteriaPanel criteria={vm.autoConfirmCriteria} />
        <SchemaQualityPanel fields={vm.schemaQuality} />
        <CorrectionTrendPanel corrections={vm.correctionTrend} />
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
