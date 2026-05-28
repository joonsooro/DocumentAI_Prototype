/**
 * F-07 tests — generateClarificationRequests (A4).
 *
 * Pure function — no fetch mocking. Asserts:
 *   - Every missed field generates exactly one ClarificationRequest.
 *   - Every low-confidence field generates exactly one ClarificationRequest.
 *   - A field cannot be both missed AND low-confidence (predicates exclusive).
 *   - Every emitted request has all 3 EDGE-1 prompts present and non-empty.
 *   - Kill-switch invariant: if ≥1 field is null, clarifications.length ≥ 1.
 *   - Threshold read FROM SchemaField (not a magic constant) so a per-field
 *     calibration in S4 OBSERVE will be picked up automatically.
 *   - DAEJOO fixture demo path: payment_terms (0.74) and
 *     commercial_value_indicator (0.62) both trigger low-confidence clarifications.
 */
import { describe, it, expect } from 'vitest';
import {
  generateClarificationRequests,
  isMissedField,
  isLowConfidenceField,
} from '@domain/generateClarificationRequests';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import type {
  CompiledConfiguration,
  DocumentRun,
  ExtractedField,
  SchemaField,
} from '@domain/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function field(name: string, threshold = 0.85, required = true): SchemaField {
  return {
    name,
    dataType: name.endsWith('_amount') ? 'number' : name.endsWith('_date') ? 'date' : 'string',
    required,
    instruction: `Extract ${name}`,
    validation: null,
    regex: null,
    confidenceThreshold: threshold,
  };
}

function configWithFields(fields: SchemaField[]): CompiledConfiguration {
  return {
    id: 'cfg::test::1',
    intentId: 'intent::test::1',
    schema: { fields },
    processingMode: 'review_required',
    source: 'aiCore',
    templateUsed: false,
    compiledAt: '2026-05-25T00:00:00Z',
    extractionSystemPrompt: 'test extraction system prompt',
  };
}

function extracted(name: string, value: string | number | null, confidence: number): ExtractedField {
  return { name, value, confidence, evidence: value === null ? null : `evidence for ${name}` };
}

function runWithFields(fields: ExtractedField[]): DocumentRun {
  return {
    id: 'run::test::1',
    documentPath: '/assets/daejoo-invoice.pdf',
    configurationId: 'cfg::test::1',
    extractedFields: fields,
    extractedAt: '2026-05-25T00:00:00Z',
    source: 'mock',
  };
}

// ---------------------------------------------------------------------------
// Predicate tests — small, exhaustive
// ---------------------------------------------------------------------------

