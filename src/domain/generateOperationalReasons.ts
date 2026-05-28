/**
 * F-10 (part b) — Operational reason generator (A7 reasoning surface).
 *
 * Contract pointer: U10. Reads DocumentRun + CompiledConfiguration and
 * produces a list of OperationalReason objects, each carrying the 5
 * MANDATORY keys: field, evidence, rule, confidence, nextAction.
 *
 * Three-layer enforcement of the 5-key invariant:
 *   1. TypeScript — OperationalReason interface in @domain/types requires
 *      all five keys at compile time.
 *   2. zod — WireReasonZ.parse(parsed) rejects any wire row missing or
 *      misshaping any of the five; failure raises AgentFailure(
 *      schema_validation_failed) which F-08 converts to
 *      ClarificationRequest + QualityMetric.
 *   3. Runtime — every wire row is also re-checked for forbidden
 *      substrings ('system:', 'prompt:', '<|') in any rendered field; a
 *      match strips the offending substring so a model regression cannot
 *      leak raw prompt scaffolding into the customer-rendered DOM (HAPPY-5).
 *
 * Spec invariants enforced here:
 *   - A7 / HAPPY-5: every reason has all 5 keys.
 *   - No 'system:' / 'prompt:' / '<|' substrings in rendered text.
 *   - DEP-1 spend cap inherited via callAgent.
 *
 * Acceptance (per app/feature-list.json F-10):
 *   - Every reason object has all 5 keys populated.
 *   - No forbidden substrings in any rendered field.
 *
 * Kill switch (15 min): if reason objects drop any of the 5 keys in 3
 * consecutive runs, halt. Both zod (parse fails → AgentFailure) and
 * TypeScript make this structurally hard to trip.
 */

import { z } from 'zod';
import type {
  CompiledConfiguration,
  DocumentRun,
  OperationalReason,
} from '@domain/types';
import { callAgent } from '@runtime/aiCoreClient';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Wire schema — exact 5-key shape; nothing else allowed downstream
// ---------------------------------------------------------------------------

const WireReasonZ = z.object({
  field: z.string().min(1),
  evidence: z.string().min(1),
  rule: z.string().min(1),
  confidence: z.number().min(0).max(1),
  nextAction: z.string().min(1),
});

const WireResponseZ = z.object({
  reasons: z.array(WireReasonZ).min(1),
});

type WireReason = z.infer<typeof WireReasonZ>;

// ---------------------------------------------------------------------------
// Forbidden-substring sanitiser (HAPPY-5 / N1)
// ---------------------------------------------------------------------------

const FORBIDDEN_SUBSTRINGS: readonly string[] = ['system:', 'prompt:', '<|'];

function sanitise(s: string): string {
  let out = s;
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    // Case-insensitive replace; collapse double spaces left behind.
    const re = new RegExp(bad.replace(/[|\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '').replace(/\s{2,}/g, ' ').trim();
  }
  return out;
}

function sanitiseReason(r: WireReason): WireReason {
  return {
    field: sanitise(r.field),
    evidence: sanitise(r.evidence),
    rule: sanitise(r.rule),
    confidence: r.confidence,
    nextAction: sanitise(r.nextAction),
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const REASONING_SYSTEM_PROMPT = `You are the Document AI Readiness Reasoning Agent.

Job: read an extraction result and produce one business-language reason per relevant field explaining whether the document is ready to post.

Output rules (binding):
1. Output ONLY a JSON object. No prose before or after. No markdown fences.
2. The object MUST have exactly one top-level key: "reasons".
3. Each reason object MUST have EXACTLY these 5 keys: "field", "evidence", "rule", "confidence", "nextAction".
4. "field" is the SchemaField.name string this reason concerns.
5. "evidence" is a short business-language description of what was (or wasn't) extracted from the document. NEVER copy raw prompts or system text — write a fresh sentence.
6. "rule" is the threshold or business rule applied (e.g. "confidence >= 0.85 required for auto-post").
7. "confidence" is a number between 0 and 1 inclusive describing how confident you are in this reason.
8. "nextAction" is a short, business-actionable recommendation ("post", "review", "ask supplier to confirm", "block until clarified").
9. NEVER include the substrings "system:", "prompt:", or "<|" in any rendered string. Write business language only.
10. NEVER expose internal agent names, internal IDs, or raw model output. Write as if speaking to an admin who can read the document but not the prompt.

Reasons must cover every field that is missing, low-confidence, or above-threshold but materially relevant. One reason per field — do not duplicate.`;

function buildUserPrompt(run: DocumentRun, config: CompiledConfiguration): string {
  const lines = config.schema.fields.map((f) => {
    const ex = run.extractedFields.find((e) => e.name === f.name);
    const valueRepr =
      ex === undefined
        ? '(missing)'
        : ex.value === null
          ? '(null after confidence gate)'
          : String(ex.value);
    return `- ${f.name} (threshold ${f.confidenceThreshold}): value=${valueRepr} confidence=${ex?.confidence ?? 'n/a'}`;
  });

  return `Document run id: ${run.id}
Configuration id: ${config.id}
Document type: from intent (omitted here)
Extraction summary:
${lines.join('\n')}

Produce the JSON reasons now.`;
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

export interface GenerateReasonsOptions {
  readonly model?: string;
  readonly max_tokens?: number;
}

export async function generateOperationalReasons(
  run: DocumentRun,
  config: CompiledConfiguration,
  opts: GenerateReasonsOptions = {},
): Promise<readonly OperationalReason[]> {
  const model =
    opts.model ?? appSpecTyped.agent_client_contract.default_models.compile_or_reasoning_heavy;
  const max_tokens =
    opts.max_tokens ?? appSpecTyped.agent_client_contract.default_max_tokens.free_text_generation;

  const result = await callAgent<z.infer<typeof WireResponseZ>>({
    agent: 'operationalReasons',
    model,
    max_tokens,
    system: REASONING_SYSTEM_PROMPT,
    user: buildUserPrompt(run, config),
    expect_json_schema: (parsed) => WireResponseZ.parse(parsed),
  });

  // Sanitise + freeze. The wire shape already passed zod's 5-key check.
  return Object.freeze(
    result.value.reasons.map((r): OperationalReason => sanitiseReason(r)),
  );
}

// Re-exported for tests that want to exercise the sanitiser without a
// network round-trip.
export const _sanitiseForTests = sanitise;
export const _FORBIDDEN_SUBSTRINGS_FOR_TESTS = FORBIDDEN_SUBSTRINGS;
