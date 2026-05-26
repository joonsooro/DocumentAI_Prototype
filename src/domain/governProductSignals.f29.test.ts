/**
 * F-29 — governProductSignals second-input-stream (provisional signals)
 * tests.
 *
 * Acceptance:
 *   - 1-element provisional cluster does NOT auto-promote in v1 demo
 *     (OQ-2 min_frequency=3 prevents this — regression guard on A6/N5).
 *   - Cluster crossing all 3 OQ-2 thresholds promotes to a single
 *     governance_approved signal with provenance='governance_promotion'.
 *   - The existing CorrectionEvent input stream is unchanged — passing
 *     provisional signals as the second arg does not affect the
 *     correction-driven approval path.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { governProductSignals } from './governProductSignals';
import {
  getProductSignals,
  _resetCorrectionStoreForTests,
} from './submitCorrection';
import type { ProductSignal } from '@domain/types';

const provisional = (overrides: Partial<ProductSignal> & Pick<ProductSignal, 'id'>): ProductSignal => ({
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial invoice / integration request',
  intentFragment: 'Can you fill these fields in S/4 HANA?',
  suggestedProductArea: 'integration_capability',
  frequency: 1,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: 'DAEJOO',
  country: null,
  sourceCorrectionIds: [],
  governanceApprovedAt: null,
  status: 'provisional',
  provenance: 'conversational_notify_team',
  ...overrides,
});

describe('F-29 governProductSignals — provisional second input stream', () => {
  beforeEach(() => {
    _resetCorrectionStoreForTests();
  });

  it('v1 demo: 1-element provisional cluster does NOT auto-graduate (kill switch)', () => {
    expect(getProductSignals().length).toBe(0);
    const result = governProductSignals([], [provisional({ id: 'ps::prov::1' })], {
      nowIso: '2026-05-26T19:30:00Z',
    });
    expect(result.newlyApproved.length).toBe(0);
    expect(getProductSignals().filter((s) => s.status === 'governance_approved').length).toBe(0);
    // Decision log carries the rejected verdict + reason
    const f29Entry = result.log.find((e) => e.candidateKey.startsWith('f29-cluster::'));
    expect(f29Entry).toBeTruthy();
    expect(f29Entry?.approved).toBe(false);
    expect(f29Entry?.reason).toContain('frequency=1<3');
  });

  it('does NOT promote a 2-element cluster from the SAME supplier (distinct_suppliers fails)', () => {
    const result = governProductSignals(
      [],
      [
        provisional({ id: 'ps::prov::1', supplier: 'DAEJOO' }),
        provisional({ id: 'ps::prov::2', supplier: 'DAEJOO' }),
      ],
      { nowIso: '2026-05-26T19:30:00Z' },
    );
    // Frequency 2 still fails min_frequency=3 first; assertion: not approved.
    expect(result.newlyApproved.length).toBe(0);
  });

  it('PROMOTES a 3-element cluster across 2 suppliers with medium impact', () => {
    const result = governProductSignals(
      [],
      [
        provisional({ id: 'ps::prov::1', supplier: 'DAEJOO' }),
        provisional({ id: 'ps::prov::2', supplier: 'AMAZON' }),
        provisional({ id: 'ps::prov::3', supplier: 'AMAZON' }),
      ],
      { nowIso: '2026-05-26T19:30:00Z' },
    );
    expect(result.newlyApproved.length).toBe(1);
    const promoted = result.newlyApproved[0];
    expect(promoted.status).toBe('governance_approved');
    expect(promoted.provenance).toBe('governance_promotion');
    expect(promoted.frequency).toBe(3);
    expect(promoted.governanceApprovedAt).toBe('2026-05-26T19:30:00Z');
    // Surfaced to the store
    expect(getProductSignals().some((s) => s.id === promoted.id)).toBe(true);
  });

  it('does NOT promote when all clustered signals carry forbidden customerImpact=low', () => {
    const result = governProductSignals(
      [],
      [
        provisional({ id: 'ps::prov::1', supplier: 'DAEJOO', customerImpact: 'low' }),
        provisional({ id: 'ps::prov::2', supplier: 'AMAZON', customerImpact: 'low' }),
        provisional({ id: 'ps::prov::3', supplier: 'HYOSUNG', customerImpact: 'low' }),
      ],
      { nowIso: '2026-05-26T19:30:00Z' },
    );
    expect(result.newlyApproved.length).toBe(0);
    const f29Entry = result.log.find((e) => e.candidateKey.startsWith('f29-cluster::'));
    expect(f29Entry?.reason).toContain('impact=low');
  });

  it('preserves the existing CorrectionEvent path — no provisional arg works exactly like before', () => {
    // Backward-compatible call signature: governProductSignals(corrections, opts)
    const result = governProductSignals([], { nowIso: '2026-05-26T19:30:00Z' });
    expect(result.newlyApproved.length).toBe(0);
    expect(result.log.length).toBe(0);
  });

  it('clusters by (signalType, intentFragmentClassHash) — different intent fragments stay separate', () => {
    const result = governProductSignals(
      [],
      [
        provisional({
          id: 'ps::a::1',
          intentFragment: 'Can you fill fields in S/4 HANA?',
          supplier: 'DAEJOO',
        }),
        provisional({
          id: 'ps::a::2',
          intentFragment: 'Can you fill fields in S/4 HANA?',
          supplier: 'AMAZON',
        }),
        provisional({
          id: 'ps::b::1',
          intentFragment: 'Process delivery notes too',
          supplier: 'DAEJOO',
        }),
        provisional({
          id: 'ps::b::2',
          intentFragment: 'Process delivery notes too',
          supplier: 'AMAZON',
        }),
      ],
      { nowIso: '2026-05-26T19:30:00Z' },
    );
    // Two clusters, neither crosses min_frequency=3 — both rejected.
    expect(result.newlyApproved.length).toBe(0);
    const f29Entries = result.log.filter((e) => e.candidateKey.startsWith('f29-cluster::'));
    expect(f29Entries.length).toBe(2);
  });
});
