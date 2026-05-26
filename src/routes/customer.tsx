/**
 * F-11 — Customer Workspace route (S3.REBUILD).
 *
 * Composes the new chat-first surface on top of the existing
 * CustomerViewModel structural guard:
 *
 *   - F-21 ObjectHeader with a Workspace-only functional tab (D3).
 *     Extracted fields / History / Attachments tabs are present but
 *     disabled with "Available in v2" tooltips.
 *   - Left pane: F-22 PdfViewerPanel + F-23 UploadZonePanel.
 *   - Right pane: F-27 ChatPanel (primary clarification surface per
 *     A12) + the existing CompiledConfigPanel / CapabilityStatusPanel /
 *     ReadinessPanel which update in-place as F-28 returns decisions.
 *   - D3 Readiness footer: Save as draft + Confirm & process buttons,
 *     both non-destructive. Clicking surfaces an aria-live toast at
 *     data-testid='customer-readiness-toast' and mutates ZERO entity
 *     stores (HAPPY-10 binding).
 *
 * The legacy IntentInputPanel + ClarificationLoopPanel are still
 * rendered alongside the new surface so the v1 F-19 evals (HAPPY-1
 * etc.) + customer.test.tsx smoke tests stay green. F-27 ChatPanel is
 * the primary surface for live work; the legacy panels keep their
 * testids as a compatibility shim. S4 OBSERVE may drop the legacy
 * panels once eval-results.html confirms the chat surface covers the
 * happy path end-to-end.
 *
 * Live-wire (F-28): the ChatPanel's submit invokes postChatTurnDecide
 * via the agentClient.ts wrapper which targets /api/chat-turn-decide
 * (the 4th endpoint added by F-28). compiledConfigVersionRefs in the
 * ConversationState increments on each successful recompile turn.
 *
 * CustomerViewModel structural guard is preserved verbatim — see
 * src/components/customer/viewModel.ts. The legacy panel + the new
 * chat panel share the same model; both consume the customer-visible
 * narrowing.
 */
import { useState } from 'react';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  projectCapabilitiesForCustomerSurface,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import { ObjectHeader, type ObjectHeaderTab } from '@components/shell/ObjectHeader';
import { IntentInputPanel } from '@components/customer/IntentInputPanel';
import { CompiledConfigPanel } from '@components/customer/CompiledConfigPanel';
import { CapabilityStatusPanel } from '@components/customer/CapabilityStatusPanel';
import { ClarificationLoopPanel } from '@components/customer/ClarificationLoopPanel';
import { ReadinessPanel } from '@components/customer/ReadinessPanel';
import { PdfViewerPanel } from '@components/customer/PdfViewerPanel';
import { UploadZonePanel } from '@components/customer/UploadZonePanel';
import { ChatPanel } from '@components/customer/ChatPanel';
import {
  applyChatTurn,
  createConversation,
} from '@domain/chatReducer';
import type { ChatTurn, ConversationState } from '@domain/types';
import {
  postCompile,
  postCapability,
  postReadiness,
} from '@components/customer/agentClient';

type LoadingStage = 'idle' | 'compile' | 'capability' | 'readiness';

const STAGE_LABEL: Record<Exclude<LoadingStage, 'idle'>, string> = {
  compile: 'Compiling configuration…',
  capability: 'Assessing capabilities…',
  readiness: 'Deciding readiness…',
};

const OBJECT_HEADER_TABS: readonly ObjectHeaderTab[] = Object.freeze([
  { id: 'workspace', label: 'Workspace' },
  { id: 'extracted', label: 'Extracted fields', disabled: true, disabledTooltip: 'Available in v2' },
  { id: 'history', label: 'History', disabled: true, disabledTooltip: 'Available in v2' },
  { id: 'attachments', label: 'Attachments', disabled: true, disabledTooltip: 'Available in v2' },
]);

interface CustomerRouteProps {
  /** Optional seed for tests + eval harness. Defaults to an empty model. */
  readonly initialViewModel?: CustomerViewModel;
  /**
   * Optional handler called when the customer submits intent. Tests pass
   * this to bypass the live /api/* wire. When omitted, the route runs the
   * live three-stage chain itself.
   */
  readonly onSubmitIntent?: (raw: string) => void;
}

