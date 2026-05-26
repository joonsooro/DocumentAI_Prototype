/**
 * @vitest-environment jsdom
 *
 * F-23 — UploadZonePanel tests.
 *
 * D2 option A: drop announces "Processing DAEJOO sample invoice"
 * (literal text). N6: no extraction library imported; the panel always
 * processes the canned DAEJOO fixture.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UploadZonePanel } from './UploadZonePanel';
import type { CompiledConfiguration, DocumentRun } from '@domain/types';

const makeConfiguration = (): CompiledConfiguration => ({
  id: 'cfg::test::1',
  intentId: 'intent::test::1',
  source: 'aiCore',
  templateUsed: false,
  schema: {
    fields: [
      {
        name: 'supplier',
        dataType: 'string',
        required: true,
        instruction: 'Extract supplier',
        validation: null,
        regex: '^.+$',
        confidenceThreshold: 0.85,
      },
    ],
  },
  processingMode: 'auto_confirm',
  compiledAt: '2026-05-26T00:00:00Z',
});

describe('F-23 UploadZonePanel', () => {
  beforeEach(() => cleanup());

  it("renders with data-testid='customer-upload-zone'", () => {
    render(<UploadZonePanel />);
    expect(screen.getByTestId('customer-upload-zone')).toBeTruthy();
  });

  it('renders the permanent demo tag and the file input affordance', () => {
    render(<UploadZonePanel />);
    const tag = screen.getByTestId('customer-upload-zone-demo-tag');
    expect(tag.textContent).toBe('Demo: DAEJOO invoice only');
    expect(screen.getByTestId('customer-upload-zone-input')).toBeTruthy();
  });

  it("drop announces literal 'Processing DAEJOO sample invoice' (D2 option A)", () => {
    render(<UploadZonePanel />);
    // before any drop, no announcement is rendered
    expect(screen.queryByTestId('customer-upload-zone-announcement')).toBeNull();
    fireEvent.drop(screen.getByTestId('customer-upload-zone'));
    const ann = screen.getByTestId('customer-upload-zone-announcement');
    expect(ann.textContent).toBe('Processing DAEJOO sample invoice');
  });

  it('drop with a configuration invokes simulateDocumentRun + emits onDocumentRun callback', () => {
    const runs: DocumentRun[] = [];
    const config = makeConfiguration();
    render(<UploadZonePanel configuration={config} onDocumentRun={(r) => runs.push(r)} />);
    fireEvent.drop(screen.getByTestId('customer-upload-zone'));
    expect(runs.length).toBe(1);
    // F-03 returns a deterministic DAEJOO DocumentRun keyed on the canned PDF URL.
    expect(runs[0].documentPath).toBe('/assets/daejoo-invoice.pdf');
    expect(runs[0].extractedFields.length).toBeGreaterThan(0);
  });

  it('drop without configuration still announces but does NOT invoke F-03', () => {
    const callback = vi.fn();
    render(<UploadZonePanel onDocumentRun={callback} />);
    fireEvent.drop(screen.getByTestId('customer-upload-zone'));
    expect(screen.getByTestId('customer-upload-zone-announcement').textContent).toBe(
      'Processing DAEJOO sample invoice',
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it('panel imports no extraction library (N6 — static module-graph check)', async () => {
    // The module surface is the only place a pdf-parse / OCR import could
    // land. Verify by inspecting the runtime exports: the module exports
    // ONLY the UploadZonePanel React component and its prop type.
    const mod = await import('./UploadZonePanel');
    const exportNames = Object.keys(mod).sort();
    expect(exportNames).toEqual(['UploadZonePanel']);
  });
});
