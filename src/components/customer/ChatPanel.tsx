/**
 * F-27 — ChatPanel.
 *
 * Renders data-testid='customer-chat-panel' with one <article> bubble
 * per ChatTurn in state.turns. CSS class on each bubble is keyed off
 * turn.kind (one of the 6 ChatTurnKind values) — F-27 acceptance pins
 * this so tests can assert the bubble taxonomy directly.
 *
 * Submitting a user turn appends to state.turns (via the onSubmit
 * callback the parent supplies) and triggers F-28's per-turn meta-
 * decision (the parent handles the chat.turn_decide call; ChatPanel
 * only owns presentation + input).
 *
 * The prior IntentInputPanel + ClarificationLoopPanel split is REPLACED
 * by this single chat surface per A12.
 */
import { CSSProperties, FormEvent, useState } from 'react';
import type { ChatTurn, ConversationState } from '@domain/types';

export type ChatPanelProps = {
  conversation: ConversationState;
  onSubmitTurn: (userContent: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatPanel(props: ChatPanelProps) {
  const { conversation, onSubmitTurn, disabled, placeholder } = props;
  const [draft, setDraft] = useState('');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSubmitTurn(trimmed);
    setDraft('');
  };

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
  return (
    <article
      data-testid={`chat-bubble-${turn.id}`}
      data-turn-kind={turn.kind}
      data-turn-role={turn.role}
      className={`chat-bubble chat-bubble--${turn.kind}`}
      style={{
        ...bubbleStyle,
        ...(isUser ? bubbleUserStyle : bubbleAssistantStyle),
      }}
    >
      <span style={bubbleMetaStyle}>
        {turn.role} · {turn.kind}
      </span>
      <p style={bubbleContentStyle}>{turn.content}</p>
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
