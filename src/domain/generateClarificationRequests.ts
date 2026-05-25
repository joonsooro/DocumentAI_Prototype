/**
 * F-07 — Clarification Generator (A4).
 *
 * Contract pointer: U7. Reads a DocumentRun + CompiledConfiguration and
 * emits one ClarificationRequest per missed or low-confidence field, each
 * carrying the 3 EDGE-1 prompts (field meaning · posting/review/reporting
 * impact · supplier-scope applicability).
 *
 * OQ-3 resolution (recorded in app/app-spec.json#blocked_open_questions.OQ-3):
 *   v1 uses a uniform 0.85 default — the F-04 compile agent stamps it on
 *   every SchemaField. Per-field calibration is deferred to S4 OBSERVE
 *   where real extraction telemetry exists. F-07 reads the threshold from
 *   the SchemaField directly (NOT a magic constant) so when S4 reopens
 *   OQ-3 with per-field calibration, F-07 follows automatically.
 *
 * Predicates (from OQ-3.v1_decision):
 *   - missed: extractedField.value === null OR no extractedField for a
 *     required SchemaField.
 *   - low-confidence: extractedField.confidence < SchemaField.confidenceThreshold.
 *
 * A field cannot be both missed AND low-confidence — missed implies no value
 * exists to score. The function emits at most one ClarificationRequest per
 * field.
 *
 * Acceptance (per app/feature-list.json):
 *   - Every missed field generates exactly one request.
 *   - Every request has all 3 EDGE-1 prompts.
 *   - When ≥1 field is null but clarifications.length === 0 → kill switch.
 *     Enforced here by construction: forEach over schema fields → at most
 *     one request per field; predicate is total over the field set.
 *
 * Non-goals:
 *   - F-07 does NOT call AI Core. Like F-06 it is a pure deterministic
 *     function — the agentic surface is F-04 (compile) + F-05 (capability) +
 *     F-10 (readiness). The clarification request is mechanical bookkeeping
 *     over what F-03 / F-04 already produced.
 *   - F-07 does NOT decide readiness — F-10 owns that. F-07 only emits
 *     clarifications.
 */

import type {
  ClarificationPrompts,
  ClarificationRequest,
  CompiledConfiguration,
  DocumentRun,
  ExtractedField,
  SchemaField,
} from '@domain/types';

// ---------------------------------------------------------------------------
// EDGE-1 prompts — same three keys F-06 already emits, generated here per
// field so the questions are field-specific. The shape is shared via the
// ClarificationPrompts type so downstream UI (F-11 customer workspace) can
// render either source uniformly.
// ---------------------------------------------------------------------------

function buildFieldPrompts(field: SchemaField, kind: 'missed' | 'low_confidence'): ClarificationPrompts {
  const fieldName = field.name;
  if (kind === 'missed') {
    return {
      fieldMeaning: `We didn't find a value for "${fieldName}" on this document. What does "${fieldName}" mean in your business process, and where on the document would it typically appear?`,
      postingReviewReportingImpact: `If "${fieldName}" is missing, should the document be blocked from posting, flagged for review, or excluded from reporting?`,
      supplierScopeApplicability: `Is "${fieldName}" required for all suppliers, only this supplier, or only certain document types?`,
    };
  }
  // low_confidence
  return {
    fieldMeaning: `We extracted a value for "${fieldName}" but with low confidence. Can you confirm what "${fieldName}" should mean here, and how to recognise it on the document?`,
    postingReviewReportingImpact: `When "${fieldName}" is low-confidence, should the document still post automatically, go to review, or be excluded from reports until confirmed?`,
    supplierScopeApplicability: `Does this confidence rule for "${fieldName}" apply to all suppliers, only this supplier, or only certain document types?`,
  };
}

// ---------------------------------------------------------------------------
// Predicates — single source of truth, used by both the generator and tests.
// ---------------------------------------------------------------------------

/** A field is "missed" when it has no extraction OR an explicit null value. */
export function isMissedField(
  field: SchemaField,
  extracted: ExtractedField | undefined,
): boolean {
  if (!extracted) return field.required;
  return extracted.value === null;
}

/** A field is "low-confidence" when it has a non-null value below threshold. */
export function isLowConfidenceField(
  field: SchemaField,
  extracted: ExtractedField | undefined,
): boolean {
  if (!extracted || extracted.value === null) return false;
  return extracted.confidence < field.confidenceThreshold;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Injectable for deterministic id stamping in tests. */
  readonly nowIso?: string;
}

export function generateClarificationRequests(
  run: DocumentRun,
  config: CompiledConfiguration,
  opts: GenerateOptions = {},
): readonly ClarificationRequest[] {
  const nowIso = opts.nowIso ?? new Date().toISOString();

  // Index extracted fields by name for O(1) lookup. The mock extractor
  // (F-03) and live extraction surface (post-v1) both key by name.
  const extractedByName = new Map<string, ExtractedField>();
  for (const f of run.extractedFields) {
    extractedByName.set(f.name, f);
  }

  const requests: ClarificationRequest[] = [];

  config.schema.fields.forEach((field, idx) => {
    const extracted = extractedByName.get(field.name);

    if (isMissedField(field, extracted)) {
      requests.push({
        id: `clar::missed::${run.id}::${field.name}::${idx}::${nowIso}`,
        kind: 'missed_field',
        field: field.name,
        documentRunId: run.id,
        prompts: buildFieldPrompts(field, 'missed'),
        operatorFacingError: null,
        raisedAt: nowIso,
      });
      return; // missed and low-confidence are mutually exclusive
    }

    if (isLowConfidenceField(field, extracted)) {
      requests.push({
        id: `clar::lowconf::${run.id}::${field.name}::${idx}::${nowIso}`,
        kind: 'low_confidence',
        field: field.name,
        documentRunId: run.id,
        prompts: buildFieldPrompts(field, 'low_confidence'),
        operatorFacingError: null,
        raisedAt: nowIso,
      });
    }
  });

  return requests;
}