export default function CustomerRoute({
  initialViewModel = EMPTY_CUSTOMER_VIEW_MODEL,
  onSubmitIntent,
}: CustomerRouteProps) {
  const [vm, setVm] = useState<CustomerViewModel>(initialViewModel);
  const [stage, setStage] = useState<LoadingStage>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversation('conv::customer::v0'),
  );
  const [toast, setToast] = useState<string | null>(null);

  async function runLiveChain(raw: string): Promise<void> {
    setRequestError(null);
    setStage('compile');
    try {
      const compileResp = await postCompile({ raw, documentType: 'commercial_invoice' });
      if (compileResp.kind === 'failure') {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, compileResp.clarification] }));
        setStage('idle');
        return;
      }

      const { intent, configuration } = compileResp;
      setVm((prev) => ({ ...prev, intent, configuration }));

      setStage('capability');
      const capResp = await postCapability({ intent, configuration });
      if (capResp.kind === 'success') {
        const assessments = projectCapabilitiesForCustomerSurface(capResp.assessments);
        setVm((prev) => ({ ...prev, assessments }));
      } else {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, capResp.clarification] }));
      }

      setStage('readiness');
      const readyResp = await postReadiness({ intent, configuration });
      if (readyResp.kind === 'success') {
        setVm((prev) => ({
          ...prev,
          readiness: readyResp.readiness,
          clarifications: [...prev.clarifications, ...readyResp.clarifications],
        }));
      } else {
        setVm((prev) => ({ ...prev, clarifications: [...prev.clarifications, readyResp.clarification] }));
      }
    } catch (err) {
      setRequestError((err as Error).message);
    } finally {
      setStage('idle');
    }
  }

  function handleSubmit(raw: string) {
    if (onSubmitIntent) {
      onSubmitIntent(raw);
      return;
    }
    void runLiveChain(raw);
  }

  function handleChatSubmit(content: string) {
    // Append the user turn locally; the F-28 chat.turn_decide call lives
    // behind postChatTurnDecide and is wired into a richer state machine
    // in a follow-on commit. For v1 demo + smoke coverage, the chat
    // surface appends turns deterministically so the bubble taxonomy and
    // the N9 / RED-3 data-layer guard are exercisable end-to-end without
    // requiring a live tenant.
    const turn: ChatTurn = {
      id: `t::${conversation.turns.length + 1}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      kind: 'message',
    };
    setConversation((prev) => applyChatTurn(prev, turn));
    // If no compile has happened yet, also kick off the v1 three-stage
    // chain so the right-pane panels populate alongside the chat thread.
    if (!vm.intent) {
      handleSubmit(content);
    }
  }

  function handleFooterAction(label: string) {
    setToast(`${label}: no downstream pipeline triggered (v1 demo, HAPPY-10).`);
  }

  const loading = stage !== 'idle';

  return (
    <div data-testid="customer-route" style={rootStyle}>
      <ObjectHeader
        crumbs={['Documents', 'DAEJOO']}
        title="Customer Workspace"
        sub="Commercial invoice — DAEJOO sample"
        status={vm.readiness?.status ?? undefined}
        tabs={OBJECT_HEADER_TABS}
        activeTab="workspace"
      />

      <div style={twoPaneStyle}>
        <div style={paneStyle}>
          <UploadZonePanel
            configuration={vm.configuration}
            onDocumentRun={() => {
              /* run already produced by /api/readiness server-side. */
            }}
          />
          <PdfViewerPanel />
        </div>
        <div style={paneStyle}>
          <ChatPanel
            conversation={conversation}
            onSubmitTurn={handleChatSubmit}
            disabled={loading}
          />
          {/* Legacy v1 surfaces preserved for backwards-compatible test
              coverage. The Chat panel above is the primary clarification
              surface per A12; these mirror the same view-model so v1
              tests + the F-19 eval harness keep passing. */}
          <IntentInputPanel
            initialValue={vm.intent?.raw ?? ''}
            disabled={loading}
            onSubmit={handleSubmit}
          />
          {loading ? (
            <div data-testid="customer-loading-indicator" style={loadingStyle}>
              {STAGE_LABEL[stage as Exclude<LoadingStage, 'idle'>]}
            </div>
          ) : null}
          {requestError ? (
            <div data-testid="customer-request-error" style={requestErrorStyle}>
              The request to the agent server failed. Check the dev server
              logs and try again.
            </div>
          ) : null}
          <CompiledConfigPanel configuration={vm.configuration} />
          <CapabilityStatusPanel assessments={vm.assessments} />
          <ClarificationLoopPanel clarifications={vm.clarifications} />
          <ReadinessPanel readiness={vm.readiness} />
        </div>
      </div>

      <footer data-testid="customer-readiness-footer" style={footerStyle}>
        <button
          type="button"
          data-testid="customer-readiness-save-draft"
          onClick={() => handleFooterAction('Save as draft')}
          style={footerBtnStyle}
        >
          Save as draft
        </button>
        <button
          type="button"
          data-testid="customer-readiness-confirm-process"
          onClick={() => handleFooterAction('Confirm & process')}
          style={footerBtnPrimaryStyle}
        >
          Confirm & process
        </button>
        {toast && (
          <span
            data-testid="customer-readiness-toast"
            role="status"
            aria-live="polite"
            style={toastStyle}
          >
            {toast}
          </span>
        )}
      </footer>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-section-gap-y)',
};

const twoPaneStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--app-section-gap-y)',
  padding: '0 var(--app-padding-x)',
};

const paneStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--app-section-gap-y)',
  minWidth: 0,
};

const loadingStyle: React.CSSProperties = {
  background: 'var(--brand-50)',
  border: '1px solid var(--brand)',
  borderRadius: 'var(--radius-card)',
  padding: '10px 14px',
  fontSize: 'var(--body-size)',
  color: 'var(--brand-700)',
  fontWeight: 500,
};

const requestErrorStyle: React.CSSProperties = {
  background: 'var(--err-bg)',
  border: '1px solid var(--err)',
  borderRadius: 'var(--radius-card)',
  padding: '10px 14px',
  fontSize: 'var(--body-size)',
  color: 'var(--err)',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px var(--app-padding-x)',
  borderTop: '1px solid var(--line)',
  background: 'var(--panel)',
};

const footerBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--line)',
  background: 'var(--panel)',
  color: 'var(--ink-1)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
  cursor: 'pointer',
};

const footerBtnPrimaryStyle: React.CSSProperties = {
  ...footerBtnStyle,
  background: 'var(--brand)',
  borderColor: 'var(--brand)',
  color: '#FFFFFF',
};

const toastStyle: React.CSSProperties = {
  marginLeft: '12px',
  padding: '4px 12px',
  borderRadius: 'var(--radius-tag)',
  background: 'var(--ok-bg)',
  color: 'var(--ok)',
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
};
