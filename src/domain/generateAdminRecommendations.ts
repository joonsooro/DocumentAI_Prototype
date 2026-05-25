/**
 * F-15 — Admin recommendations agent.
 *
 * Contract pointer: U13. Reads correction history and produces schema /
 * prompt / instruction recommendations the admin can review on the
 * Admin Control Plane. The recommendation type CANNOT be 'threshold_lower'
 * (RED-1 / N2 — never recommend lowering a confidence threshold as the
 * customer-demo action).
 *
 * THREE-layer N2 enforcement:
 *   1. TypeScript — AdminRecommendationType union in @domain/types
 *      DELIBERATELY excludes 'threshold_lower'; the type system rejects
 *      r.type === 'threshold_lower' at compile time.
 *   2. zod — RecommendationTypeZ is the runtime mirror of the TS union,
 *      so a model returning type: 'threshold_lower' fails parse →
 *      AgentFailure(schema_validation_failed) → F-08 surfaces a
 *      ClarificationRequest + QualityMetric.
 *   3. Runtime body scan — every rendered text field is scanned for the
 *      /lower(ing)?\s+threshold/i regex; matches throw before the
 *      recommendation can leave the function (the ESLint rule on THIS
 *      file already forbids the literal at lint time, but a model could
 *      still produce the phrase dynamically — this is the third belt).
 *
 * Failure routing: F-15 returns recommendations directly (not wrapped in
 * a RunAgentOutcome). Callers wanting F-08 routing can compose this with
 * runAgentWithFailureSurface. The agent thrown failures propagate up so
 * the caller can decide whether to surface or retry — F-15 itself does
 * not silently emit a canned fallback (N4).
 *
 * Acceptance (per app/feature-list.json F-15):
 *   - Every recommendation has r.type !== 'threshold_lower'.
 *   - text does not match /lower(ing)?\s+threshold/i.
 *
 * Kill switch (15 min): if threshold_lower appears in any recommendation
 * across 5 runs, halt. Structurally impossible via the TS+zod layers;
 * the third belt catches synonym leakage.
 */

import { z } from 'zod';
import type {
  AdminRecommendation,
  AdminRecommendationType,
  CorrectionEvent,
} from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Wire schema — exact mirror of AdminRecommendationType + the rendered shape
// ---------------------------------------------------------------------------

const RecommendationTypeZ: z.ZodType<AdminRecommendationType> = z.enum([
  'add_field_instruction',
  'add_schema_field',
  'add_validation_rule',
  'add_regex_pattern',
  'create_supplier_prompt_version',
  'add_reusable_rule',
]);
// NOTE: 'threshold_lower' is deliberately NOT in the union. zod rejects it.

const ScopeZ = z.enum(['this_document', 'this_supplier', 'all_suppliers']);

const WireRecommendationZ = z.object({
  type: RecommendationTypeZ,
  title: z.string().min(1),
  body: z.string().min(1),
  scope: ScopeZ,
  sourceCorrectionIds: z.array(z.string()),
});

const WireResponseZ = z.object({
  recommendations: z.array(WireRecommendationZ).min(0),
});

type WireRecommendation = z.infer<typeof WireRecommendationZ>;

// ---------------------------------------------------------------------------
// Runtime third-belt: the forbidden "lower threshold" phrase, case-insensitive
//
// The ESLint rule scoped to THIS file forbids the LITERAL at lint time, but
// the model can produce the phrase dynamically — so this regex also runs at
// runtime and rejects the recommendation entirely (we do not auto-rewrite —
// N4 forbids canned substitutions).
// ---------------------------------------------------------------------------

// Matches "lower threshold", "lowering threshold", "lower the threshold",
// "lowering the threshold" — case-insensitive. Articles between the verb
// and the noun are allowed; word-order matters (we don't match
// "threshold lowering").
const LOWER_THRESHOLD_RE = /lower(ing)?\s+(the\s+)?threshold/i;

