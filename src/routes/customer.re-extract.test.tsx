// @vitest-environment jsdom
/**
 * F-11 — Re-extract integration tests (Cycle 2 · merged Compile Agent).
 *
 * The Cycle 2 rewrite REMOVED the prior route-side regex shortcut
 * and the small-model router; the merged Compile Agent now handles
 * re-extract natively by returning action='recompile' from a single
 * /api/compile call. These tests verify:
 *
 *   1. A re-extract chat message ("add tax amount and currency to the
 *      extraction") routes through /api/compile and surfaces a
 *      recompile decision; the configuration updates and the
 *      extracted-fields panel re-renders.
 *   2. A success-summary message routes through /api/compile only;
 *      neither capability nor readiness fire on that branch.
 *   3. An upload onto an existing configuration triggers
 *      runCapabilityAndReadiness (refreshes the auxiliary panels
 *      without re-compiling).
 *   4. An upload WITHOUT a configuration does not trigger
 *      capability/readiness (SF-1 + SF-2 contract preserved).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Hoisted mocks for the three remaining agent-client wrappers.
const postCompileMock = vi.fn();
const postCapabilityMock = vi.fn();
const postReadinessMock = vi.fn();

vi.mock('@components/customer/agentClient', () => ({
  postCompile: (...args: unknown[]) => postCompileMock(...args),
  postCapability: (...args: unknown[]) => postCapabilityMock(...args),
  postReadiness: (...args: unknown[]) => postReadinessMock(...args),
}));

import CustomerRoute from './customer';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import type {
  CompiledConfiguration,
  CustomerIntent,
  ReadinessDecision,
} from '@domain/types';

const seedIntent = (): CustomerIntent => ({
  id: 'intent::test::1',
  raw: 'extract supplier + invoice number for commercial invoices',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-27T00:00:00Z',
});

const seedConfiguration = (): CompiledConfiguration => ({
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
  extractionSystemPrompt: 'You are an extraction agent. Extract supplier.',
});

const seedReadiness = (): ReadinessDecision => ({
  id: 'readiness::test::1',
  documentRunId: 'run::cfg::test::1::/assets/daejoo-invoice.pdf',
  status: 'Ready',
  reasons: [],
  decidedAt: '2026-05-27T00:00:01Z',
});

const seedViewModelWithConfig = (): CustomerViewModel => ({
  ...EMPTY_CUSTOMER_VIEW_MODEL,
  intent: seedIntent(),
  configuration: seedConfiguration(),
});

const RECOMPILE_DECISION = {
  kind: 'success',
  decision: {
    action: 'recompile' as const,
    schema: {
      fields: [
        { name: 'supplier', dataType: 'string', required: true, instruction: 'extract supplier', validation: null, regex: '^.+$', confidenceThreshold: 0.85 },
        { name: 'tax_amount', dataType: 'number', required: true, instruction: 'extract tax', validation: null, regex: null, confidenceThreshold: 0.85 },
        { name: 'currency', dataType: 'string', required: true, instruction: 'extract currency', validation: null, regex: null, confidenceThreshold: 0.85 },
      ],
    },
    processingMode: 'auto_confirm',
    extractionSystemPrompt: 'updated extraction system prompt',
  },
};

describe('F-11 re-extract · Cycle 2 (merged Compile Agent · no regex shortcut)', () => {
  beforeEach(() => {
    cleanup();
    postCompileMock.mockReset();
    postCapabilityMock.mockReset();
    postReadinessMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-extract chat message routes through /api/compile and a recompile decision refreshes the extracted-fields panel", async () => {
    postCompileMock.mockResolvedValue(RECOMPILE_DECISION);
    postCapabilityMock.mockResolvedValue({ kind: 'success', assessments: [] });
    postReadinessMock.mockResolvedValue({
      kind: 'success',
      readiness: seedReadiness(),
      clarifications: [],
    });

    render(<CustomerRoute initialViewModel={seedViewModelWithConfig()} />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'add tax amount and currency to the extraction' } });
    fireEvent.click(submit);

    await waitFor(() => expect(postCompileMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(postCapabilityMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(postReadinessMock).toHaveBeenCalledTimes(1));

    // Bubble appears with the recompile_announcement kind.
    const announcement = document.querySelector('[data-turn-kind="recompile_announcement"]');
    expect(announcement).not.toBeNull();

    // ExtractedFieldsPanel re-rendered (not the empty state).
    await waitFor(() => expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy());
    expect(screen.queryByTestId('customer-extracted-fields-panel-empty')).toBeNull();
  });

  it("a success-summary chat decision goes through /api/compile only; neither capability nor readiness fire", async () => {
    postCompileMock.mockResolvedValue({
      kind: 'success',
      decision: { action: 'success_summary', summaryContent: 'All set.' },
    });

    render(<CustomerRoute initialViewModel={seedViewModelWithConfig()} />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'thanks, looks good' } });
    fireEvent.click(submit);

    await waitFor(() => expect(postCompileMock).toHaveBeenCalledTimes(1));
    expect(postCapabilityMock).not.toHaveBeenCalled();
    expect(postReadinessMock).not.toHaveBeenCalled();
  });

  it("upload with an existing configuration triggers runCapabilityAndReadiness (no recompile)", async () => {
    postCapabilityMock.mockResolvedValue({ kind: 'success', assessments: [] });
    postReadinessMock.mockResolvedValue({
      kind: 'success',
      readiness: seedReadiness(),
      clarifications: [],
    });

    render(<CustomerRoute initialViewModel={seedViewModelWithConfig()} />);

    fireEvent.drop(screen.getByTestId('customer-upload-zone'));

    await waitFor(() => expect(postCapabilityMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(postReadinessMock).toHaveBeenCalledTimes(1));
    expect(postCompileMock).not.toHaveBeenCalled();

    expect(screen.getByTestId('customer-pdf-viewer')).toBeTruthy();
    expect(screen.queryByTestId('customer-pdf-viewer-empty')).toBeNull();
    expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy();
  });

  it("upload WITHOUT a configuration does NOT call capability/readiness", async () => {
    postCapabilityMock.mockImplementation(() => {
      throw new Error('postCapability must not fire when configuration is null');
    });
    postReadinessMock.mockImplementation(() => {
      throw new Error('postReadiness must not fire when configuration is null');
    });

    render(<CustomerRoute initialViewModel={EMPTY_CUSTOMER_VIEW_MODEL} />);

    fireEvent.drop(screen.getByTestId('customer-upload-zone'));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(postCapabilityMock).not.toHaveBeenCalled();
    expect(postReadinessMock).not.toHaveBeenCalled();
    expect(postCompileMock).not.toHaveBeenCalled();

    expect(screen.getByTestId('customer-pdf-viewer')).toBeTruthy();
    expect(screen.getByTestId('customer-extracted-fields-panel-empty')).toBeTruthy();
    expect(screen.queryByTestId('customer-extracted-fields-panel')).toBeNull();
  });
});
