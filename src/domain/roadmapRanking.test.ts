/**
 * F-25 — Roadmap-ranking module tests.
 *
 * Three byte-exact eval bindings:
 *   - HAPPY-7: computeRoadmapScore({17, 4, high, high, 30}) === 91
 *   - HAPPY-8: rankRoadmapEvidence(4-row design-handoff fixture) keeps order
 *   - HAPPY-9: generateRoadmapReason(HAPPY-7 fixture) === verbatim string
 *
 * Each binding runs 10 sequential invocations to prove determinism
 * (no Date(), no Math.random(), no clock).
 */
import { describe, expect, it } from 'vitest';
import type { ProductSignal } from '@domain/types';
import {
  computeRoadmapScore,
  rankRoadmapEvidence,
  generateRoadmapReason,
  type RoadmapRankingInput,
} from './roadmapRanking';

const baseSignal = (overrides: Partial<ProductSignal> = {}): ProductSignal => ({
  id: 'ps::test::1',
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial invoice / logistics compliance',
  intentFragment: null,
  suggestedProductArea: 'capability_gap',
  frequency: 1,
  customerImpact: 'medium',
  documentType: 'commercial_invoice',
  supplier: null,
  country: null,
  sourceCorrectionIds: [],
  governanceApprovedAt: null,
  ...overrides,
});

const rankingInput = (
  overrides: Partial<RoadmapRankingInput> & {
    customerCount: number;
    workaroundBurden: RoadmapRankingInput['workaroundBurden'];
    actionability: RoadmapRankingInput['actionability'];
    expectedStpLift: number;
  },
): RoadmapRankingInput => ({
  ...baseSignal(overrides),
  customerCount: overrides.customerCount,
  workaroundBurden: overrides.workaroundBurden,
  actionability: overrides.actionability,
  expectedStpLift: overrides.expectedStpLift,
});

describe('F-25 computeRoadmapScore — HAPPY-7 deterministic 91', () => {
  it('returns exactly 91 for the locked HAPPY-7 fixture across 10 invocations', () => {
    const s = rankingInput({
      id: 'ps::happy7',
      frequency: 17,
      customerCount: 4,
      workaroundBurden: 'high',
      actionability: 'high',
      expectedStpLift: 30,
    });
    for (let i = 0; i < 10; i++) {
      expect(computeRoadmapScore(s)).toBe(91);
    }
  });

  it('clamps to [0, 100]', () => {
    const min = rankingInput({
      id: 'ps::zero',
      frequency: 0,
      customerCount: 0,
      workaroundBurden: 'none',
      actionability: 'low',
      expectedStpLift: 0,
    });
    const max = rankingInput({
      id: 'ps::max',
      frequency: 1000,
      customerCount: 1000,
      workaroundBurden: 'high',
      actionability: 'high',
      expectedStpLift: 1000,
    });
    const minScore = computeRoadmapScore(min);
    const maxScore = computeRoadmapScore(max);
    expect(minScore).toBeGreaterThanOrEqual(0);
    expect(minScore).toBeLessThanOrEqual(100);
    expect(maxScore).toBe(100);
  });
});

