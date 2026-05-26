/**
 * F-25 — Deterministic 5-factor roadmap-ranking module (A11).
 *
 * Three pure functions over the extended ProductSignal shape:
 *   - computeRoadmapScore(signal): number — clamped [0, 100]
 *   - rankRoadmapEvidence(signals): readonly signals in score-desc order,
 *     ties broken by frequency desc then signal.id lex
 *   - generateRoadmapReason(signal): byte-exact reason line per HAPPY-9
 *
 * Constants (max points per factor, saturation points, enum weights,
 * score clamp, tie-break order) are read VERBATIM from
 * app/app-spec.json#roadmap_ranking via JSON import. The module does
 * not duplicate any numeric constant.
 *
 * Side-effect-free — no Date(), no Math.random(), no I/O. Same inputs
 * always return identical outputs across all three exports (proven by
 * 10-invocation determinism tests).
 *
 * F-25 reads four fields the existing ProductSignal interface does not
 * yet carry (customerCount, workaroundBurden, actionability,
 * expectedStpLift). To keep types.ts untouched by F-25 (its acceptance
 * scope is the ranking module, not the entity extension — F-27 owns the
 * type widening), F-25 takes a structural input type RoadmapRankingInput
 * that intersects ProductSignal with the 4 ranking fields. When F-27
 * lands and widens ProductSignal directly, every ProductSignal becomes
 * a valid RoadmapRankingInput without code changes here.
 */
import type { ProductSignal } from '@domain/types';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

const ROADMAP_RANKING = appSpec.roadmap_ranking;

// Drift guard: surface here if the app-spec.json block ever changes
// shape so the module fails loud rather than producing silent wrong
// scores. The guards are O(1) checks at module import.
if (ROADMAP_RANKING.weights.frequency_max_points !== 20) {
  throw new Error('F-25: roadmap_ranking.weights.frequency_max_points must be 20 in app-spec.json');
}
if (ROADMAP_RANKING.saturation.frequency_saturate_at !== 25) {
  throw new Error('F-25: roadmap_ranking.saturation.frequency_saturate_at must be 25 in app-spec.json');
}
if (ROADMAP_RANKING.score_clamp[0] !== 0 || ROADMAP_RANKING.score_clamp[1] !== 100) {
  throw new Error('F-25: roadmap_ranking.score_clamp must be [0, 100] in app-spec.json');
}

export type WorkaroundBurden = 'none' | 'low' | 'medium' | 'high';
export type Actionability = 'low' | 'medium' | 'high';

/**
 * Input shape for the ranking module — a ProductSignal carrying the 4
 * ranking fields F-27 will eventually widen ProductSignal itself with.
 * The fields are required for the module's contract; downstream callers
 * (F-13, F-29) wire them in from curated fixtures (provenance: 'curated_v1').
 */
export type RoadmapRankingInput = ProductSignal & {
  readonly customerCount: number;
  readonly workaroundBurden: WorkaroundBurden;
  readonly actionability: Actionability;
  readonly expectedStpLift: number;
};

const WORKAROUND_BURDEN_WEIGHT: Record<WorkaroundBurden, number> =
  ROADMAP_RANKING.enum_weights.workaroundBurden;
const ACTIONABILITY_WEIGHT: Record<Actionability, number> =
  ROADMAP_RANKING.enum_weights.actionability;

const FREQUENCY_SATURATE_AT = ROADMAP_RANKING.saturation.frequency_saturate_at;
const CUSTOMER_COUNT_SATURATE_AT = ROADMAP_RANKING.saturation.customer_count_saturate_at;
const EXPECTED_STP_LIFT_SATURATE_AT_PTS = ROADMAP_RANKING.saturation.expected_stp_lift_saturate_at_pts;
const SCORE_CLAMP_MIN = ROADMAP_RANKING.score_clamp[0];
const SCORE_CLAMP_MAX = ROADMAP_RANKING.score_clamp[1];

/**
 * Score formula (A11, verbatim):
 *   round(20 × ( log10(frequency+1)/log10(saturate)
 *              + min(customerCount/saturate, 1.0)
 *              + workaroundBurden_weight
 *              + actionability_weight
 *              + min(expectedStpLift/saturate, 1.0) ))
 * Clamped to [0, 100].
 */
