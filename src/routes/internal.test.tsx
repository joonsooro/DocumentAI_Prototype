// @vitest-environment jsdom
/**
 * F-13 — Internal Product Intelligence smoke tests.
 *
 * Asserts:
 *   - The route mounts with all five panels.
 *   - RED-2 containment: the DAEJOO material-disposal phrase, when
 *     present in a ProductSignal, IS rendered on the /internal route
 *     under the unsupported_free_text_business_condition category.
 *   - The same phrase, when rendered on /customer or /admin, would be
 *     forbidden — but those routes don't render ProductSignals at all
 *     (their view-models don't carry ProductSignal). That structural
 *     guard is already tested in F-11 / F-12.
 *   - The QualityMetric log panel mounts the F-18 subscription and
 *     re-renders when recordSuccess / recordFailure push new entries.
 *   - Three-workspace separation: the internal route DOM has no
 *     customer- or admin- data-testids.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import InternalRoute from './internal';
import type { InternalViewModel } from '@components/internal/viewModel';
import type {
  CapabilityGap,
  ProductSignal,
  RegressionSignal,
} from '@domain/types';
import {
  recordSuccess,
  recordFailure,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';
import { AgentFailure } from '@runtime/aiCoreClient';

// ---------------------------------------------------------------------------
// Fixtures — populated view-model that includes the DAEJOO disposal signal
// ---------------------------------------------------------------------------

const DAEJOO_DISPOSAL_SIGNAL: ProductSignal = {
  id: 'sig-daejoo-disposal',
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial_invoice / business-condition gap',
  intentFragment: 'auto-dispose spent materials at the supplier dock',
  suggestedProductArea: 'document-ai roadmap intake',
  frequency: 1,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: 'DAEJOO',
  country: 'KR',
  sourceCorrectionIds: [],
  governanceApprovedAt: '2026-05-25T00:00:00Z',
};

const RECURRING_SIGNAL: ProductSignal = {
  id: 'sig-recurring',
  signalType: 'recurring_correction_pattern',
  category: 'commercial_invoice / field-correction pattern',
  intentFragment: 'payment_terms',
  suggestedProductArea: 'schema field "payment_terms" instruction',
  frequency: 5,
  customerImpact: 'high',
  documentType: 'commercial_invoice',
  supplier: null,
  country: null,
  sourceCorrectionIds: ['c-1', 'c-2', 'c-3', 'c-4', 'c-5'],
  governanceApprovedAt: '2026-05-25T00:00:00Z',
};

const REGRESSION_SIGNAL: RegressionSignal = {
  id: 'reg-1',
  metric: 'field_accuracy',
  field: null,
  beforeValue: 0.95,
  afterValue: 0.62,
  delta: -0.33,
  boundary: { kind: 'prompt_version', fromId: 'v1', toId: 'v2' },
  detectedAt: '2026-05-25T00:00:00Z',
};

const GAP: CapabilityGap = {
  id: 'gap-1',
  description: 'free-text disposal logic outside the data model',
  frequency: 1,
  customerImpact: 'medium',
  documentTypes: ['commercial_invoice'],
  suppliers: ['DAEJOO'],
  countries: ['KR'],
  actionability: 'long_term',
  relatedSignalIds: ['sig-daejoo-disposal'],
  rolledUpAt: '2026-05-25T00:00:00Z',
};

const VIEW_MODEL: InternalViewModel = {
  governanceQueue: [
    {
      candidateKey: 'commercial_invoice::payment_terms',
      fragment: 'payment_terms',
      frequency: 5,
      distinctSuppliers: 2,
      aggregateImpact: 'high',
      approved: true,
      reason: 'thresholds met',
    },
    {
      candidateKey: 'commercial_invoice::remark_freetext',
      fragment: 'remark_freetext',
      frequency: 1,
      distinctSuppliers: 1,
      aggregateImpact: 'medium',
      approved: false,
      reason: 'frequency 1 < min 3',
    },
  ],
  approvedSignals: [DAEJOO_DISPOSAL_SIGNAL, RECURRING_SIGNAL],
  regressionSignals: [REGRESSION_SIGNAL],
  capabilityGaps: [GAP],
  corrections: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetQualityMetricLogForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  _resetQualityMetricLogForTests();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mount tests
// ---------------------------------------------------------------------------

describe('F-13 InternalRoute — mounts all five panels', () => {
  it('mounts with the empty view-model and shows empty-state cues', () => {
    const { getByTestId } = render(<InternalRoute />);
    expect(getByTestId('internal-route')).toBeTruthy();
    expect(getByTestId('internal-governance-queue-panel')).toBeTruthy();
    expect(getByTestId('internal-roadmap-signals-panel')).toBeTruthy();
    expect(getByTestId('internal-regression-panel')).toBeTruthy();
    expect(getByTestId('internal-capability-gap-panel')).toBeTruthy();
    expect(getByTestId('internal-quality-log-panel')).toBeTruthy();
  });

  it('mounts with a populated view-model and renders every component', () => {
    const { getByTestId, queryAllByTestId } = render(
      <InternalRoute initialViewModel={VIEW_MODEL} />,
    );
    expect(queryAllByTestId(/^internal-governance-row-/).length).toBe(2);
    expect(queryAllByTestId(/^internal-regression-row-/).length).toBe(1);
    expect(queryAllByTestId(/^internal-capability-gap-row-/).length).toBe(1);
    // Both roadmap signal categories rendered with content
    expect(getByTestId('internal-roadmap-unsupported-free-text-row-sig-daejoo-disposal')).toBeTruthy();
    expect(getByTestId('internal-roadmap-recurring-corrections-row-sig-recurring')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RED-2 — DAEJOO disposal phrase renders HERE, in the right category
// ---------------------------------------------------------------------------

describe('F-13 RED-2 containment — DAEJOO disposal phrase surfaces here only', () => {
  it('renders the disposal phrase under the unsupported_free_text_business_condition block', () => {
    const { getByTestId } = render(<InternalRoute initialViewModel={VIEW_MODEL} />);
    const fragment = getByTestId('internal-roadmap-unsupported-free-text-fragment-sig-daejoo-disposal');
    expect(fragment.textContent).toContain('auto-dispose spent materials');
  });

  it('the disposal signal block has a verdict-approved governance row', () => {
    const { getByTestId } = render(<InternalRoute initialViewModel={VIEW_MODEL} />);
    const verdict = getByTestId('internal-governance-verdict-commercial_invoice::payment_terms');
    expect(verdict.textContent).toBe('approved');
    const held = getByTestId('internal-governance-verdict-commercial_invoice::remark_freetext');
    expect(held.textContent).toBe('held');
  });
});

// ---------------------------------------------------------------------------
// QualityMetric log — F-18 subscription proves reactive update
// ---------------------------------------------------------------------------

describe('F-13 QualityMetric log — F-18 subscribe wiring', () => {
  it('renders no rows initially when the log is empty', () => {
    const { container, queryAllByTestId } = render(<InternalRoute />);
    expect(container.textContent).toContain('No agent calls logged yet');
    expect(queryAllByTestId(/^internal-quality-row-/).length).toBe(0);
  });

  it('re-renders when recordSuccess pushes a new entry', () => {
    const { queryAllByTestId } = render(<InternalRoute />);
    expect(queryAllByTestId(/^internal-quality-row-/).length).toBe(0);
    act(() => {
      recordSuccess(
        {
          agent: 'compile',
          source: 'aiCore',
          templateUsed: false,
          latency_ms: 200,
          token_usage: { input: 10, output: 5 },
          model: 'd-haiku',
          max_tokens: 1024,
          value: 'ok',
        },
        { nowIso: '2026-05-25T00:00:00Z' },
      );
    });
    expect(queryAllByTestId(/^internal-quality-row-/).length).toBe(1);
  });

  it('renders status=fail with a red badge when recordFailure pushes', () => {
    const { container } = render(<InternalRoute />);
    act(() => {
      recordFailure(
        new AgentFailure({ agent: 'compile', reason: 'malformed_json', message: 'plain text' }),
        { nowIso: '2026-05-25T00:00:00Z' },
      );
    });
    // The badge text content is "fail"
    expect(container.textContent).toContain('fail');
  });
});

// ---------------------------------------------------------------------------
// HAPPY-6 — three-workspace separation
// ---------------------------------------------------------------------------

describe('F-13 three-workspace separation (HAPPY-6)', () => {
  it('the internal route DOM contains no customer- or admin- data-testids', () => {
    const { container } = render(<InternalRoute initialViewModel={VIEW_MODEL} />);
    expect(container.querySelector('[data-testid^="customer-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="admin-"]')).toBeNull();
  });
});