function containsForbiddenPhrase(rec: WireRecommendation): boolean {
  return LOWER_THRESHOLD_RE.test(rec.title) || LOWER_THRESHOLD_RE.test(rec.body);
}

// ---------------------------------------------------------------------------
// Prompt — short, schema-constrained, negative-contract explicit
// ---------------------------------------------------------------------------

const ADMIN_REC_SYSTEM_PROMPT = `You are the Document AI Admin Recommendations Agent.

Job: read a list of CorrectionEvents (operator-supplied field corrections) and produce admin-grade recommendations for improving extraction quality.

Output rules (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object MUST have exactly one top-level key: "recommendations".
3. Each recommendation MUST have keys: "type", "title", "body", "scope", "sourceCorrectionIds".
4. "type" MUST be EXACTLY one of:
   - "add_field_instruction"
   - "add_schema_field"
   - "add_validation_rule"
   - "add_regex_pattern"
   - "create_supplier_prompt_version"
   - "add_reusable_rule"
5. "scope" MUST be one of: "this_document", "this_supplier", "all_suppliers".
6. NEVER recommend lowering a confidence threshold. The string "lower threshold" (or any conjugation) is forbidden in title and body. Threshold management is a tool the admin can use on the Admin Control Plane; it is NEVER a demo recommendation.
7. NEVER suggest "threshold_lower" as a recommendation type. The type value is not in the allowed list.
8. Each recommendation MUST cite the CorrectionEvent IDs that motivated it in sourceCorrectionIds.
9. If the corrections do not justify any new recommendation, return { "recommendations": [] }.`;

function buildUserPrompt(corrections: readonly CorrectionEvent[]): string {
  if (corrections.length === 0) {
    return 'There are no corrections to analyse. Return { "recommendations": [] }.';
  }
  const lines = corrections.map(
    (c) =>
      `- id=${c.id} field=${c.field} oldValue=${JSON.stringify(c.oldValue)} newValue=${JSON.stringify(c.newValue)} supplier=${c.governance.supplier ?? 'unknown'} documentType=${c.governance.documentType}`,
  );
  return `Correction history (${corrections.length} events):
${lines.join('\n')}

Produce JSON recommendations now.`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const appSpecTyped = appSpec as {
  agent_client_contract: {
    default_models: { compile_or_reasoning_heavy: string; smallest_viable: string };
    default_max_tokens: { extraction_or_classification: number; free_text_generation: number };
  };
};

export interface GenerateAdminRecsOptions {
  readonly model?: string;
  readonly max_tokens?: number;
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
}

export async function generateAdminRecommendations(
  corrections: readonly CorrectionEvent[],
  opts: GenerateAdminRecsOptions = {},
): Promise<readonly AdminRecommendation[]> {
  const model =
    opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens =
    opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const result = await callAgent<z.infer<typeof WireResponseZ>>({
    agent: 'admin.recommend',
    model,
    max_tokens,
    system: ADMIN_REC_SYSTEM_PROMPT,
    user: buildUserPrompt(corrections),
    expect_json_schema: (parsed) => WireResponseZ.parse(parsed),
  });

  // Third-belt runtime scan. zod already rejected type='threshold_lower';
  // here we catch the natural-language synonym in title/body.
  for (const rec of result.value.recommendations) {
    if (containsForbiddenPhrase(rec)) {
      throw new Error(
        `F-15 N2 invariant violated at runtime: recommendation (type=${rec.type}) contained a forbidden 'lower threshold' phrase. Title="${rec.title}" body="${rec.body.slice(0, 80)}…"`,
      );
    }
  }

  return Object.freeze(
    result.value.recommendations.map((rec, idx): AdminRecommendation => ({
      id: `rec::${rec.type}::${idx}::${nowIso}`,
      type: rec.type,
      title: rec.title,
      body: rec.body,
      scope: rec.scope,
      sourceCorrectionIds: rec.sourceCorrectionIds,
      proposedAt: nowIso,
    })),
  );
}

// Re-exports for tests
export const _LOWER_THRESHOLD_RE_FOR_TESTS = LOWER_THRESHOLD_RE;
