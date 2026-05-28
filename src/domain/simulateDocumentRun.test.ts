/**
 * F-03 acceptance test — deterministic output across 10 invocations.
 * Kill switch: 15 min — if non-determinism in any of 3 consecutive runs,
 * F-03 halts. This test enforces that constraint as a binary assertion.
 */
import { describe, it, expect } from 'vitest';
import { simulateDocumentRun, getRawFixture } from '@domain/simulateDocumentRun';
import { DAEJOO_PDF_URL } from '@data/assets';
import type { CompiledConfiguration } from '@domain/types';

/**
 * Minimal DAEJOO-shaped CompiledConfiguration. The compile agent (F-04) will
 * produce richer configs from live AI Core calls; this is the hand-rolled
 * config used to exercise F-03's projection in isolation.
 */
const daejooConfig: CompiledConfiguration = {
  id: 'cfg::daejoo::v0',
  intentId: 'intent::daejoo::v0',
  processingMode: 'review_required',
  source: 'aiCore',
  templateUsed: false,
  compiledAt: '2026-05-25T00:00:00Z',
  extractionSystemPrompt: 'test extraction system prompt',
  schema: {
    fields: [
      { name: 'supplier',                  dataType: 'string', required: true,  instruction: 'Manufacturer / Shipper / Exporter name',  validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'invoice_number',            dataType: 'string', required: true,  instruction: 'Invoice number',                          validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'invoice_date',              dataType: 'date',   required: true,  instruction: 'Invoice date in ISO 8601',                validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'po_number',                 dataType: 'string', required: true,  instruction: 'Purchase order number from header',       validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'hs_code',                   dataType: 'string', required: true,  instruction: 'Harmonised System tariff code',           validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payment_terms',             dataType: 'string', required: true,  instruction: 'Payment terms text',                      validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'total_amount',              dataType: 'number', required: true,  instruction: 'Sum of all line amounts',                 validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'payable_amount',            dataType: 'number', required: true,  instruction: 'Amount the AP team must actually pay',    validation: null, regex: null, confidenceThreshold: 0.85 },
      { name: 'commercial_value_indicator', dataType: 'enum',  required: true,  instruction: 'How to treat non-commercial sample lines', validation: null, regex: null, confidenceThreshold: 0.85, enumValues: ['payable_excludes_sample_line', 'payable_includes_sample_line', 'unknown'] },
    ],
  },
};

describe('F-03 simulateDocumentRun', () => {
  it('returns the same DocumentRun for the same input across 10 invocations (acceptance)', () => {
    const baseline = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
    const baselineJson = JSON.stringify(baseline);
    for (let i = 0; i < 10; i++) {
      const run = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
      expect(JSON.stringify(run)).toBe(baselineJson);
    }
  });

  it('source is always "mock" and never calls live OCR (N6)', () => {
    const run = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
    expect(run.source).toBe('mock');
  });

  it('returns one extractedField per configured schema field, in schema order', () => {
    const run = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
    expect(run.extractedFields.length).toBe(daejooConfig.schema.fields.length);
    daejooConfig.schema.fields.forEach((sf, i) => {
      expect(run.extractedFields[i].name).toBe(sf.name);
    });
  });

  it('drops fields below the configured confidence threshold to value:null (lets F-07 raise clarifications)', () => {
    // payment_terms in the fixture has confidence 0.74; default threshold is 0.85.
    const run = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
    const paymentTerms = run.extractedFields.find((f) => f.name === 'payment_terms')!;
    expect(paymentTerms.value).toBeNull();
    expect(paymentTerms.confidence).toBeCloseTo(0.74, 2);
  });

  it('returns the full DAEJOO scenario shape: payable_amount differs from total_amount because of the no-commercial-value line', () => {
    const run = simulateDocumentRun(DAEJOO_PDF_URL, daejooConfig);
    const total = run.extractedFields.find((f) => f.name === 'total_amount')!;
    const payable = run.extractedFields.find((f) => f.name === 'payable_amount')!;
    expect(total.value).toBe(136653.44);
    expect(payable.value).toBe(136290.00);
    expect((total.value as number) - (payable.value as number)).toBeCloseTo(363.44, 2);
  });

  it('throws on an unregistered documentPath rather than silently returning empty', () => {
    expect(() =>
      simulateDocumentRun('/assets/some-other.pdf', daejooConfig),
    ).toThrow(/no fixture registered/);
  });

  it('exposes raw fixture (incl. material-disposal remark) via getRawFixture for F-06 / F-09 governance use', () => {
    const raw = getRawFixture(DAEJOO_PDF_URL) as { remark_freetext?: string };
    expect(raw.remark_freetext).toMatch(/If it is exposed to Air, it shall be disposed/i);
  });
});