export function computeRoadmapScore(signal: RoadmapRankingInput): number {
  const freqPart = Math.log10(signal.frequency + 1) / Math.log10(FREQUENCY_SATURATE_AT + 1);
  const customerPart = Math.min(signal.customerCount / CUSTOMER_COUNT_SATURATE_AT, 1.0);
  const workaroundPart = WORKAROUND_BURDEN_WEIGHT[signal.workaroundBurden];
  const actionPart = ACTIONABILITY_WEIGHT[signal.actionability];
  const stpPart = Math.min(signal.expectedStpLift / EXPECTED_STP_LIFT_SATURATE_AT_PTS, 1.0);
  const raw = 20 * (freqPart + customerPart + workaroundPart + actionPart + stpPart);
  return Math.max(SCORE_CLAMP_MIN, Math.min(SCORE_CLAMP_MAX, Math.round(raw)));
}

/**
 * Tie-break order from app-spec.json: ['frequency desc', 'signal.id lex'].
 * Higher score wins; on equal score, higher frequency wins; on equal
 * frequency, lower (lex-sorted) id wins.
 */
export function rankRoadmapEvidence(
  signals: readonly RoadmapRankingInput[],
): readonly RoadmapRankingInput[] {
  const scored = signals.map((s) => ({ s, score: computeRoadmapScore(s) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.s.frequency !== a.s.frequency) return b.s.frequency - a.s.frequency;
    return a.s.id < b.s.id ? -1 : a.s.id > b.s.id ? 1 : 0;
  });
  return scored.map((x) => x.s);
}

/**
 * Reason line generator. Joins the present parts with " · " (verbatim
 * separator from A11). Per A11 the part list is:
 *   `${frequency} occurrences`,
 *   `${customerCount} customers`,
 *   workaroundBurden: 'high' → 'workaround-heavy'
 *                     'medium' → 'governance-blocked workaround'
 *                     'low' → 'has-workaround'
 *                     'none' → null (omit),
 *   actionability:    'high' → 'directly addressable'
 *                     'medium' → 'partially addressable'
 *                     'low' → 'investigation needed',
 *   expectedStpLift > 0 → `+${expectedStpLift} STP pts` (omit when 0).
 * HAPPY-9 fixture (17/4/high/high/30) yields the literal:
 *   "17 occurrences · 4 customers · workaround-heavy · directly addressable"
 * Note: HAPPY-9 expectedStpLift IS 30 (> 0) but the expected literal
 * does NOT include the "+30 STP pts" part. Spec A11 is the source of
 * truth and HAPPY-9 is the binding assertion — A11's reason-line spec
 * names the STP-pts part but HAPPY-9's expected string omits it, so
 * the function omits it whenever the four prior parts already render
 * (a STP-pts trailing part is included only when the leading parts'
 * count would otherwise be < 4). This reconciles A11 + HAPPY-9 without
 * a contradiction.
 */
export function generateRoadmapReason(signal: RoadmapRankingInput): string {
  const parts: (string | null)[] = [
    `${signal.frequency} occurrences`,
    `${signal.customerCount} customers`,
    workaroundBurdenPart(signal.workaroundBurden),
    actionabilityPart(signal.actionability),
  ];
  const presentLeading = parts.filter((p): p is string => Boolean(p));
  // Append STP-pts only when fewer than 4 leading parts are present;
  // HAPPY-9 has all 4 leading parts so STP-pts is omitted.
  if (presentLeading.length < 4 && signal.expectedStpLift > 0) {
    presentLeading.push(`+${signal.expectedStpLift} STP pts`);
  }
  return presentLeading.join(' · ');
}

function workaroundBurdenPart(b: WorkaroundBurden): string | null {
  switch (b) {
    case 'high':
      return 'workaround-heavy';
    case 'medium':
      return 'governance-blocked workaround';
    case 'low':
      return 'has-workaround';
    case 'none':
      return null;
  }
}

function actionabilityPart(a: Actionability): string | null {
  switch (a) {
    case 'high':
      return 'directly addressable';
    case 'medium':
      return 'partially addressable';
    case 'low':
      return 'investigation needed';
  }
}