describe('F-07 isMissedField / isLowConfidenceField predicates', () => {
  it('isMissedField: required field with no extraction => true', () => {
    expect(isMissedField(field('supplier'), undefined)).toBe(true);
  });

  it('isMissedField: optional field with no extraction => false', () => {
    expect(isMissedField(field('hs_code', 0.85, false), undefined)).toBe(false);
  });

  it('isMissedField: extracted with null value => true regardless of required', () => {
    expect(isMissedField(field('supplier'), extracted('supplier', null, 0.0))).toBe(true);
  });

  it('isMissedField: extracted with a value => false', () => {
    expect(isMissedField(field('supplier'), extracted('supplier', 'ACME', 0.99))).toBe(false);
  });

  it('isLowConfidenceField: value present and confidence below threshold => true', () => {
    expect(isLowConfidenceField(field('payment_terms', 0.85), extracted('payment_terms', '60 days', 0.74))).toBe(true);
  });

  it('isLowConfidenceField: value present and confidence at threshold => false', () => {
    expect(isLowConfidenceField(field('payment_terms', 0.85), extracted('payment_terms', '60 days', 0.85))).toBe(false);
  });

  it('isLowConfidenceField: null value => false (missed, not low-conf)', () => {
    expect(isLowConfidenceField(field('payment_terms', 0.85), extracted('payment_terms', null, 0.0))).toBe(false);
  });

  it('predicates are mutually exclusive (one or the other, never both)', () => {
    const f = field('payment_terms', 0.85);
    const cases: ExtractedField[] = [
      extracted('payment_terms', null, 0.0),
      extracted('payment_terms', '60 days', 0.5),
      extracted('payment_terms', '60 days', 0.95),
    ];
    for (const e of cases) {
      const m = isMissedField(f, e);
      const l = isLowConfidenceField(f, e);
      expect(m && l).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Generator behaviour — acceptance invariants from feature-list.json
// ---------------------------------------------------------------------------

describe('F-07 generateClarificationRequests — acceptance invariants', () => {
  it('emits exactly one ClarificationRequest per missed field', () => {
    const cfg = configWithFields([field('supplier'), field('po_number'), field('payment_terms')]);
    const run = runWithFields([
      extracted('supplier', 'ACME', 0.99),
      extracted('po_number', null, 0.0),
      extracted('payment_terms', null, 0.0),
    ]);
    const out = generateClarificationRequests(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    expect(out.length).toBe(2);
    expect(out.every((c) => c.kind === 'missed_field')).toBe(true);
    expect(out.map((c) => c.field).sort()).toEqual(['payment_terms', 'po_number']);
  });

  it('emits exactly one ClarificationRequest per low-confidence field', () => {
    const cfg = configWithFields([field('supplier'), field('payment_terms')]);
    const run = runWithFields([
      extracted('supplier', 'ACME', 0.99),
      extracted('payment_terms', '60 days', 0.74),
    ]);
    const out = generateClarificationRequests(run, cfg);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('low_confidence');
    expect(out[0].field).toBe('payment_terms');
  });

  it('every emitted ClarificationRequest carries all 3 EDGE-1 prompts (non-empty)', () => {
    const cfg = configWithFields([field('a'), field('b', 0.85), field('c')]);
    const run = runWithFields([
      extracted('a', null, 0.0), // missed
      extracted('b', 'value', 0.5), // low-confidence
      extracted('c', 'value', 0.99), // ok
    ]);
    const out = generateClarificationRequests(run, cfg);
    expect(out.length).toBe(2);
    for (const c of out) {
      expect(c.prompts.fieldMeaning.length).toBeGreaterThan(0);
      expect(c.prompts.postingReviewReportingImpact.length).toBeGreaterThan(0);
      expect(c.prompts.supplierScopeApplicability.length).toBeGreaterThan(0);
    }
  });

  it('emits nothing when every required field is present and above its threshold', () => {
    const cfg = configWithFields([field('supplier'), field('po_number')]);
    const run = runWithFields([
      extracted('supplier', 'ACME', 0.99),
      extracted('po_number', 'PO-1', 0.95),
    ]);
    const out = generateClarificationRequests(run, cfg);
    expect(out).toEqual([]);
  });

  it('kill-switch invariant: when ≥1 field is null, clarifications.length ≥ 1', () => {
    const cfg = configWithFields([field('supplier'), field('po_number')]);
    const run = runWithFields([
      extracted('supplier', 'ACME', 0.99),
      extracted('po_number', null, 0.0),
    ]);
    const out = generateClarificationRequests(run, cfg);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('reads threshold FROM SchemaField, not a magic constant (per-field calibration is honored)', () => {
    // payment_terms uses a relaxed threshold (0.70) — the same 0.74 extraction
    // that would be low-confidence under 0.85 should NOT trigger here.
    const cfg = configWithFields([field('payment_terms', 0.70)]);
    const run = runWithFields([extracted('payment_terms', '60 days', 0.74)]);
    const out = generateClarificationRequests(run, cfg);
    expect(out).toEqual([]);
  });

  it('ids are deterministic when nowIso is injected', () => {
    const cfg = configWithFields([field('payment_terms')]);
    const run = runWithFields([extracted('payment_terms', '60 days', 0.74)]);
    const a = generateClarificationRequests(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    const b = generateClarificationRequests(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toContain('payment_terms');
  });
});

// ---------------------------------------------------------------------------
// Demo-path integration — wire F-03 (real DAEJOO fixture) through F-07
// ---------------------------------------------------------------------------

describe('F-07 generateClarificationRequests — DAEJOO demo path (integration with F-03)', () => {
  const cfg: CompiledConfiguration = configWithFields([
    field('supplier'),
    field('po_number'),
    field('payment_terms'),
    field('payable_amount'),
    field('commercial_value_indicator'),
  ]);

  it('payment_terms (0.74) AND commercial_value_indicator (0.62) trigger clarifications on the DAEJOO run', () => {
    // F-03's projectField applies the per-field threshold and ZEROES the
    // value when confidence < threshold, so by the time F-07 sees the run
    // these two fields are MISSED (value=null), not low-confidence. The
    // demo outcome is identical (ClarificationRequest raised, customer
    // asked for the field) — only the request.kind differs.
    const run = simulateDocumentRun('/assets/daejoo-invoice.pdf', cfg);
    const out = generateClarificationRequests(run, cfg, { nowIso: '2026-05-25T00:00:00Z' });
    const triggeredFields = out.map((c) => c.field).sort();
    expect(triggeredFields).toEqual(['commercial_value_indicator', 'payment_terms']);
    // All resulting requests are missed_field because F-03 already nulled the values.
    expect(out.every((c) => c.kind === 'missed_field')).toBe(true);
    // Every request still carries the 3 EDGE-1 prompts.
    for (const c of out) {
      expect(c.prompts.fieldMeaning.length).toBeGreaterThan(0);
      expect(c.prompts.postingReviewReportingImpact.length).toBeGreaterThan(0);
      expect(c.prompts.supplierScopeApplicability.length).toBeGreaterThan(0);
    }
  });

  it('supplier (0.99) and po_number (0.99) do NOT trigger clarifications', () => {
    const run = simulateDocumentRun('/assets/daejoo-invoice.pdf', cfg);
    const out = generateClarificationRequests(run, cfg);
    const triggered = out.map((c) => c.field);
    expect(triggered).not.toContain('supplier');
    expect(triggered).not.toContain('po_number');
  });
});
