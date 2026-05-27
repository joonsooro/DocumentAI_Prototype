// @vitest-environment jsdom
/**
 * S5 SF-3 — re-extract regression tests.
 *
 * The user-reported symptom was: "extract from default compile" worked
 * once, then silently no-op'd on subsequent attempts. Root cause: the
 * live haiku-class chat.turn_decide classifier drifts to
 * success_summary / clarify on repeated extract requests, so the
 * route's runCompileChain never fired.
 *
 * SF-3 fix: a route-side deterministic RE_EXTRACT_PATTERN shortcut
 * runs capability + readiness against the EXISTING configuration
 * before the postChatTurnDecide call. Closed A12 / A14 action set is
 * unchanged — chatTurnDecide.ts and its system prompt are untouched.
 * The bubble kind reused is 'recompile_announcement', not a new kind.
 *
 * Tests stub the four agent-client POST functions so the assertions
 * read like a contract over which endpoints fire in which scenarios.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Hoisted mock factories — these must be declared BEFORE the
// CustomerRoute import so vi.mock can intercept the named exports.
const postCompileMock = vi.fn();
const postCapabilityMock = vi.fn();
const postReadinessMock = vi.fn();
const postChatTurnDecideMock = vi.fn();

vi.mock('@components/customer/agentClient', () => ({
  postCompile: (...args: unknown[]) => postCompileMock(...args),
  postCapability: (...args: unknown[]) => postCapabilityMock(...args),
  postReadiness: (...args: unknown[]) => postReadinessMock(...args),
  postChatTurnDecide: (...args: unknown[]) => postChatTurnDecideMock(...args),
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

// Schema field name MUST match the daejoo fixture so simulateDocumentRun
// returns a non-empty extraction. 'supplier' is row 1 of the fixture.
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

describe('S5 SF-3 — deterministic re-extract trigger', () => {
  beforeEach(() => {
    cleanup();
    postCompileMock.mockReset();
    postCapabilityMock.mockReset();
    postReadinessMock.mockReset();
    postChatTurnDecideMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-extract regex shortcut bypasses chat.turn_decide and refreshes extracted fields', async () => {
    postCapabilityMock.mockResolvedValue({ kind: 'success', assessments: [] });
    postReadinessMock.mockResolvedValue({
      kind: 'success',
      readiness: seedReadiness(),
      clarifications: [],
    });
    // The contract: chat.turn_decide MUST NOT be called for an extract
    // phrase. If the shortcut regresses, this throw surfaces the bug.
    postChatTurnDecideMock.mockImplementation(() => {
      throw new Error('postChatTurnDecide must not be called on a re-extract phrase');
    });

    render(<CustomerRoute initialViewModel={seedViewModelWithConfig()} />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'extract from default compile' } });
    fireEvent.click(submit);

    await waitFor(() => expect(postCapabilityMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(postReadinessMock).toHaveBeenCalledTimes(1));

    expect(postChatTurnDecideMock).not.toHaveBeenCalled();
    expect(postCompileMock).not.toHaveBeenCalled();

    // Bubble appears with the recompile_announcement kind (reused, not new).
    const announcement = document.querySelector('[data-turn-kind="recompile_announcement"]');
    expect(announcement).not.toBeNull();

    // Extracted fields panel rendered (not the empty state) — F-03
    // simulateDocumentRun ran client-side against the seeded config.
    await waitFor(() => expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy());
    expect(screen.queryByTestId('customer-extracted-fields-panel-empty')).toBeNull();
  });

  it('non-extract chat message still routes through chat.turn_decide', async () => {
    postChatTurnDecideMock.mockResolvedValue({
      kind: 'success',
      decision: { action: 'success_summary', summaryContent: 'All set.' },
    });

    render(<CustomerRoute initialViewModel={seedViewModelWithConfig()} />);

    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: 'thanks, looks good' } });
    fireEvent.click(submit);

    await waitFor(() => expect(postChatTurnDecideMock).toHaveBeenCalledTimes(1));
    expect(postCapabilityMock).not.toHaveBeenCalled();
    expect(postReadinessMock).not.toHaveBeenCalled();
    expect(postCompileMock).not.toHaveBeenCalled();
  });

  it('upload with an existing configuration triggers runExtractionChain', async () => {
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
    expect(postChatTurnDecideMock).not.toHaveBeenCalled();
    expect(postCompileMock).not.toHaveBeenCalled();

    // SF-1 contract still holds: real viewer mounts after upload.
    expect(screen.getByTestId('customer-pdf-viewer')).toBeTruthy();
    expect(screen.queryByTestId('customer-pdf-viewer-empty')).toBeNull();
    // SF-2 contract: extracted-fields panel is populated.
    expect(screen.getByTestId('customer-extracted-fields-panel')).toBeTruthy();
  });

  it('upload WITHOUT a configuration does NOT call capability/readiness', async () => {
    postCapabilityMock.mockImplementation(() => {
      throw new Error('postCapability must not fire when configuration is null');
    });
    postReadinessMock.mockImplementation(() => {
      throw new Error('postReadiness must not fire when configuration is null');
    });

    render(<CustomerRoute initialViewModel={EMPTY_CUSTOMER_VIEW_MODEL} />);

    fireEvent.drop(screen.getByTestId('customer-upload-zone'));

    // Give any errant promise a tick to surface.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(postCapabilityMock).not.toHaveBeenCalled();
    expect(postReadinessMock).not.toHaveBeenCalled();
    expect(postChatTurnDecideMock).not.toHaveBeenCalled();

    // SF-1 contract: real viewer mounts (upload happened).
    expect(screen.getByTestId('customer-pdf-viewer')).toBeTruthy();
    // SF-2 contract: panel is still in empty-state because no DocumentRun
    // was produced (UploadZonePanel only invokes simulateDocumentRun when
    // configuration is non-null, and the route's onUpload re-fire is
    // guarded on vm.configuration too).
    expect(screen.getByTestId('customer-extracted-fields-panel-empty')).toBeTruthy();
    expect(screen.queryByTestId('customer-extracted-fields-panel')).toBeNull();
  });
});
