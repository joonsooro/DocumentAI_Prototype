// @vitest-environment jsdom
/**
 * F-19 — RED-1, RED-2 eval cases.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CustomerRoute from '@routes/customer';
import InternalRoute from '@routes/internal';
import { filterRecommendationsForAdminSurface } from '@components/admin/viewModel';
import {
  DAEJOO_INTENT,
  DAEJOO_COMPILED_CONFIG,
  DAEJOO_DISPOSAL_SIGNAL,
  NEEDS_REVIEW_READINESS,
  CLEAN_ADMIN_REC,
} from './fixtures';
import type { AdminRecommendation, AdminRecommendationType } from '@domain/types';

// ===========================================================================
// RED-1 — recommendations contain no 'threshold_lower' entries; readiness for
// the under-confirm field stays 'Needs review'.
// ===========================================================================
describe('F-19 RED-1 — recommendations never suggest lowering a threshold', () => {
  it('for every AdminRecommendation r: r.type !== "threshold_lower" and r.body does not match /lower(ing)?\\s+threshold/i', () => {
    // The filter is the rendering-boundary belt. Feed it a mix incl. an
    // injected forbidden entry — filter drops it.
    const mixed: AdminRecommendation[] = [
      CLEAN_ADMIN_REC,
      {
        ...CLEAN_ADMIN_REC,
        id: 'rec-bad-type',
        type: 'threshold_lower' as unknown as AdminRecommendationType,
        title: 'should be filtered by type',
        body: 'body irrelevant',
      },
      {
        ...CLEAN_ADMIN_REC,
        id: 'rec-bad-body',
        title: 'innocuous title',
        body: 'Consider lowering the threshold for payment_terms to 0.70.',
      },
    ];
    const filtered = filterRecommendationsForAdminSurface(mixed);
    for (const r of filtered) {
      expect(r.type).not.toBe('threshold_lower' as never);
      expect(r.title.toLowerCase()).not.toMatch(/lower(ing)?\s+(the\s+)?threshold/);
      expect(r.body.toLowerCase()).not.toMatch(/lower(ing)?\s+(the\s+)?threshold/);
    }
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(CLEAN_ADMIN_REC.id);
  });

  it('readiness for the under-confirm field stays "Needs review", not "Ready"', () => {
    expect(NEEDS_REVIEW_READINESS.status).toBe('Needs review');
  });
});

// ===========================================================================
// RED-2 — Customer Workspace continues to show only Supported / Supported
// with workaround; material-disposal phrase remains only inside Internal.
// ===========================================================================
describe('F-19 RED-2 — DAEJOO disposal phrase is contained in /internal', () => {
  it('Customer Workspace full-DOM text does NOT contain "Unsupported", "material disposal", or "unsupported_free_text_business_condition"', () => {
    const { container } = render(
      <CustomerRoute
        initialViewModel={{
          intent: DAEJOO_INTENT,
          configuration: DAEJOO_COMPILED_CONFIG,
          assessments: [
            { id: 'a', intentFragment: 'extract supplier', status: 'Supported', workaroundDescription: null, fieldRefs: ['supplier'] },
          ],
          clarifications: [],
          readiness: NEEDS_REVIEW_READINESS,
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toContain('Unsupported');
    expect(text).not.toContain('material disposal');
    expect(text).not.toContain('unsupported_free_text_business_condition');
  });

  it('Internal Workspace full-DOM text DOES contain the disposal-phrase signal (containment is here)', () => {
    const { container } = render(
      <InternalRoute
        initialViewModel={{
          governanceQueue: [],
          approvedSignals: [DAEJOO_DISPOSAL_SIGNAL],
          regressionSignals: [],
          capabilityGaps: [],
          corrections: [],
        }}
      />,
    );
    const text = container.textContent ?? '';
    // The signalType renders with underscores replaced by spaces — the
    // assertion follows the rendered form.
    expect(text).toContain('unsupported free text business condition');
    expect(text).toContain('auto-dispose spent materials');
  });
});
