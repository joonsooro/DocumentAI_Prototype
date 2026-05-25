/**
 * F-09 — Signal governance gate (A6).
 *
 * Contract pointer: U9. Reads the F-16 CorrectionEvent queue, groups
 * corrections into candidate ProductSignals, and approves each candidate
 * only when the v1 OQ-2 thresholds are crossed:
 *
 *   frequency               >= 3      (min_frequency)
 *   distinct supplier count >= 2      (min_distinct_suppliers)
 *   customerImpact          != 'low'  (forbidden_customer_impacts)
 *
 * The thresholds live in app/app-spec.json#blocked_open_questions.OQ-2.v1_decision
 * so when S4 reopens OQ-2 with per-signal-type tuning, F-09 follows
 * automatically.
 *
 * Pure function — no AI Core call. Governance is rule-based; the
 * prompt-based classification already happened in F-05/F-06.
 *
 * Spec invariants enforced here:
 *   - A6 / N5 / EDGE-3: a single CorrectionEvent never promotes. The
 *     v1 min_frequency=3 makes this structural.
 *   - F-16 invariant preserved: F-09 mutates productSignals[] EXCLUSIVELY
 *     via _appendApprovedSignalForF09. submitCorrection still cannot.
 *   - RED-2: the DAEJOO material-disposal phrase, when ingested through
 *     F-06 as a candidate signal, enters the queue ungoverned and waits
 *     for the same threshold check.
 *
 * Acceptance (per app/feature-list.json F-09):
 *   - No single-correction promotion.
 *   - Promotion requires governance fields populated and threshold check
 *     passing.
 *
 * Kill switch (15 min): if any one-off CorrectionEvent auto-promotes in
 * any of 10 runs, halt. Enforced by construction: the promotion predicate
 * cannot return true for a group of 1.
 */

import type { CorrectionEvent, ProductSignal } from '@domain/types';
import {
  _appendApprovedSignalForF09,
  getProductSignals,
} from '@domain/submitCorrection';
import appSpec from '../../app/app-spec.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Threshold loader — pulls the v1 OQ-2 decision out of app-spec.json so the
// gate behaviour is data-driven, not hard-coded.
// ---------------------------------------------------------------------------

interface OQ2Decision {
  readonly thresholds: {
    readonly min_frequency: number;
    readonly min_distinct_suppliers: number;
    readonly forbidden_customer_impacts: readonly ('low' | 'medium' | 'high')[];
  };
}

interface AppSpecShape {
  readonly blocked_open_questions: {
    readonly 'OQ-2': {
      readonly v1_decision: OQ2Decision;
    };
  };
}

function loadThresholds(): OQ2Decision['thresholds'] {
  const spec = appSpec as unknown as AppSpecShape;
  const v1 = spec.blocked_open_questions?.['OQ-2']?.v1_decision;
  if (!v1) {
    throw new Error(
      'F-09: OQ-2 v1_decision missing from app-spec.json. ' +
        'Governance gate cannot run without thresholds.',
    );
  }
  return v1.thresholds;
}

// ---------------------------------------------------------------------------
// Candidate aggregation
//
// A candidate is a group of CorrectionEvents that COULD become a single
// ProductSignal. Grouping key: (documentType, field). Multiple operators
// correcting the same field across multiple suppliers on the same doc type
// is the canonical "recurring_correction_pattern" signal.
// ---------------------------------------------------------------------------

interface Candidate {
  readonly key: string;
  readonly documentType: string;
  readonly field: string;
  readonly corrections: readonly CorrectionEvent[];
  readonly distinctSuppliers: readonly string[];
  readonly aggregateImpact: 'low' | 'medium' | 'high' | null;
}

function impactRank(impact: 'low' | 'medium' | 'high' | null): number {
  if (impact === 'high') return 3;
  if (impact === 'medium') return 2;
  if (impact === 'low') return 1;
  return 0;
}

function impactOf(rank: number): 'low' | 'medium' | 'high' | null {
  if (rank === 3) return 'high';
  if (rank === 2) return 'medium';
  if (rank === 1) return 'low';
  return null;
}

