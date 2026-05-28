/**
 * F-27 — ChatPanel.
 *
 * Renders data-testid='customer-chat-panel' with one <article> bubble
 * per ChatTurn in state.turns. CSS class on each bubble is keyed off
 * turn.kind (one of the 7 ChatTurnKind values; Cycle 2 adds
 * 'prompt_display' per A18 / F-04b) — F-27 acceptance pins this so
 * tests can assert the bubble taxonomy directly.
 *
 * Submitting a user turn appends to state.turns (via the onSubmit
 * callback the parent supplies) and triggers the merged Compile
 * Agent's per-turn 5-action structured output (the parent handles
 * the postCompile call; ChatPanel only owns presentation + input).
 *
 * F-31 / D6 consent affordance: when the last assistant turn carries
 * kind='notify_team_question' AND the conversation status is
 * 'awaiting_notify_decision', ChatPanel renders inline yes/no buttons
 * under data-testid='customer-chat-consent-yes' and
 * data-testid='customer-chat-consent-no'. The parent supplies an
 * onConsent callback. ChatPanel does NOT invoke the signal write
 * directly — it surfaces consent and lets the route call
 * _writeProvisionalSignal, preserving the data-layer guard ownership.
 *
 * The prior IntentInputPanel + ClarificationLoopPanel split is
 * REPLACED by this single chat surface per A12.
 */
import { CSSProperties, FormEvent, useState } from 'react';
import type { ChatTurn, ConversationState } from '@domain/types';

export type ChatPanelProps = {
  conversation: ConversationState;
  onSubmitTurn: (userContent: string) => void;
  /**
   * F-31 / D6 — invoked when the user clicks yes/no under a
   * notify_team_question bubble. `yes` is true for yes, false for no.
   * Optional so test harnesses + non-consent flows can omit it.
   */
  onConsent?: (yes: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatPanel(props: ChatPanelProps) {
  const { conversation, onSubmitTurn, onConsent, disabled, placeholder } = props;
  const [draft, setDraft] = useState('');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmitTurn(trimmed);
    setDraft('');
  };

  // F-31 / D6 — show consent affordance when the last assistant turn
  // is a notify_team_question AND the conversation is awaiting the
  // user's decision. The condition pair preserves N9's UX layer
  // guarantee (the data layer still enforces RED-3 independently).
  const lastAssistantTurn = [...conversation.turns]
    .reverse()
    .find((t) => t.role === 'assistant');
  const showConsent =
    conversation.status === 'awaiting_notify_decision' &&
    lastAssistantTurn?.kind === 'notify_team_question' &&
    typeof onConsent === 'function';

  return (
    <section data-testid="customer-chat-panel" style={panelStyle}>
      <header style={headerStyle}>
        <h2 style={headerTitleStyle}>Conversation</h2>
        <span data-testid="customer-chat-panel-status" style={statusStyle}>
          {conversation.status}
        </span>
      </header>
      <div data-testid="customer-chat-panel-thread" style={threadStyle}>
        {conversation.turns.length === 0 && (
          <p data-testid="customer-chat-panel-empty" style={emptyStateStyle}>
            Paste your commercial-invoice requirements to begin.
          </p>
        )}
        {conversation.turns.map((turn) => (
          <ChatBubble key={turn.id} turn={turn} />
        ))}
        {showConsent && onConsent && (
          <div data-testid="customer-chat-consent" style={consentRowStyle}>
            <button
              type="button"
              data-testid="customer-chat-consent-yes"
              onClick={() => onConsent(true)}
              disabled={disabled}
              style={consentYesStyle}
            >
              Yes, notify the team
            </button>
            <button
              type="button"
              data-testid="customer-chat-consent-no"
              onClick={() => onConsent(false)}
              disabled={disabled}
              style={consentNoStyle}
            >
              No
            </button>
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} style={composerStyle}>
        <textarea
          data-testid="customer-chat-panel-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? 'Describe what you want to extract…'}
          rows={3}
          style={textareaStyle}
        />
        <button
          type="submit"
          data-testid="customer-chat-panel-submit"
          disabled={disabled || draft.trim().length === 0}
          style={submitButtonStyle}
        >
          Send
        </button>
      </form>
    </section>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user';
  const isPromptDisplay = turn.kind === 'prompt_display';
  return (
    <article
      data-testid={`chat-bubble-${turn.id}`}
      data-turn-kind={turn.kind}
      data-turn-role={turn.role}
      className={`chat-bubble chat-bubble--${turn.kind}`}
      style={{
        ...bubbleStyle,
        ...(isUser ? bubbleUserStyle : bubbleAssistantStyle),
        ...(isPromptDisplay ? bubblePromptDisplayStyle : {}),
      }}
    >
      <span style={bubbleMetaStyle}>
        {turn.role} · {turn.kind}
      </span>
      <p
        style={{
          ...bubbleContentStyle,
          ...(isPromptDisplay ? bubblePromptDisplayContentStyle : {}),
        }}
      >
        {turn.content}
      </p>
    </article>
  );
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden',
  minHeight: '420px',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px var(--card-padding)',
  borderBottom: '1px solid var(--line-2)',
  background: 'var(--panel-2)',
};

const headerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--panel-title-size)',
  fontWeight: 600,
  color: 'var(--ink-1)',
};

const statusStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10.5px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
};

const threadStyle: CSSProperties = {
  flex: 1,
  padding: 'var(--card-padding)',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  background: 'var(--bg)',
};

const emptyStateStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-3)',
  fontStyle: 'italic',
  textAlign: 'center',
};

const bubbleStyle: CSSProperties = {
  maxWidth: '80%',
  padding: '10px 12px',
  borderRadius: '12px',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
};

const bubbleUserStyle: CSSProperties = {
  alignSelf: 'flex-end',
  background: 'var(--brand-50)',
  borderColor: 'var(--brand-50)',
  color: 'var(--ink-1)',
};

const bubbleAssistantStyle: CSSProperties = {
  alignSelf: 'flex-start',
};

const bubblePromptDisplayStyle: CSSProperties = {
  // A18 / F-04b — monospace rendering for the generated extraction
  // prompt. Keeps the visual cue that this content is a prompt body.
  maxWidth: '95%',
  background: 'var(--panel-2)',
};

const bubblePromptDisplayContentStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '11.5px',
  lineHeight: 1.5,
};

const bubbleMetaStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '4px',
};

const bubbleContentStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
};

const consentRowStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignSelf: 'flex-start',
  marginTop: '4px',
};

const consentYesStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
};

const consentNoStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--line)',
  background: 'var(--panel)',
  color: 'var(--ink-1)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
};

const composerStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: 'var(--card-padding)',
  borderTop: '1px solid var(--line-2)',
  background: 'var(--panel-2)',
};

const textareaStyle: CSSProperties = {
  flex: 1,
  resize: 'vertical',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-button)',
  padding: '8px 10px',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
  background: 'var(--panel)',
  color: 'var(--ink-1)',
};

const submitButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 16px',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#FFFFFF',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--body-size)',
};
