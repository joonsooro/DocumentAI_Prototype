/**
 * F-16 — Correction submission (A6 input path).
 *
 * Contract pointer: U14. Operator-supplied corrections enter an in-memory
 * store and queue for the F-09 governance gate. F-16 NEVER auto-promotes
 * a correction into a ProductSignal — that is F-09's job, and only after
 * the OQ-2 governance thresholds are crossed.
 *
 * Spec invariants enforced here:
 *   - A6 / N5 / EDGE-3: a single CorrectionEvent does not create a
 *     ProductSignal. productSignals length is unchanged after submission.
 *   - The governance fields (frequency, customerImpact, documentType,
 *     supplier, country) start populated with whatever the caller provided;
 *     unset values stay null until F-09 fills them in at governance time.
 *   - Store is in-memory only (SUB-2 in-memory typed fixtures + pure
 *     service functions; no database).
 *
 * Acceptance (per app/feature-list.json F-16):
 *   - New CorrectionEvent visible in the store after submitCorrection.
 *   - productSignals.length unchanged after submission.
 *
 * Kill switch (10 min): if any submission auto-touches productSignals,
 * halt. Enforced by construction: F-16 has NO write path to
 * productSignals; F-09 (later) is the only writer. The
 * "productSignals length unchanged" invariant is also asserted in tests
 * across multiple submissions.
 */

import type { CorrectionEvent, ProductSignal } from '@domain/types';

// ---------------------------------------------------------------------------
// In-memory store — module-level singleton per process (browser tab or Node
// test run). Tests reset via _resetCorrectionStoreForTests().
// ---------------------------------------------------------------------------

const corrections: CorrectionEvent[] = [];
const productSignals: ProductSignal[] = [];

let idCounter = 0;
function nextCorrectionId(field: string, nowIso: string): string {
  idCounter += 1;
  return `corr::${field}::${idCounter}::${nowIso}`;
}

// ---------------------------------------------------------------------------
// Input shape — caller supplies the operator-facing fields; F-16 stamps
// id and submittedAt. Governance fields default to null when the caller
// has no information; F-09 will populate them later.
// ---------------------------------------------------------------------------

export interface SubmitCorrectionInput {
  readonly documentRunId: string;
  readonly field: string;
  readonly oldValue: string | number | boolean | null;
  readonly newValue: string | number | boolean | null;
  readonly operator: string;
  readonly governance?: {
    readonly frequency?: number | null;
    readonly customerImpact?: 'low' | 'medium' | 'high' | null;
    readonly documentType: string; // required — every correction is for a known doc type
    readonly supplier?: string | null;
    readonly country?: string | null;
  };
  readonly documentType?: string; // shorthand when caller has no other governance signals
}

export interface SubmitOptions {
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
}

// ---------------------------------------------------------------------------
// Public write surface — submitCorrection
// ---------------------------------------------------------------------------

export function submitCorrection(
  input: SubmitCorrectionInput,
  opts: SubmitOptions = {},
): CorrectionEvent {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const documentType =
    input.governance?.documentType ?? input.documentType ?? 'unknown_document_type';

  const event: CorrectionEvent = {
    id: nextCorrectionId(input.field, nowIso),
    documentRunId: input.documentRunId,
    field: input.field,
    oldValue: input.oldValue,
    newValue: input.newValue,
    operator: input.operator,
    submittedAt: nowIso,
    governance: {
      frequency: input.governance?.frequency ?? null,
      customerImpact: input.governance?.customerImpact ?? null,
      documentType,
      supplier: input.governance?.supplier ?? null,
      country: input.governance?.country ?? null,
    },
  };

  corrections.push(event);
  // EXPLICIT NON-WRITE: do NOT mutate productSignals. F-09 owns that array;
  // F-16 only writes corrections. The kill-switch invariant is structural.
  return event;
}

// ---------------------------------------------------------------------------
// Read surface
// ---------------------------------------------------------------------------

export function getCorrections(): readonly CorrectionEvent[] {
  return Object.freeze(corrections.slice());
}

export function getProductSignals(): readonly ProductSignal[] {
  return Object.freeze(productSignals.slice());
}

export function countCorrections(filter?: {
  readonly field?: string;
  readonly documentRunId?: string;
  readonly operator?: string;
}): number {
  if (!filter) return corrections.length;
  return corrections.filter(
    (c) =>
      (filter.field === undefined || c.field === filter.field) &&
      (filter.documentRunId === undefined || c.documentRunId === filter.documentRunId) &&
      (filter.operator === undefined || c.operator === filter.operator),
  ).length;
}

// ---------------------------------------------------------------------------
// F-09 write hook (the ONLY place productSignals is mutated)
//
// Exported for F-09 to use when its governance gate approves a candidate
// signal. F-16's tests assert that calling submitCorrection alone never
// touches this array.
// ---------------------------------------------------------------------------

export function _appendApprovedSignalForF09(signal: ProductSignal): void {
  productSignals.push(signal);
}

// ---------------------------------------------------------------------------
// Test-only reset
// ---------------------------------------------------------------------------

export function _resetCorrectionStoreForTests(): void {
  corrections.length = 0;
  productSignals.length = 0;
  idCounter = 0;
}