function groupCandidates(corrections: readonly CorrectionEvent[]): readonly Candidate[] {
  const byKey = new Map<string, CorrectionEvent[]>();
  for (const c of corrections) {
    const key = `${c.governance.documentType}::${c.field}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(c);
    byKey.set(key, bucket);
  }
  return Array.from(byKey.entries()).map(([key, events]) => {
    const [documentType, field] = key.split('::', 2);
    const suppliers = new Set<string>();
    let maxImpactRank = 0;
    for (const e of events) {
      if (e.governance.supplier) suppliers.add(e.governance.supplier);
      maxImpactRank = Math.max(maxImpactRank, impactRank(e.governance.customerImpact));
    }
    return {
      key,
      documentType,
      field,
      corrections: events,
      distinctSuppliers: Array.from(suppliers),
      aggregateImpact: impactOf(maxImpactRank),
    };
  });
}

// ---------------------------------------------------------------------------
// Promotion predicate
// ---------------------------------------------------------------------------

interface GovernanceVerdict {
  readonly approved: boolean;
  readonly reason: string;
}

function evaluate(
  c: Candidate,
  t: OQ2Decision['thresholds'],
): GovernanceVerdict {
  if (c.corrections.length < t.min_frequency) {
    return {
      approved: false,
      reason: `frequency ${c.corrections.length} < min ${t.min_frequency}`,
    };
  }
  if (c.distinctSuppliers.length < t.min_distinct_suppliers) {
    return {
      approved: false,
      reason: `distinct suppliers ${c.distinctSuppliers.length} < min ${t.min_distinct_suppliers}`,
    };
  }
  const impact = c.aggregateImpact;
  if (impact === null) {
    return {
      approved: false,
      reason: 'no customerImpact recorded on any correction in the group',
    };
  }
  if (t.forbidden_customer_impacts.includes(impact)) {
    return {
      approved: false,
      reason: `aggregate customerImpact='${impact}' is in forbidden list`,
    };
  }
  return { approved: true, reason: 'thresholds met' };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface GovernRunLogEntry {
  readonly candidateKey: string;
  readonly documentType: string;
  readonly field: string;
  readonly frequency: number;
  readonly distinctSuppliers: number;
  readonly aggregateImpact: 'low' | 'medium' | 'high' | null;
  readonly approved: boolean;
  readonly reason: string;
}

export interface GovernRunResult {
  readonly newlyApproved: readonly ProductSignal[];
  readonly log: readonly GovernRunLogEntry[];
}

export interface GovernOptions {
  /** Injectable for deterministic ids in tests. */
  readonly nowIso?: string;
}

/**
 * Walk the correction queue, evaluate each candidate against the v1 OQ-2
 * thresholds, and append approved ProductSignals to the F-16 store via
 * the documented escape hatch. Returns the newly approved signals + a
 * decision log for the Internal workspace governance panel.
 *
 * Idempotency: every call re-evaluates the full correction queue. To
 * avoid re-approving the same candidate, the function deduplicates against
 * the existing productSignals[] by (documentType, field) — if a signal
 * already exists for this candidate, it is NOT re-emitted.
 */
export function governProductSignals(
  corrections: readonly CorrectionEvent[],
  opts: GovernOptions = {},
): GovernRunResult {
  const thresholds = loadThresholds();
  const nowIso = opts.nowIso ?? new Date().toISOString();

  const existingSignalKeys = new Set(
    getProductSignals().map((s) => `${s.documentType}::${s.intentFragment ?? ''}`),
  );

  const candidates = groupCandidates(corrections);
  const log: GovernRunLogEntry[] = [];
  const newlyApproved: ProductSignal[] = [];

  candidates.forEach((c, idx) => {
    const verdict = evaluate(c, thresholds);
    log.push({
      candidateKey: c.key,
      documentType: c.documentType,
      field: c.field,
      frequency: c.corrections.length,
      distinctSuppliers: c.distinctSuppliers.length,
      aggregateImpact: c.aggregateImpact,
      approved: verdict.approved,
      reason: verdict.reason,
    });

    if (!verdict.approved) return;

    // Dedup against previously approved signals for the same candidate.
    const dedupKey = `${c.documentType}::${c.field}`;
    if (existingSignalKeys.has(dedupKey)) return;

    const signal: ProductSignal = {
      id: `sig::gov::${c.key}::${idx}::${nowIso}`,
      signalType: 'recurring_correction_pattern',
      category: `${c.documentType} / field-correction pattern`,
      intentFragment: c.field,
      suggestedProductArea: `schema field "${c.field}" instruction or validation`,
      frequency: c.corrections.length,
      customerImpact: (c.aggregateImpact ?? 'medium'),
      documentType: c.documentType,
      supplier: c.distinctSuppliers.length === 1 ? c.distinctSuppliers[0] : null,
      country: null,
      sourceCorrectionIds: c.corrections.map((cc) => cc.id),
      governanceApprovedAt: nowIso,
    };
    _appendApprovedSignalForF09(signal);
    newlyApproved.push(signal);
  });

  return Object.freeze({
    newlyApproved: Object.freeze(newlyApproved),
    log: Object.freeze(log),
  });
}

// Re-exports for tests
export const _loadThresholdsForTests = loadThresholds;
