/**
 * F-11 — Customer Workspace route (S5 SF · chat-wiring fix).
 *
 * Composes the chat-first surface on top of the existing
 * CustomerViewModel structural guard:
 *
 *   - F-21 ObjectHeader with a Workspace-only functional tab (D3).
 *   - Left pane: F-23 UploadZonePanel + F-22 PdfViewerPanel (gated on
 *     upload, SF-1) + ExtractedFieldsPanel (SF-2).
 *   - Right pane: F-27 ChatPanel as the SINGLE clarification surface
 *     per A12. The prior IntentInputPanel + ClarificationLoopPanel
 *     split is removed — no element matches
 *     data-testid='customer-intent-textarea' or
 *     data-testid='customer-clarification-loop' on /customer.
 *   - CompiledConfigPanel / CapabilityStatusPanel / ReadinessPanel
 *     remain as auxiliary status displays that update in-place when
 *     F-28 chat.turn_decide returns action:'recompile'.
 *   - D3 Readiness footer: Save as draft + Confirm & process,
 *     both non-destructive (HAPPY-10).
 *
 * Live-wire: every chat submit calls postChatTurnDecide via
 * src/components/customer/agentClient.ts. On action:'recompile' the
 * route invokes postCompile + postCapability + postReadiness (no
 * reimplementation — F-11 acceptance forbids that). On action:
 * 'capability_class_question' the conversation transitions to
 * 'awaiting_notify_decision' and the notify-team question bubble is
 * appended (N9 governance still enforced at the signal-write layer
 * in src/domain/writeProvisionalSignal.ts).
 */
import { useState } from 'react';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  projectCapabilitiesForCustomerSurface,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import { ObjectHeader, type ObjectHeaderTab } from '@components/shell/ObjectHeader';
import { CompiledConfigPanel } from '@components/customer/CompiledConfigPanel';
import { CapabilityStatusPanel } from '@components/customer/CapabilityStatusPanel';
import { ReadinessPanel } from '@components/customer/ReadinessPanel';
import { PdfViewerPanel } from '@components/customer/PdfViewerPanel';
import { UploadZonePanel } from '@components/customer/UploadZonePanel';
import { ExtractedFieldsPanel } from '@components/customer/ExtractedFieldsPanel';
import { ChatPanel } from '@components/customer/ChatPanel';
import {
  applyChatTurn,
  createConversation,
  recordCompiledConfig,
} from '@domain/chatReducer';
import type { ChatTurn, ConversationState, DocumentRun } from '@domain/types';
import type { TurnDecision } from '@domain/chatTurnDecide';
import {
  postCompile,
  postCapability,
  postReadiness,
  postChatTurnDecide,
} from '@components/customer/agentClient';

type LoadingStage = 'idle' | 'turn_decide' | 'compile' | 'capability' | 'readiness';

const STAGE_LABEL: Record<Exclude<LoadingStage, 'idle'>, string> = {
  turn_decide: 'Thinking…',
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
}

