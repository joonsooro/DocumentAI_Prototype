/**
 * F-13 — Internal view-model unit tests.
 *
 * Pure module. Asserts that partitionApprovedSignals correctly buckets
 * ProductSignals by signalType — this is the data feed for the
 * RoadmapSignalsPanel category blocks.
 */
import { describe, it, expect } from 'vitest';
import {
  partitionApprovedSignals,
  EMPTY_INTERNAL_VIEW_MODEL,
} from '@components/internal/viewModel';
import type { ProductSignal } from '@domain/types';

function signal(id: string, type: ProductSignal['signalType']): ProductSignal {
  return {
    id,
    signalType: type,
    category: 'test',
    intentFragment: null,
    suggestedProductArea: 'test',
    frequency: 1,
    customerImpact: 'medium',
    documentType: 'commercial_invoice',
    supplier: null,
    country: null,
    sourceCorrectionIds: [],
    governanceApprovedAt: '2026-05-25T00:00:00Z',
  };
}

describe('F-13 partitionApprovedSignals', () => {
  it('buckets unsupported_free_text_business_condition into unsupportedFreeText', () => {
    const out = partitionApprovedSignals([
      signal('a', 'unsupported_free_text_business_condition'),
    ]);
    expect(out.unsupportedFreeText.length).toBe(1);
    expect(out.recurringCorrections).toEqual([]);
    expect(out.other).toEqual([]);
  });

  it('buckets recurring_correction_pattern into recurringCorrections', () => {
    const out = partitionApprovedSignals([signal('a', 'recurring_correction_pattern')]);
    expect(out.recurringCorrections.length).toBe(1);
  });

  it('puts other signalType values into the other bucket', () => {
    const out = partitionApprovedSignals([
      signal('a', 'capability_gap_workaround_heavy'),
      signal('b', 'schema_field_ambiguity'),
      signal('c', 'extraction_regression'),
    ]);
    expect(out.other.length).toBe(3);
  });

  it('partitions a mixed set correctly', () => {
    const out = partitionApprovedSignals([
      signal('u1', 'unsupported_free_text_business_condition'),
      signal('r1', 'recurring_correction_pattern'),
      signal('u2', 'unsupported_free_text_business_condition'),
      signal('o1', 'capability_gap_workaround_heavy'),
    ]);
    expect(out.unsupportedFreeText.length).toBe(2);
    expect(out.recurringCorrections.length).toBe(1);
    expect(out.other.length).toBe(1);
  });

  it('EMPTY_INTERNAL_VIEW_MODEL is frozen and has the expected shape', () => {
    expect(Object.isFrozen(EMPTY_INTERNAL_VIEW_MODEL)).toBe(true);
    expect(EMPTY_INTERNAL_VIEW_MODEL.governanceQueue).toEqual([]);
    expect(EMPTY_INTERNAL_VIEW_MODEL.approvedSignals).toEqual([]);
    expect(EMPTY_INTERNAL_VIEW_MODEL.regressionSignals).toEqual([]);
    expect(EMPTY_INTERNAL_VIEW_MODEL.capabilityGaps).toEqual([]);
    expect(EMPTY_INTERNAL_VIEW_MODEL.corrections).toEqual([]);
  });
});
