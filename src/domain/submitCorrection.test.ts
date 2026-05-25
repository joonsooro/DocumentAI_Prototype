/**
 * F-16 tests — submitCorrection (A6 input path).
 *
 * Pure module — no fetch. Asserts:
 *   - submitCorrection writes a CorrectionEvent to the store.
 *   - productSignals.length is UNCHANGED after submission (A6 / N5 / EDGE-3).
 *   - Multiple submissions across 10 runs never auto-touch productSignals
 *     (kill-switch soak — 10 fault-injection attempts).
 *   - Governance fields default to null when not provided; documentType
 *     falls back to 'unknown_document_type'.
 *   - ids are deterministic when nowIso is injected.
 *   - countCorrections filters by field/documentRunId/operator.
 *   - getCorrections returns a frozen snapshot.
 *   - The F-09 escape hatch is the ONLY way productSignals grows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitCorrection,
  getCorrections,
  getProductSignals,
  countCorrections,
  _appendApprovedSignalForF09,
  _resetCorrectionStoreForTests,
} from '@domain/submitCorrection';
import type { ProductSignal } from '@domain/types';

beforeEach(() => {
  _resetCorrectionStoreForTests();
});

describe('F-16 submitCorrection — write surface', () => {
  it('appends a CorrectionEvent with caller-supplied fields and stamps id + submittedAt', () => {
    const event = submitCorrection(
      {
        documentRunId: 'run::test::1',
        field: 'payment_terms',
        oldValue: '60 days',
        newValue: 'WITHIN 60 DAYS AFTER BOARDING',
        operator: 'op-1',
        governance: { documentType: 'commercial_invoice' },
      },
      { nowIso: '2026-05-25T00:00:00Z' },
    );
    expect(event.id).toBe('corr::payment_terms::1::2026-05-25T00:00:00Z');
    expect(event.documentRunId).toBe('run::test::1');
    expect(event.field).toBe('payment_terms');
    expect(event.newValue).toBe('WITHIN 60 DAYS AFTER BOARDING');
    expect(event.operator).toBe('op-1');
    expect(event.submittedAt).toBe('2026-05-25T00:00:00Z');
    expect(getCorrections().length).toBe(1);
  });

  it('governance fields default to null when not provided', () => {
    const e = submitCorrection({
      documentRunId: 'run::1',
      field: 'supplier',
      oldValue: 'ACME',
      newValue: 'ACME Corp',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(e.governance.frequency).toBeNull();
    expect(e.governance.customerImpact).toBeNull();
    expect(e.governance.supplier).toBeNull();
    expect(e.governance.country).toBeNull();
    expect(e.governance.documentType).toBe('commercial_invoice');
  });

  it('documentType falls back to unknown_document_type when no governance object given', () => {
    const e = submitCorrection({
      documentRunId: 'run::1',
      field: 'supplier',
      oldValue: null,
      newValue: 'ACME',
      operator: 'op-1',
    });
    expect(e.governance.documentType).toBe('unknown_document_type');
  });
});

describe('F-16 submitCorrection — A6 / N5 / EDGE-3 kill-switch invariant', () => {
  it('productSignals.length is UNCHANGED after a single submission', () => {
    expect(getProductSignals().length).toBe(0);
    submitCorrection({
      documentRunId: 'run::1',
      field: 'payment_terms',
      oldValue: null,
      newValue: '60 days',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(getProductSignals().length).toBe(0);
  });

  it('productSignals.length is UNCHANGED after 10 submissions (soak)', () => {
    for (let i = 0; i < 10; i += 1) {
      submitCorrection({
        documentRunId: `run::${i}`,
        field: 'payment_terms',
        oldValue: null,
        newValue: `${i} days`,
        operator: 'op-1',
        governance: { documentType: 'commercial_invoice' },
      });
    }
    expect(getCorrections().length).toBe(10);
    expect(getProductSignals().length).toBe(0);
  });

  it('productSignals.length is UNCHANGED even when the field would obviously map to a signal', () => {
    // The DAEJOO disposal-phrase scenario must NEVER auto-promote.
    submitCorrection({
      documentRunId: 'run::1',
      field: 'remark_freetext',
      oldValue: null,
      newValue: 'auto-dispose spent materials at the supplier dock',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(getProductSignals().length).toBe(0);
  });
});

describe('F-16 read surface', () => {
  it('getCorrections returns a frozen snapshot decoupled from the store', () => {
    submitCorrection({
      documentRunId: 'run::1',
      field: 'supplier',
      oldValue: null,
      newValue: 'ACME',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    const snap = getCorrections();
    expect(Object.isFrozen(snap)).toBe(true);
    submitCorrection({
      documentRunId: 'run::2',
      field: 'supplier',
      oldValue: null,
      newValue: 'ACME-2',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(snap.length).toBe(1);
    expect(getCorrections().length).toBe(2);
  });

  it('countCorrections filters by field / documentRunId / operator', () => {
    submitCorrection({
      documentRunId: 'run::1',
      field: 'supplier',
      oldValue: null,
      newValue: 'ACME',
      operator: 'op-A',
      governance: { documentType: 'commercial_invoice' },
    });
    submitCorrection({
      documentRunId: 'run::1',
      field: 'payment_terms',
      oldValue: null,
      newValue: '60 days',
      operator: 'op-B',
      governance: { documentType: 'commercial_invoice' },
    });
    submitCorrection({
      documentRunId: 'run::2',
      field: 'supplier',
      oldValue: null,
      newValue: 'BETA',
      operator: 'op-A',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(countCorrections()).toBe(3);
    expect(countCorrections({ field: 'supplier' })).toBe(2);
    expect(countCorrections({ documentRunId: 'run::1' })).toBe(2);
    expect(countCorrections({ operator: 'op-A' })).toBe(2);
    expect(countCorrections({ field: 'supplier', operator: 'op-A' })).toBe(2);
  });

  it('ids are deterministic when nowIso is injected and the counter is reset', () => {
    const a = submitCorrection(
      {
        documentRunId: 'run::1',
        field: 'supplier',
        oldValue: null,
        newValue: 'ACME',
        operator: 'op-1',
        governance: { documentType: 'commercial_invoice' },
      },
      { nowIso: 'T1' },
    );
    _resetCorrectionStoreForTests();
    const b = submitCorrection(
      {
        documentRunId: 'run::1',
        field: 'supplier',
        oldValue: null,
        newValue: 'ACME',
        operator: 'op-1',
        governance: { documentType: 'commercial_invoice' },
      },
      { nowIso: 'T1' },
    );
    expect(a.id).toBe(b.id);
  });
});

describe('F-16 F-09 escape hatch (forward-looking)', () => {
  it('productSignals only grows via _appendApprovedSignalForF09 — never via submitCorrection', () => {
    submitCorrection({
      documentRunId: 'run::1',
      field: 'payment_terms',
      oldValue: null,
      newValue: '60 days',
      operator: 'op-1',
      governance: { documentType: 'commercial_invoice' },
    });
    expect(getProductSignals().length).toBe(0);
    const sig: ProductSignal = {
      id: 'sig::1',
      signalType: 'recurring_correction_pattern',
      category: 'test',
      intentFragment: null,
      suggestedProductArea: 'test',
      frequency: 5,
      customerImpact: 'medium',
      documentType: 'commercial_invoice',
      supplier: null,
      country: null,
      sourceCorrectionIds: [],
      governanceApprovedAt: '2026-05-25T00:00:00Z',
    };
    _appendApprovedSignalForF09(sig);
    expect(getProductSignals().length).toBe(1);
    expect(getProductSignals()[0].governanceApprovedAt).toBe('2026-05-25T00:00:00Z');
  });
});
