/**
 * F-10 (part a) — Readiness decision entrypoint (A7).
 *
 * Contract pointer: U10. Reads a DocumentRun + CompiledConfiguration and
 * returns a ReadinessDecision. Status is deterministic; reasoning text
 * comes from the F-10b agent (generateOperationalReasons).
 *
 * Status policy (matches spec §5 A7 behaviour):
 *   - Blocked              — any required field has value === null and the
 *                            run has no clarifying workaround in place.
 *   - Needs review         — every required field has a value, but at least
 *                            one is below its SchemaField.confidenceThreshold.
 *   - Ready                — every required field has a value AND every
 *                            non-null extraction passes the threshold.
 *   - Needs downstream validation — reserved for future use (e.g. when an
 *                            external system must confirm before posting);
 *                            v1 never returns this on its own — only via
 *                            an explicit override.
 *
 * Failure routing: the agent reasoning call goes through
 * runAgentWithFailureSurface (F-08), so any thrown AgentFailure becomes
 * a ClarificationRequest + QualityMetric pair. On failure the
 * ReadinessDecision is still returned, with status='Blocked' and a single
 * synthetic reason explaining the agent failure — the customer surface
 * never sees an empty reasons[] (N4 / EDGE-2).
 *
 * Acceptance (per app/feature-list.json F-10):
 *   - Every reason object has all 5 keys populated.
 *   - Rendered text contains no 'system:' / 'prompt:' / '<|' substrings.
 *   - Status is one of the 4 ReadinessStatus values.
 */

import type {
  CompiledConfiguration,
  DocumentRun,
  ExtractedField,
  OperationalReason,
  ReadinessDecision,
  ReadinessStatus,
  SchemaField,
} from '@domain/types';
import { generateOperationalReasons } from '@domain/generateOperationalReasons';
import {
  runAgentWithFailureSurface,
  type RunAgentOutcome,
} from '@domain/agentFailureSurface';
import { recordCustom } from '@runtime/qualityMetricLog';

// ---------------------------------------------------------------------------
// Status policy — pure, deterministic, no AI Core involved
// ---------------------------------------------------------------------------

interface FieldState {
  readonly schemaField: SchemaField;
  readonly extracted: ExtractedField | undefined;
  readonly isMissing: boolean;
  readonly isBelowThreshold: boolean;
}

function classifyField(field: SchemaField, extracted: ExtractedField | undefined): FieldState {
  if (!extracted) {
    return {
      schemaField: field,
      extracted: undefined,
      isMissing: field.required,
      isBelowThreshold: false,
    };
  }
  const missing = extracted.value === null;
  const belowThreshold = !missing && extracted.confidence < field.confidenceThreshold;
  return {
    schemaField: field,
    extracted,
    isMissing: missing && field.required,
    isBelowThreshold: belowThreshold,
  };
}

export function decideStatus(run: DocumentRun, config: CompiledConfiguration): ReadinessStatus {
  const extractedByName = new Map(run.extractedFields.map((f) => [f.name, f]));
  const states = config.schema.fields.map((f) => classifyField(f, extractedByName.get(f.name)));
  if (states.some((s) => s.isMissing)) return 'Blocked';
  if (states.some((s) => s.isBelowThreshold)) return 'Needs review';
  return 'Ready';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface DecideReadinessOptions {
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
  /** Optional override of the smallest-viable model used by the reasoning agent. */
  readonly reasoningModel?: string;
}

export async function decideReadiness(
  run: DocumentRun,
  config: CompiledConfiguration,
  opts: DecideReadinessOptions = {},
): Promise<ReadinessDecision> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const startedAt = Date.now();
  const status = decideStatus(run, config);

  const outcome: RunAgentOutcome<readonly OperationalReason[]> =
    await runAgentWithFailureSurface(
      'operationalReasons',
      () => generateOperationalReasons(run, config, { model: opts.reasoningModel }),
      { nowIso, documentRunId: run.id },
    );

  let reasons: readonly OperationalReason[];
  let effectiveStatus: ReadinessStatus = status;

  if (outcome.kind === 'success') {
    reasons = outcome.value;
  } else {
    // Agent failure: synthesise a single reason explaining the failure so
    // the customer surface never sees an empty reasons[] — F-08 already
    // emitted the ClarificationRequest + QualityMetric pair.
    reasons = Object.freeze([
      Object.freeze({
        field: '(readiness reasoning)',
        evidence: `Automated reasoning step "${outcome.failure.agent}" failed: ${outcome.failure.reason}.`,
        rule: 'reasoning agent must succeed before auto-post',
        confidence: 0,
        nextAction: 'review the operator-facing clarification request and re-run when ready',
      }),
    ]);
    // Force-downgrade to Blocked if reasoning failed — we cannot recommend
    // posting a document we have no business-language explanation for (N4).
    effectiveStatus = 'Blocked';
  }

  // SF: wire composite-level QualityMetric so the Agent I/O Dashboard can
  // count readiness verdicts distinct from the inner operationalReasons row.
  // tokenUsage/model are null — the inner row carries the real spend; the
  // composite is observability of the wrap, not a duplicate of the inner
  // call. Fire-and-forget per aiCoreClient.ts:414-422 pattern.
  try {
    recordCustom(
      {
        agent: 'readiness',
        status: outcome.kind === 'success' ? 'success' : 'fail',
        latencyMs: Date.now() - startedAt,
        tokenUsage: null,
        model: null,
        maxTokens: null,
        error:
          outcome.kind === 'failure'
            ? `${outcome.failure.agent} failed: ${outcome.failure.reason} — ${outcome.failure.message}`
            : null,
      },
      { nowIso },
    );
  } catch {
    // observability must never break the agent path
  }

  return Object.freeze({
    id: `ready::${run.id}::${nowIso}`,
    documentRunId: run.id,
    status: effectiveStatus,
    reasons,
    decidedAt: nowIso,
  }) satisfies ReadinessDecision;
}