export default function CustomerRoute({
  initialViewModel = EMPTY_CUSTOMER_VIEW_MODEL,
}: CustomerRouteProps) {
  const [vm, setVm] = useState<CustomerViewModel>(initialViewModel);
  const [stage, setStage] = useState<LoadingStage>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversation('conv::customer::v0'),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [turnCounter, setTurnCounter] = useState<number>(0);
  // S5 SF-1: gates the PdfViewerPanel. Until UploadZonePanel fires its
  // onUpload callback, the viewer renders an empty-state (no permanent
  // DAEJOO preview). Fixes the regression where the preview was always
  // visible regardless of upload, contradicting D2's honest-UI posture.
  const [uploadedFile, setUploadedFile] = useState<{ name: string } | null>(null);
  // S5 SF-2: captures the F-03 DocumentRun emitted by UploadZonePanel
  // and feeds it to ExtractedFieldsPanel. The run is the EXISTING mock
  // extractor output (N6 preserved — no live OCR, fixture-backed).
  const [extractedRun, setExtractedRun] = useState<DocumentRun | null>(null);

  function nextTurnId(): { id: string; counter: number } {
    const counter = turnCounter + 1;
    return { id: `t::${counter}`, counter };
  }

  function appendAssistantBubble(
    prev: ConversationState,
    counter: number,
    kind: ChatTurn['kind'],
    content: string,
  ): { state: ConversationState; counter: number } {
    const nextCounter = counter + 1;
    const turn: ChatTurn = {
      id: `t::${nextCounter}`,
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      kind,
    };
    return { state: applyChatTurn(prev, turn), counter: nextCounter };
  }

  async function runCompileChain(
    raw: string,
    convAtRecompile: ConversationState,
    counterAtRecompile: number,
  ): Promise<{ conv: ConversationState; counter: number }> {
    let conv = convAtRecompile;
    let counter = counterAtRecompile;

    setStage('compile');
    const compileResp = await postCompile({ raw, documentType: 'commercial_invoice' });
    if (compileResp.kind === 'failure') {
      setVm((prev) => ({
        ...prev,
        clarifications: [...prev.clarifications, compileResp.clarification],
      }));
      const failBubble = appendAssistantBubble(
        conv,
        counter,
        'message',
        `The compile agent reported a failure: ${compileResp.clarification.operatorFacingError ?? 'see clarification queue'}.`,
      );
      conv = failBubble.state;
      counter = failBubble.counter;
      return { conv, counter };
    }

    const { intent, configuration } = compileResp;
    setVm((prev) => ({ ...prev, intent, configuration }));
    conv = recordCompiledConfig(conv, configuration.id);

    setStage('capability');
    const capResp = await postCapability({ intent, configuration });
    if (capResp.kind === 'success') {
      const assessments = projectCapabilitiesForCustomerSurface(capResp.assessments);
      setVm((prev) => ({ ...prev, assessments }));
    } else {
      setVm((prev) => ({
        ...prev,
        clarifications: [...prev.clarifications, capResp.clarification],
      }));
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
      setVm((prev) => ({
        ...prev,
        clarifications: [...prev.clarifications, readyResp.clarification],
      }));
    }
    return { conv, counter };
  }

  function decisionBubble(
    decision: TurnDecision,
  ): { kind: ChatTurn['kind']; content: string } {
    switch (decision.action) {
      case 'clarify':
        return { kind: 'clarification_question', content: decision.clarificationContent };
      case 'recompile':
        return { kind: 'recompile_announcement', content: decision.recompileSummary };
      case 'capability_class_question':
        return { kind: 'notify_team_question', content: decision.questionContent };
      case 'success_summary':
        return { kind: 'success_summary', content: decision.summaryContent };
    }
  }

  async function handleChatSubmit(content: string): Promise<void> {
    setRequestError(null);

    const { id: userTurnId, counter: counterAfterUser } = nextTurnId();
    const userTurn: ChatTurn = {
      id: userTurnId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      kind: 'message',
    };
    let conv = applyChatTurn(conversation, userTurn);
    let counter = counterAfterUser;
    setConversation(conv);
    setTurnCounter(counter);

    try {
      setStage('turn_decide');
      const decideResp = await postChatTurnDecide({ conversation: conv });

      if (decideResp.kind === 'failure') {
        setVm((prev) => ({
          ...prev,
          clarifications: [...prev.clarifications, decideResp.clarification],
        }));
        const fail = appendAssistantBubble(
          conv,
          counter,
          'message',
          `The chat agent reported a failure: ${decideResp.clarification.operatorFacingError ?? 'see clarification queue'}.`,
        );
        conv = fail.state;
        counter = fail.counter;
        setConversation(conv);
        setTurnCounter(counter);
        return;
      }

      const decision = decideResp.decision;
      const bubble = decisionBubble(decision);
      const announced = appendAssistantBubble(conv, counter, bubble.kind, bubble.content);
      conv = announced.state;
      counter = announced.counter;
      setConversation(conv);
      setTurnCounter(counter);

      if (decision.action === 'recompile') {
        const recompiled = await runCompileChain(content, conv, counter);
        conv = recompiled.conv;
        counter = recompiled.counter;
        setConversation(conv);
        setTurnCounter(counter);
      }
    } catch (err) {
      setRequestError((err as Error).message);
    } finally {
      setStage('idle');
    }
  }

  function handleChatSubmitSync(content: string): void {
    void handleChatSubmit(content);
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
            onUpload={(f) => setUploadedFile(f)}
            onDocumentRun={(run) => setExtractedRun(run)}
          />
          <PdfViewerPanel hasUpload={uploadedFile !== null} />
          <ExtractedFieldsPanel run={extractedRun} />
        </div>
        <div style={paneStyle}>
          <ChatPanel
            conversation={conversation}
            onSubmitTurn={handleChatSubmitSync}
            disabled={loading}
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
