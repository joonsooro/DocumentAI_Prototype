/**
 * @vitest-environment jsdom
 *
 * SF-2 — ExtractedFieldsPanel tests.
 *
 * Asserts the empty-state, the populated-state table shape, and the
 * RED-2 / N1 forbidden-phrase absence (the panel must explain a null
 * value without ever emitting the literal customer-surface phrase).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ExtractedFieldsPanel } from './ExtractedFieldsPanel';
import type { DocumentRun } from '@domain/types';

// Forbidden customer-surface phrase assembled at runtime so the N1
// ESLint rule (AST-level on literals/templates under
// src/components/customer/**) does not trip on the test's own
// assertion string. Same pattern PdfViewerPanel.test.tsx uses.
const FORBIDDEN_PHRASE = 'Un' + 'supported';

const makeRun = (): DocumentRun =>
  Object.freeze({
    id: 'run::test::1',
    documentPath: '/assets/daejoo-invoice.pdf',
    configurationId: 'cfg::test::1',
    extractedAt: '2026-05-27T00:00:00Z',
    source: 'mock',
    extractedFields: Object.freeze([
      {
        name: 'supplier',
        value: 'DAEJOO ELECTRONIC MATERIALS CO., LTD.',
        confidence: 0.99,
        evidence: 'Manufacturer/Shipper/Exporter — DAEJOO ELECTRONIC MATERIALS CO., LTD.',
      },
      {
        name: 'payment_terms',
        value: null, // below-threshold gate fired (F-03 projectField)
        confidence: 0.74,
        evidence: 'Payment — WITHIN 60 DAYS AFTER BOARDING',
      },
    ]),
  }) as DocumentRun;

describe('SF-2 ExtractedFieldsPanel', () => {
  beforeEach(() => cleanup());

  it('renders empty-state when run is null', () => {
    render(<ExtractedFieldsPanel run={null} />);
    expect(screen.getByTestId('customer-extracted-fields-panel-empty')).toBeTruthy();
    expect(screen.queryByTestId('customer-extracted-fields-panel')).toBeNull();
    expect(screen.queryByTestId('customer-extracted-fields-table')).toBeNull();
  });

  it('renders a row per ExtractedField with name + value + confidence + evidence', () => {
    render(<ExtractedFieldsPanel run={makeRun()} />);
    expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy();
    expect(screen.getByTestId('customer-extracted-fields-table')).toBeTruthy();

    // One row per field.
    const supplierRow = screen.getByTestId('customer-extracted-row-supplier');
    const termsRow = screen.getByTestId('customer-extracted-row-payment_terms');
    expect(supplierRow).toBeTruthy();
    expect(termsRow).toBeTruthy();

    // Non-null value column renders the string verbatim.
    expect(supplierRow.textContent).toContain('DAEJOO ELECTRONIC MATERIALS');
    // Null-valued row renders the muted dash.
    expect(termsRow.textContent).toContain('—');

    // Confidence column is percent-formatted.
    expect(supplierRow.textContent).toContain('99%');
    expect(termsRow.textContent).toContain('74%');
  });

  it("does NOT render the forbidden customer-surface phrase 'Unsupported' (RED-2 / N1)", () => {
    render(<ExtractedFieldsPanel run={makeRun()} />);
    const panel = screen.getByTestId('customer-extracted-fields-panel');
    const text = panel.textContent ?? '';
    expect(text).not.toContain(FORBIDDEN_PHRASE);
  });
});
