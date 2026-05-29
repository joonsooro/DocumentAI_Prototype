/**
 * F-11 — Customer Workspace route (Cycle 2 · merged Compile Agent rewire).
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
 *     the merged Compile Agent (F-04 / A17) returns action='compile'
 *     or 'recompile'.
 *   - D3 Readiness footer: Save as draft + Confirm & process,
 *     both non-destructive (HAPPY-10).
 *
 * Cycle 2 (2026-05-28) rewire: every chat submit calls postCompile
 * with the accumulated ConversationState. The response carries a
 * CompileAgentDecision (5-action discriminated union per A17). The
 * route branches on decision.action:
 *   - compile / recompile → build CompiledConfiguration from payload
 *     (carrying A18 extractionSystemPrompt), run simulateDocumentRun,
 *     postCapability + postReadiness for auxiliary panels.
 *   - clarify → append clarification_question bubble.
 *   - capability_class_question → store pendingSignal on
 *     ConversationState, append notify_team_question bubble; chat
 *     surfaces an inline yes/no consent affordance (F-31 / D6).
 *   - success_summary → append success_summary bubble.
 *
 * The deleted F-28 router agent and its regex shortcut +
 * runExtractionChain helper are gone — the merged agent handles all
 * paths in a single call per turn.
 *
 * ProductSignal consent: on user 'yes' click the route appends a
 * 'yes' ChatTurn and invokes _writeProvisionalSignal (NOT
 * governProductSignals; that is F-09's cluster-promotion layer). The
 * data-layer guard in _writeProvisionalSignal rejects writes without
 * the awaiting_notify_decision status AND last-user-turn YES_RE pair
 * per N9 / RED-3.
 */
import { useEffect, useState } from 'react';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  projectCapabilitiesForCustomerSurface,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import {
  getCustomerSession,
  subscribe as subscribeCustomerSession,
  updateCustomerSession,
} from '@runtime/customerSessionStore';
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
  clearPendingSignal,
  recordCompiledConfig,
  setPendingSignal,
} from '@domain/chatReducer';
import type {
  ChatTurn,
  CompileAgentDecision,
  CompiledConfiguration,
  ConversationState,
  CustomerIntent,
} from '@domain/types';
import {
  postCompile,
  postCapability,
  postReadiness,
} from '@components/customer/agentClient';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import { _writeProvisionalSignal } from '@domain/writeProvisionalSignal';
import { _appendApprovedSignalForF09 } from '@domain/submitCorrection';
import { isPromptDisplayIntent } from '@domain/promptDisplayIntent';
import { DAEJOO_PDF_URL } from '@data/assets';

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
}

/**
 * Synthesize a CustomerIntent from the latest user turn. The merged
 * Compile Agent reads the full ConversationState, but the downstream
 * capability + readiness agents still take a CustomerIntent — so the
 * route fabricates one from the conversation's latest user message.
 */
function synthesizeIntent(conversation: ConversationState): CustomerIntent {
  const lastUserTurn = [...conversation.turns].reverse().find((t) => t.role === 'user');
  const raw = lastUserTurn?.content ?? '';
  return Object.freeze({
    id: `intent::${conversation.id}::${conversation.turns.length}`,
    raw,
    documentType: 'commercial_invoice',
    capturedAt: new Date().toISOString(),
  });
}

function buildCompiledConfiguration(
  intent: CustomerIntent,
  decision: Extract<CompileAgentDecision, { action: 'compile' | 'recompile' }>,
  versionIdx: number,
): CompiledConfiguration {
  return Object.freeze({
    id: `cfg::${intent.id}::v${versionIdx}`,
    intentId: intent.id,
    schema: decision.schema,
    processingMode: decision.processingMode,
    source: 'aiCore' as const,
    templateUsed: false as const,
    compiledAt: new Date().toISOString(),
    extractionSystemPrompt: decision.extractionSystemPrompt,
  });
}

