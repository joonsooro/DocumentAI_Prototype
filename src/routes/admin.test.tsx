// @vitest-environment jsdom
/**
 * F-12 — Admin Control Plane smoke tests.
 *
 * Asserts the route mounts the six panels, renders populated state
 * correctly, and respects the N2 / RED-1 invariant: rendered text
 * never contains the forbidden 'lower(ing)? (the )?threshold' phrase.
 *
 * Also asserts three-workspace separation: /admin DOM has no
 * customer-/internal- data-testids.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import AdminRoute from './admin';
import type { AdminViewModel } from '@components/admin/viewModel';
import type {
  AdminRecommendation,
  CompiledConfiguration,
  CorrectionEvent,
  PromptVersion,
} from '@domain/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: CompiledConfiguration = {
  id: 'cfg::test::1',
  intentId: 'intent::test::1',
  schema: {
    fields: [
      { name: 'supplier', dataType: 'string', required: true, instruction: 'extract supplier', validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payment_terms', dataType: 'string', required: true, instruction: 'extract terms', validation: null, regex: null, confidenceThreshold: 0.85 },
    ],
  },
  processingMode: 'review_required',
  source: 'aiCore',
  templateUsed: false,
  compiledAt: '2026-05-25T00:00:00Z',
};

const PROMPT_VERSIONS: PromptVersion[] = [
  {
    id: 'pv-1',
    agent: 'compile',
    version: '1.0.0',
    supplier: null,
    promptText: 'You are the compile agent...',
    createdAt: '2026-05-25T00:00:00Z',
    active: true,
  },
  {
    id: 'pv-2',
    agent: 'compile',
    version: '1.1.0',
    supplier: 'DAEJOO',
    promptText: 'You are the compile agent (DAEJOO scope)...',
    createdAt: '2026-05-25T00:00:00Z',
    active: false,
  },
];

const CORRECTIONS: CorrectionEvent[] = [
  {
    id: 'corr-1',
    documentRunId: 'run-1',
    field: 'payment_terms',
    oldValue: '60 days',
    newValue: 'WITHIN 60 DAYS AFTER BOARDING',
    operator: 'op-1',
    submittedAt: '2026-05-25T00:00:00Z',
    governance: {
      frequency: null,
      customerImpact: 'medium',
      documentType: 'commercial_invoice',
      supplier: 'DAEJOO',
      country: 'KR',
    },
  },
];

const RECS: AdminRecommendation[] = [
  {
    id: 'rec-1',
    type: 'add_field_instruction',
    title: 'Clarify payment_terms extraction',
    body: 'Multiple operators corrected payment_terms. Add an instruction to capture the full free-text phrase verbatim.',
    scope: 'this_supplier',
    sourceCorrectionIds: ['corr-1'],
    proposedAt: '2026-05-25T00:00:00Z',
  },
];

const VIEW_MODEL: AdminViewModel = {
  promptVersions: PROMPT_VERSIONS,
  thresholdInspector: {
    configuration: CONFIG,
    stagedOverrides: [{ field: 'payment_terms', staged: 0.78 }],
  },
  autoConfirmCriteria: [
    { field: 'supplier', criterion: 'confidence >= 0.90' },
    { field: 'payment_terms', criterion: 'confidence >= 0.85 AND not empty' },
  ],
  schemaQuality: [
    { field: 'supplier', recentSuccessRate: 0.97, recentCorrectionCount: 0 },
    { field: 'payment_terms', recentSuccessRate: 0.62, recentCorrectionCount: 5 },
  ],
  correctionTrend: CORRECTIONS,
  recommendations: RECS,
};

// ---------------------------------------------------------------------------
// Mount tests
// ---------------------------------------------------------------------------

describe('F-12 AdminRoute — mounts and renders all six panels', () => {
  it('mounts the route with the empty view-model and shows empty-state cues', () => {
    const { getByTestId, container } = render(<AdminRoute />);
    expect(getByTestId('admin-route')).toBeTruthy();
    expect(getByTestId('admin-prompt-versions-panel')).toBeTruthy();
    expect(getByTestId('admin-threshold-inspector-panel')).toBeTruthy();
    expect(getByTestId('admin-autoconfirm-panel')).toBeTruthy();
    expect(getByTestId('admin-schema-quality-panel')).toBeTruthy();
    expect(getByTestId('admin-correction-trend-panel')).toBeTruthy();
    expect(getByTestId('admin-recommendation-queue-panel')).toBeTruthy();
    expect(container.textContent).toMatch(/No prompt versions yet/);
  });

  it('mounts the route with a populated view-model and renders every component', () => {
    const { getByTestId, queryAllByTestId } = render(<AdminRoute initialViewModel={VIEW_MODEL} />);
    expect(queryAllByTestId(/^admin-prompt-version-/).length).toBe(2);
    expect(queryAllByTestId(/^admin-threshold-row-/).length).toBe(2);
    // Exclude the parent panel + list testids; only count individual field rows.
    expect(
      queryAllByTestId(/^admin-autoconfirm-/).filter(
        (el) => !['admin-autoconfirm-panel', 'admin-autoconfirm-list'].includes(
          el.getAttribute('data-testid') ?? '',
        ),
      ).length,
    ).toBe(2);
    expect(queryAllByTestId(/^admin-schema-quality-row-/).length).toBe(2);
    expect(queryAllByTestId(/^admin-correction-row-/).length).toBe(1);
    expect(getByTestId('admin-recommendation-rec-1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// N2 / RED-1 invariant — the load-bearing assertion
// ---------------------------------------------------------------------------

describe('F-12 AdminRoute — N2 / RED-1 invariant', () => {
  it('with an empty view-model, the DOM does not contain the forbidden phrase', () => {
    const { container } = render(<AdminRoute />);
    expect((container.textContent ?? '').toLowerCase()).not.toMatch(/lower(ing)?\s+(the\s+)?threshold/);
  });

  it('with a populated view-model, the DOM does not contain the forbidden phrase', () => {
    const { container } = render(<AdminRoute initialViewModel={VIEW_MODEL} />);
    expect((container.textContent ?? '').toLowerCase()).not.toMatch(/lower(ing)?\s+(the\s+)?threshold/);
  });

  it('threshold inspector is rendered as a TOOL — its heading is neutral, not a recommendation phrasing', () => {
    const { getByTestId, container } = render(<AdminRoute initialViewModel={VIEW_MODEL} />);
    const panel = getByTestId('admin-threshold-inspector-panel');
    // Heading must exist and must not contain the forbidden phrase
    expect(panel.textContent).toMatch(/Field thresholds/);
    expect((container.textContent ?? '').toLowerCase()).not.toMatch(/lower(ing)?\s+(the\s+)?threshold/);
  });
});

// ---------------------------------------------------------------------------
// HAPPY-6 — three-workspace separation
// ---------------------------------------------------------------------------

describe('F-12 three-workspace separation (HAPPY-6)', () => {
  it('the admin route DOM contains no customer- or internal- data-testids', () => {
    const { container } = render(<AdminRoute initialViewModel={VIEW_MODEL} />);
    expect(container.querySelector('[data-testid^="customer-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="internal-"]')).toBeNull();
  });
});
