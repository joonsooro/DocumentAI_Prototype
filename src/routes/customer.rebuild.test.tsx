// @vitest-environment jsdom
/**
 * F-11 — Customer Workspace REBUILD tests (S5 SF · chat-wiring fix).
 *
 * Asserts the chrome + chat-first surface:
 *   - F-21 ObjectHeader tablist with the Workspace-only functional tab (D3)
 *   - F-22 PdfViewerPanel mounted in left pane
 *   - F-23 UploadZonePanel mounted in left pane
 *   - F-27 ChatPanel mounted in right pane as data-testid='customer-chat-panel'
 *   - HAPPY-10: Readiness footer buttons surface a non-destructive
 *     toast and mutate ZERO entity stores.
 *   - The legacy IntentInputPanel + ClarificationLoopPanel mounts are
 *     gone (F-11 acceptance — the chat surface is the single
 *     clarification surface per A12).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CustomerRoute from './customer';
import { _resetForTests as _resetCustomerSessionForTests } from '@runtime/customerSessionStore';
import {
  getCorrections,
  getProductSignals,
  _resetCorrectionStoreForTests,
} from '@domain/submitCorrection';
import {
  getMetrics,
  _resetQualityMetricLogForTests,
} from '@runtime/qualityMetricLog';

describe('F-11 CustomerRoute REBUILD — chrome + chat-first surface', () => {
  beforeEach(() => {
    cleanup();
    _resetCorrectionStoreForTests();
    _resetQualityMetricLogForTests();
    _resetCustomerSessionForTests();
    // Stub fetch so the chat-panel submit test's postChatTurnDecide call
    // does not hit the network; the user-turn bubble is appended
    // synchronously BEFORE the await, so the assertion still holds even
    // if the stubbed response never resolves.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ kind: 'success', decision: { action: 'clarify', clarificationContent: 'ok' } }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts the F-21 ObjectHeader with the Workspace tab active', () => {
    render(<CustomerRoute />);
    expect(screen.getByTestId('object-header')).toBeTruthy();
    expect(screen.getByTestId('object-header-tab-workspace')).toBeTruthy();
    const activeTab = screen.getByRole('tab', { selected: true });
    expect(activeTab.textContent).toBe('Workspace');
  });

  it('renders non-Workspace tabs as disabled with "Available in v2" tooltip (D3)', () => {
    render(<CustomerRoute />);
    const extracted = screen.getByTestId('object-header-tab-extracted') as HTMLButtonElement;
    expect(extracted.disabled).toBe(true);
    expect(extracted.getAttribute('title')).toBe('Available in v2');
    const history = screen.getByTestId('object-header-tab-history') as HTMLButtonElement;
    expect(history.disabled).toBe(true);
    const attachments = screen.getByTestId('object-header-tab-attachments') as HTMLButtonElement;
    expect(attachments.disabled).toBe(true);
  });

  it('mounts the F-22 PdfViewerPanel empty-state + F-23 UploadZonePanel + ExtractedFieldsPanel empty-state on initial render; viewer mounts after upload (S5 SF-1 / SF-2)', () => {
    render(<CustomerRoute />);
    // Initial render: upload zone always mounted, viewer is empty-state.
    expect(screen.getByTestId('customer-upload-zone')).toBeTruthy();
    expect(screen.getByTestId('customer-pdf-viewer-empty')).toBeTruthy();
    expect(screen.queryByTestId('customer-pdf-viewer')).toBeNull();
    // SF-2: the extracted-fields panel also renders its empty-state
    // before any DocumentRun lands.
    expect(screen.getByTestId('customer-extracted-fields-panel-empty')).toBeTruthy();
    expect(screen.queryByTestId('customer-extracted-fields-panel')).toBeNull();
    // After a drop on the upload zone, the viewer toolbar + embed mount.
    fireEvent.drop(screen.getByTestId('customer-upload-zone'));
    expect(screen.getByTestId('customer-pdf-viewer')).toBeTruthy();
    expect(screen.queryByTestId('customer-pdf-viewer-empty')).toBeNull();
  });

  it("mounts F-27 ChatPanel with data-testid='customer-chat-panel'", () => {
    render(<CustomerRoute />);
    expect(screen.getByTestId('customer-chat-panel')).toBeTruthy();
  });

  it("does NOT render the legacy ClarificationLoopPanel or IntentInputPanel testids", () => {
    render(<CustomerRoute />);
    // F-11 acceptance: the prior IntentInputPanel + ClarificationLoopPanel
    // split is removed. ChatPanel (A12) is the single clarification surface.
    expect(screen.queryByTestId('customer-clarification-loop')).toBeNull();
    expect(screen.queryByTestId('customer-clarification-panel')).toBeNull();
    expect(screen.queryByTestId('customer-intent-panel')).toBeNull();
    expect(screen.queryByTestId('customer-intent-textarea')).toBeNull();
  });

  it('HAPPY-10: Save-as-draft click surfaces a toast and mutates ZERO entity stores', () => {
    const correctionsBefore = getCorrections().length;
    const signalsBefore = getProductSignals().length;
    const metricsBefore = getMetrics().length;

    render(<CustomerRoute />);
    expect(screen.queryByTestId('customer-readiness-toast')).toBeNull();

    fireEvent.click(screen.getByTestId('customer-readiness-save-draft'));
    const toast = screen.getByTestId('customer-readiness-toast');
    expect(toast.textContent).toContain('Save as draft');

    expect(getCorrections().length).toBe(correctionsBefore);
    expect(getProductSignals().length).toBe(signalsBefore);
    expect(getMetrics().length).toBe(metricsBefore);
  });

  it('HAPPY-10: Confirm-&-process click surfaces a toast and mutates ZERO entity stores', () => {
    const correctionsBefore = getCorrections().length;
    const signalsBefore = getProductSignals().length;
    const metricsBefore = getMetrics().length;

    render(<CustomerRoute />);
    fireEvent.click(screen.getByTestId('customer-readiness-confirm-process'));
    const toast = screen.getByTestId('customer-readiness-toast');
    expect(toast.textContent).toContain('Confirm & process');

    expect(getCorrections().length).toBe(correctionsBefore);
    expect(getProductSignals().length).toBe(signalsBefore);
    expect(getMetrics().length).toBe(metricsBefore);
  });

  it('chat panel submit appends a turn (one bubble per ChatTurn)', () => {
    render(<CustomerRoute />);
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'extract supplier + PO' } });
    fireEvent.click(submit);
    // After the click, the chat-empty placeholder is gone and one bubble exists.
    expect(screen.queryByTestId('customer-chat-panel-empty')).toBeNull();
    expect(screen.getByTestId('chat-bubble-t::1')).toBeTruthy();
  });
});
