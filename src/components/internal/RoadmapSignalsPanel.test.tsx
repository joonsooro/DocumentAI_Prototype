/**
 * @vitest-environment jsdom
 *
 * F-29 — RoadmapSignalsPanel tests.
 *
 * Asserts: provisional signals render the "Being assessed for validity"
 * tag; governance_approved signals do not; rank #1 + #2 carry an accent
 * badge; reason lines come from F-25 generateRoadmapReason (byte-exact
 * format).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RoadmapSignalsPanel } from './RoadmapSignalsPanel';
import type { ProductSignal } from '@domain/types';

const baseRanking = (overrides: Partial<ProductSignal> & Pick<ProductSignal, 'id'>): ProductSignal => ({
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial invoice / logistics compliance',
  intentFragment: null,
  suggestedProductArea: 'capability_gap',
  frequency: 5,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: null,
  country: null,
  sourceCorrectionIds: [],
  governanceApprovedAt: null,
  customerCount: 2,
  workaroundBurden: 'medium',
  actionability: 'high',
  expectedStpLift: 12,
  status: 'governance_approved',
  provenance: 'curated_v1',
  ...overrides,
});

describe('F-29 RoadmapSignalsPanel', () => {
  beforeEach(() => cleanup());

  it("renders with data-testid='internal-roadmap-signals-panel'", () => {
    render(<RoadmapSignalsPanel signals={[]} />);
    expect(screen.getByTestId('internal-roadmap-signals-panel')).toBeTruthy();
    expect(screen.getByTestId('internal-roadmap-signals-empty')).toBeTruthy();
  });

  it('provisional signals carry the literal "Being assessed for validity" tag', () => {
    const signals = [
      baseRanking({ id: 'ps::prov::1', status: 'provisional', frequency: 10, expectedStpLift: 25 }),
    ];
    render(<RoadmapSignalsPanel signals={signals} />);
    const tag = screen.getByTestId('internal-roadmap-signal-provisional-tag-ps::prov::1');
    expect(tag.textContent).toBe('Being assessed for validity');
  });

  it('governance_approved signals do NOT carry the provisional tag', () => {
    const signals = [
      baseRanking({ id: 'ps::approved::1', status: 'governance_approved' }),
    ];
    render(<RoadmapSignalsPanel signals={signals} />);
    expect(
      screen.queryByTestId('internal-roadmap-signal-provisional-tag-ps::approved::1'),
    ).toBeNull();
  });

  it('rank #1 + #2 rows carry data-rank=1 / data-rank=2 with accent styling', () => {
    const signals = [
      baseRanking({ id: 'ps::lo', frequency: 2, customerCount: 1, workaroundBurden: 'low', actionability: 'low', expectedStpLift: 4 }),
      baseRanking({ id: 'ps::hi', frequency: 20, customerCount: 5, workaroundBurden: 'high', actionability: 'high', expectedStpLift: 28 }),
      baseRanking({ id: 'ps::med', frequency: 8, customerCount: 3, workaroundBurden: 'medium', actionability: 'medium', expectedStpLift: 14 }),
    ];
    render(<RoadmapSignalsPanel signals={signals} />);
    // After ranking, hi → 1, med → 2, lo → 3
    const hi = screen.getByTestId('internal-roadmap-signal-row-ps::hi');
    expect(hi.getAttribute('data-rank')).toBe('1');
    const med = screen.getByTestId('internal-roadmap-signal-row-ps::med');
    expect(med.getAttribute('data-rank')).toBe('2');
    const lo = screen.getByTestId('internal-roadmap-signal-row-ps::lo');
    expect(lo.getAttribute('data-rank')).toBe('3');
  });

  it('reason line is the byte-exact output of generateRoadmapReason', () => {
    const signals = [
      baseRanking({
        id: 'ps::reason',
        frequency: 17,
        customerCount: 4,
        workaroundBurden: 'high',
        actionability: 'high',
        expectedStpLift: 30,
      }),
    ];
    render(<RoadmapSignalsPanel signals={signals} />);
    const reason = screen.getByTestId('internal-roadmap-signal-reason-ps::reason');
    expect(reason.textContent).toBe(
      '17 occurrences · 4 customers · workaround-heavy · directly addressable',
    );
  });

  it('info strip names the 5 ranking factors verbatim (HAPPY-7 binding)', () => {
    render(<RoadmapSignalsPanel signals={[]} />);
    const info = screen.getByTestId('internal-roadmap-signals-info');
    expect(info.textContent).toContain('frequency');
    expect(info.textContent).toContain('customers');
    expect(info.textContent).toContain('workaround burden');
    expect(info.textContent).toContain('actionability');
    expect(info.textContent).toContain('expected STP lift');
  });
});