describe('F-25 rankRoadmapEvidence — HAPPY-8 4-row design-handoff ordering', () => {
  /**
   * Design-handoff Roadmap rows in stated order:
   *   #1 free-text obligation     (very high frequency + customers + heavy workaround)
   *   #2 commercial-value handling (high freq + customers + workaround)
   *   #3 supplier-pinned prompt    (medium freq, narrower customers)
   *   #4 net-days normalization    (lower freq, light workaround)
   * The 4 fixtures below assign frequency/customer/workaround/actionability/STP-lift
   * so the score-then-tie-break order matches.
   */
  const signals: readonly RoadmapRankingInput[] = [
    rankingInput({
      id: 'ps::roadmap::1::free-text-obligation',
      frequency: 24,
      customerCount: 6,
      workaroundBurden: 'high',
      actionability: 'high',
      expectedStpLift: 30,
    }),
    rankingInput({
      id: 'ps::roadmap::2::commercial-value',
      frequency: 12,
      customerCount: 4,
      workaroundBurden: 'high',
      actionability: 'high',
      expectedStpLift: 22,
    }),
    rankingInput({
      id: 'ps::roadmap::3::supplier-pinned',
      frequency: 7,
      customerCount: 3,
      workaroundBurden: 'medium',
      actionability: 'medium',
      expectedStpLift: 12,
    }),
    rankingInput({
      id: 'ps::roadmap::4::net-days',
      frequency: 4,
      customerCount: 2,
      workaroundBurden: 'low',
      actionability: 'medium',
      expectedStpLift: 8,
    }),
  ];
  const expectedOrder = [
    'ps::roadmap::1::free-text-obligation',
    'ps::roadmap::2::commercial-value',
    'ps::roadmap::3::supplier-pinned',
    'ps::roadmap::4::net-days',
  ];

  it('returns the design-handoff order across 10 invocations', () => {
    for (let i = 0; i < 10; i++) {
      const ranked = rankRoadmapEvidence(signals);
      expect(ranked.map((s) => s.id)).toEqual(expectedOrder);
    }
  });

  it('tie-break: equal score → higher frequency wins', () => {
    const a = rankingInput({
      id: 'b::lex-later',
      frequency: 10,
      customerCount: 3,
      workaroundBurden: 'medium',
      actionability: 'medium',
      expectedStpLift: 15,
    });
    const b = rankingInput({
      id: 'a::lex-earlier',
      frequency: 5,
      customerCount: 3,
      workaroundBurden: 'medium',
      actionability: 'medium',
      expectedStpLift: 15,
    });
    // 'a' has higher frequency → ranks first even though id is lex-later.
    const ranked = rankRoadmapEvidence([b, a]);
    expect(ranked.map((s) => s.id)).toEqual(['b::lex-later', 'a::lex-earlier']);
  });

  it('tie-break: equal score & equal frequency → lex-earlier id wins', () => {
    const a = rankingInput({
      id: 'a::lex-earlier',
      frequency: 5,
      customerCount: 3,
      workaroundBurden: 'medium',
      actionability: 'medium',
      expectedStpLift: 15,
    });
    const b = rankingInput({
      id: 'b::lex-later',
      frequency: 5,
      customerCount: 3,
      workaroundBurden: 'medium',
      actionability: 'medium',
      expectedStpLift: 15,
    });
    const ranked = rankRoadmapEvidence([b, a]);
    expect(ranked.map((s) => s.id)).toEqual(['a::lex-earlier', 'b::lex-later']);
  });
});

describe('F-25 generateRoadmapReason — HAPPY-9 byte-exact string', () => {
  it('returns the verbatim HAPPY-9 string for the locked fixture across 10 invocations', () => {
    const s = rankingInput({
      id: 'ps::happy9',
      frequency: 17,
      customerCount: 4,
      workaroundBurden: 'high',
      actionability: 'high',
      expectedStpLift: 30,
    });
    const expected = '17 occurrences · 4 customers · workaround-heavy · directly addressable';
    for (let i = 0; i < 10; i++) {
      expect(generateRoadmapReason(s)).toBe(expected);
    }
  });

  it('omits the workaround part when workaroundBurden is none', () => {
    const s = rankingInput({
      id: 'ps::reason::none',
      frequency: 3,
      customerCount: 1,
      workaroundBurden: 'none',
      actionability: 'medium',
      expectedStpLift: 0,
    });
    expect(generateRoadmapReason(s)).toBe('3 occurrences · 1 customers · partially addressable');
  });

  it('renders medium / low / high workaround tags correctly', () => {
    const medium = generateRoadmapReason(
      rankingInput({
        id: 'ps::reason::medium',
        frequency: 5,
        customerCount: 2,
        workaroundBurden: 'medium',
        actionability: 'high',
        expectedStpLift: 0,
      }),
    );
    expect(medium).toBe('5 occurrences · 2 customers · governance-blocked workaround · directly addressable');
    const low = generateRoadmapReason(
      rankingInput({
        id: 'ps::reason::low',
        frequency: 5,
        customerCount: 2,
        workaroundBurden: 'low',
        actionability: 'low',
        expectedStpLift: 0,
      }),
    );
    expect(low).toBe('5 occurrences · 2 customers · has-workaround · investigation needed');
  });
});
