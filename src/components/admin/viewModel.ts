/**
 * F-12 — Admin Control Plane view-model.
 *
 * Like F-11's CustomerViewModel, the admin screen consumes a single
 * AdminViewModel constructed by the orchestrator. v1 ships canned state
 * seeded via the route's initialViewModel prop.
 *
 * N2 / RED-1 enforcement at the projection layer:
 *   filterRecommendationsForAdminSurface() drops any AdminRecommendation
 *   where r.type === 'threshold_lower' (defensive — the type union already
 *   excludes it, and the F-15 agent has three layers of refusal; this is
 *   the fourth belt at the rendering boundary).
 *   It also drops any recommendation whose title or body matches
 *   /lower(ing)?\s+(the\s+)?threshold/i — same regex F-15 uses at runtime.
 *
 * No type-level narrowing equivalent to F-11's CustomerVisibleStatus exists
 * here because AdminRecommendationType already excludes 'threshold_lower';
 * the projection is purely belt-and-braces against natural-language
 * synonyms in title/body.
 */
import type {
  AdminRecommendation,
  CompiledConfiguration,
  CorrectionEvent,
  PromptVersion,
  SchemaField,
} from '@domain/types';

/**
 * The complete admin-surface state. Read-only for v1 — F-12 ships the
 * read surface; edits (create prompt version, adjust threshold, etc.)
 * are deferred to follow-on work or S4 OBSERVE.
 */
export interface AdminViewModel {
  readonly promptVersions: readonly PromptVersion[];
  /** Field-level thresholds shown as a visible TOOL — never as a recommendation. */
  readonly thresholdInspector: {
    readonly configuration: CompiledConfiguration | null;
    /** Operator-staged threshold overrides (display-only in v1). */
    readonly stagedOverrides: readonly { field: string; staged: number }[];
  };
  /** Auto-confirm criteria — paired with thresholdInspector; v1 read-only. */
  readonly autoConfirmCriteria: readonly { readonly field: string; readonly criterion: string }[];
  /** Schema quality monitoring — basic per-field health snapshot. */
  readonly schemaQuality: readonly {
    readonly field: SchemaField['name'];
    readonly recentSuccessRate: number; // 0..1
    readonly recentCorrectionCount: number;
  }[];
  /** Correction trend — last N corrections, freshest first. */
  readonly correctionTrend: readonly CorrectionEvent[];
  /** Recommendation queue — already projected (no threshold_lower slip-through). */
  readonly recommendations: readonly AdminRecommendation[];
}

// The forbidden phrase regex — matches "lower threshold", "lowering threshold",
// "lower the threshold", "lowering the threshold". Case-insensitive.
const LOWER_THRESHOLD_RE = /lower(ing)?\s+(the\s+)?threshold/i;

export function filterRecommendationsForAdminSurface(
  recs: readonly AdminRecommendation[],
): readonly AdminRecommendation[] {
  return recs.filter((r) => {
    // (1) the TS union excludes 'threshold_lower', so this branch is for
    // defensive runtime checks against an as-cast or a JSON load.
    if (String(r.type) === 'threshold_lower') return false;
    // (2) synonym leak in rendered text.
    if (LOWER_THRESHOLD_RE.test(r.title)) return false;
    if (LOWER_THRESHOLD_RE.test(r.body)) return false;
    return true;
  });
}

export const EMPTY_ADMIN_VIEW_MODEL: AdminViewModel = Object.freeze({
  promptVersions: [],
  thresholdInspector: { configuration: null, stagedOverrides: [] },
  autoConfirmCriteria: [],
  schemaQuality: [],
  correctionTrend: [],
  recommendations: [],
});

export const _LOWER_THRESHOLD_RE_FOR_TESTS = LOWER_THRESHOLD_RE;