export default function CustomerRoute({
  initialViewModel = EMPTY_CUSTOMER_VIEW_MODEL,
}: CustomerRouteProps) {
  // SF #2d — session-critical state lives in customerSessionStore so it
  // survives SPA nav-away/-back (the route component unmounts on
  // navigation; React useState would be discarded). The component reads
  // a snapshot on mount, subscribes for re-render on every store change,
  // and pushes mutations through updateCustomerSession. Transient UI
  // state (stage/requestError/toast) stays as local useState — it has
  // no nav-survival contract.
  //
  // initialViewModel seeds the store ONLY when the route is mounted
  // with the store still in its initial-empty state AND a non-default
  // initialViewModel was supplied. This preserves the legacy test/eval
  // ergonomic of `render(<CustomerRoute initialViewModel={…} />)` while
  // never trampling state the operator has already built up.
  const [snapshot, setSnapshot] = useState(() => {
    const current = getCustomerSession();
    if (initialViewModel !== EMPTY_CUSTOMER_VIEW_MODEL && current.viewModel === EMPTY_CUSTOMER_VIEW_MODEL) {
      updateCustomerSession((prev) => ({ ...prev, viewModel: initialViewModel }));
      return getCustomerSession();
    }
    return current;
  });
  useEffect(() => {
    const unsub = subscribeCustomerSession(() => setSnapshot(getCustomerSession()));
    return unsub;
  }, []);
  const { conversation, viewModel: vm, extractedRun, uploadedFile } = snapshot;

  const [stage, setStage] = useState<LoadingStage>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function nextTurnIdFromCounter(currentCounter: number): { id: string; counter: number } {
    const counter = currentCounter + 1;
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

  /**
   * Cycle 3 SF (HAPPY-17 non-terminal) — emit a prompt_display bubble
   * if the user's latest turn is a prompt-display intent AND a
   * configuration with a non-empty A18 extractionSystemPrompt exists.
   * Called from every non-terminal action branch (compile, recompile,
   * clarify) so the customer sees the live prompt regardless of which
   * branch the merged Compile Agent picked.
   *
   * The detection uses the same isPromptDisplayIntent helper that the
   * COMPILE_SYSTEM_PROMPT enumerates in its FORBIDDEN success_summary
   * triggers — single source of truth across the agent prompt and the
   * route per the SF brief.
   *
   * Prefers vm.configuration.extractionSystemPrompt; falls back to
   * the live decision payload's extractionSystemPrompt when the agent
   * routed via action='compile'/'recompile' on this turn (the vm
   * hasn't been updated yet inside the same handler call).
   */
  function maybeAppendPromptDisplay(
    prev: ConversationState,
    counter: number,
    userMessage: string,
    candidatePrompt: string | null,
  ): { state: ConversationState; counter: number } {
    if (!isPromptDisplayIntent(userMessage)) {
      return { state: prev, counter };
    }
    // Read configuration from the store (not the React closure) so the
    // value reflects mutations applied within this async handler before
    // the React re-render runs.
    const liveConfig = getCustomerSession().viewModel.configuration;
    const prompt =
      (candidatePrompt && candidatePrompt.length > 0
        ? candidatePrompt
        : liveConfig?.extractionSystemPrompt) ?? '';
    if (prompt.length === 0) {
      return { state: prev, counter };
    }
    return appendAssistantBubble(prev, counter, 'prompt_display', prompt);
  }

  async function runCapabilityAndReadiness(
    intent: CustomerIntent,
    configuration: CompiledConfiguration,
  ): Promise<void> {
    setStage('capability');
    const capResp = await postCapability({ intent, configuration });
    if (capResp.kind === 'success') {
      const assessments = projectCapabilitiesForCustomerSurface(capResp.assessments);
      updateCustomerSession((prev) => ({
        ...prev,
        viewModel: { ...prev.viewModel, assessments },
      }));
    } else {
      updateCustomerSession((prev) => ({
        ...prev,
        viewModel: {
          ...prev.viewModel,
          clarifications: [...prev.viewModel.clarifications, capResp.clarification],
        },
      }));
    }

    setStage('readiness');
    const readyResp = await postReadiness({ intent, configuration });
    if (readyResp.kind === 'success') {
      updateCustomerSession((prev) => ({
        ...prev,
        viewModel: {
          ...prev.viewModel,
          readiness: readyResp.readiness,
          clarifications: [...prev.viewModel.clarifications, ...readyResp.clarifications],
        },
      }));
    } else {
      updateCustomerSession((prev) => ({
        ...prev,
        viewModel: {
          ...prev.viewModel,
          clarifications: [...prev.viewModel.clarifications, readyResp.clarification],
        },
      }));
    }
  }

  async function handleChatSubmit(content: string): Promise<void> {
    setRequestError(null);

    // Read the latest conversation + turnCounter from the store so the
    // handler is robust against React closure staleness across awaits.
    const startSnap = getCustomerSession();
    const startCounter = startSnap.turnCounter;
    const startConversation = startSnap.conversation;

    const { id: userTurnId, counter: counterAfterUser } = nextTurnIdFromCounter(startCounter);
    const userTurn: ChatTurn = {
      id: userTurnId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      kind: 'message',
    };
    let conv = applyChatTurn(startConversation, userTurn);
    let counter = counterAfterUser;
    updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));

    try {
      setStage('compile');
      const compileResp = await postCompile({ conversation: conv });

      if (compileResp.kind === 'failure') {
        updateCustomerSession((prev) => ({
          ...prev,
          viewModel: {
            ...prev.viewModel,
            clarifications: [...prev.viewModel.clarifications, compileResp.clarification],
          },
        }));
        const fail = appendAssistantBubble(
          conv,
          counter,
          'message',
          `The compile agent reported a failure: ${compileResp.clarification.operatorFacingError ?? 'see clarification queue'}.`,
        );
        conv = fail.state;
        counter = fail.counter;
        updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
        return;
      }

      const decision = compileResp.decision;
      switch (decision.action) {
        case 'compile':
        case 'recompile': {
          const intent = synthesizeIntent(conv);
          const versionIdx = conv.compiledConfigVersionRefs.length + 1;
          const configuration = buildCompiledConfiguration(intent, decision, versionIdx);
          const documentRun = simulateDocumentRun(DAEJOO_PDF_URL, configuration);
          updateCustomerSession((prev) => ({
            ...prev,
            viewModel: { ...prev.viewModel, intent, configuration },
            extractedRun: documentRun,
          }));

          const announce = appendAssistantBubble(
            conv,
            counter,
            'recompile_announcement',
            decision.action === 'compile'
              ? 'Compiling configuration from your intent.'
              : 'Updating configuration with the new fields.',
          );
          conv = recordCompiledConfig(announce.state, configuration.id);
          counter = announce.counter;
          // Cycle 3 SF (HAPPY-17 non-terminal): if the user's latest
          // turn asked to see the prompt, emit a prompt_display bubble
          // from the fresh extractionSystemPrompt.
          const withPrompt = maybeAppendPromptDisplay(
            conv,
            counter,
            content,
            decision.extractionSystemPrompt,
          );
          conv = withPrompt.state;
          counter = withPrompt.counter;
          updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));

          await runCapabilityAndReadiness(intent, configuration);
          break;
        }
        case 'clarify': {
          const announce = appendAssistantBubble(
            conv,
            counter,
            'clarification_question',
            decision.clarificationContent,
          );
          conv = announce.state;
          counter = announce.counter;
          // Cycle 3 SF (HAPPY-17 non-terminal): the agent may route a
          // prompt-display ask to 'clarify' with a short
          // acknowledgement. The route still emits the prompt bubble
          // from the stored A18 extractionSystemPrompt so the customer
          // sees the prompt body. Conversation stays open (status
          // unchanged) — clarify is non-terminal by construction.
          const withPrompt = maybeAppendPromptDisplay(
            conv,
            counter,
            content,
            null,
          );
          conv = withPrompt.state;
          counter = withPrompt.counter;
          updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
          break;
        }
        case 'capability_class_question': {
          conv = setPendingSignal(conv, {
            description: decision.pendingSignalDescription,
            capabilitySurfaceCitation: decision.capabilitySurfaceCitation,
          });
          // Compose the bubble content: confirmation question + gap
          // description + citation. Free-form prose grounded in the
          // curated capability surface per A2 amendment / A17.
          const bubbleContent = `${decision.capabilityGapDescription}\n\nBased on the Document AI capability surface (${decision.capabilitySurfaceCitation}), this is not part of the product's current scope. ${decision.confirmationQuestion}`;
          const announce = appendAssistantBubble(
            conv,
            counter,
            'notify_team_question',
            bubbleContent,
          );
          conv = announce.state;
          counter = announce.counter;
          updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
          break;
        }
        case 'success_summary': {
          const announce = appendAssistantBubble(
            conv,
            counter,
            'success_summary',
            decision.summaryContent,
          );
          conv = announce.state;
          counter = announce.counter;
          updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
          break;
        }
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

  /**
   * D6 / F-31 consent handler. The ChatPanel renders yes/no buttons
   * under the notify_team_question bubble; on click, this handler
   * appends a user 'yes' or 'no' ChatTurn and either invokes
   * _writeProvisionalSignal (yes) or clears the pendingSignal (no).
   */
  function handleConsent(yes: boolean): void {
    // Read the latest snapshot from the store; pendingSignal must be
    // present (the consent affordance only renders when it is).
    const startSnap = getCustomerSession();
    const pending = startSnap.conversation.pendingSignal;
    if (!pending) return;

    const { id: userTurnId, counter: counterAfterUser } = nextTurnIdFromCounter(startSnap.turnCounter);
    const userTurn: ChatTurn = {
      id: userTurnId,
      role: 'user',
      content: yes ? 'yes' : 'no',
      timestamp: new Date().toISOString(),
      kind: 'message',
    };
    let conv = applyChatTurn(startSnap.conversation, userTurn);
    let counter = counterAfterUser;

    if (yes) {
      // N9 / RED-3 — _writeProvisionalSignal guards at the data layer:
      // status === 'awaiting_notify_decision' AND last user turn matches
      // /^\s*yes\b/i. Both invariants hold here by construction.
      const decision = _writeProvisionalSignal(conv, {
        id: `sig::${conv.id}::${counter}`,
        signalType: 'unsupported_free_text_business_condition',
        category: 'commercial_invoice / out-of-scope capability',
        intentFragment: pending.description,
        suggestedProductArea: pending.capabilitySurfaceCitation,
        documentType: 'commercial_invoice',
      });

      if (decision.rejected) {
        const fail = appendAssistantBubble(
          conv,
          counter,
          'message',
          `Signal write rejected: ${decision.reason}`,
        );
        conv = fail.state;
        counter = fail.counter;
        updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
        return;
      }

      // F-31 append site — _writeProvisionalSignal returns the shaped signal;
      // the route is responsible for the store write (per
      // src/domain/writeProvisionalSignal.ts module doc: "the function itself
      // does not touch the store — A6's _appendApprovedSignalForF09 is still
      // the only writer"). Without this call the confirmation bubble fires
      // but /internal sees nothing — exactly the Cycle 4 §6 step-7 regression.
      _appendApprovedSignalForF09(decision.signal);

      const confirm = appendAssistantBubble(
        conv,
        counter,
        'notify_team_confirmation',
        'Thank you. The SAP product team has been notified about this issue.',
      );
      conv = clearPendingSignal(confirm.state);
      counter = confirm.counter;
    } else {
      const confirm = appendAssistantBubble(
        conv,
        counter,
        'notify_team_confirmation',
        'No problem. The SAP product team will not be notified about this issue.',
      );
      conv = clearPendingSignal(confirm.state);
      counter = confirm.counter;
    }

    updateCustomerSession((prev) => ({ ...prev, conversation: conv, turnCounter: counter }));
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
            onUpload={(f) => {
              updateCustomerSession((prev) => ({ ...prev, uploadedFile: f }));
              // If a configuration already exists, re-run capability +
              // readiness so the demo never sits idle on a second drop.
              // When there is no configuration yet, only the
              // PdfViewerPanel + upload-announcement update (SF-1). Read
              // the live vm from the store so a recent recompile is
              // not missed.
              const live = getCustomerSession().viewModel;
              if (live.configuration && live.intent) {
                void runCapabilityAndReadiness(live.intent, live.configuration);
              }
            }}
            onDocumentRun={(run) => updateCustomerSession((prev) => ({ ...prev, extractedRun: run }))}
          />
          <PdfViewerPanel hasUpload={uploadedFile !== null} />
          <ExtractedFieldsPanel run={extractedRun} />
        </div>
        <div style={paneStyle}>
          <ChatPanel
            conversation={conversation}
            onSubmitTurn={handleChatSubmitSync}
            onConsent={handleConsent}
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
