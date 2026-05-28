/**
 * @vitest-environment jsdom
 *
 * F-27 — ChatPanel UI smoke tests.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';
import type { ChatTurn, ConversationState } from '@domain/types';

const conv = (turns: readonly ChatTurn[], status: ConversationState['status'] = 'collecting'): ConversationState => ({
  id: 'conv::test::1',
  turns,
  compiledConfigVersionRefs: [],
  status,
  pendingSignal: null,
});

const turn = (id: string, role: ChatTurn['role'], kind: ChatTurn['kind'], content: string): ChatTurn => ({
  id,
  role,
  kind,
  content,
  timestamp: '2026-05-26T19:30:00Z',
});

describe('F-27 ChatPanel', () => {
  beforeEach(() => cleanup());

  it("renders with data-testid='customer-chat-panel'", () => {
    render(<ChatPanel conversation={conv([])} onSubmitTurn={() => {}} />);
    expect(screen.getByTestId('customer-chat-panel')).toBeTruthy();
  });

  it('renders the empty-state when there are no turns', () => {
    render(<ChatPanel conversation={conv([])} onSubmitTurn={() => {}} />);
    expect(screen.getByTestId('customer-chat-panel-empty')).toBeTruthy();
  });

  it('renders one bubble per ChatTurn with the kind on data-turn-kind and CSS class', () => {
    const turns = [
      turn('t::1', 'user', 'message', 'paste prose'),
      turn('t::2', 'assistant', 'clarification_question', 'what is X?'),
      turn('t::3', 'assistant', 'recompile_announcement', 'updating…'),
      turn('t::4', 'assistant', 'notify_team_question', 'notify?'),
    ];
    render(<ChatPanel conversation={conv(turns)} onSubmitTurn={() => {}} />);
    for (const t of turns) {
      const bubble = screen.getByTestId(`chat-bubble-${t.id}`);
      expect(bubble.getAttribute('data-turn-kind')).toBe(t.kind);
      expect(bubble.className).toContain(`chat-bubble--${t.kind}`);
    }
  });

  it('submitting non-empty text invokes onSubmitTurn with the trimmed content and clears the textarea', () => {
    const submissions: string[] = [];
    render(
      <ChatPanel
        conversation={conv([])}
        onSubmitTurn={(content) => submissions.push(content)}
      />,
    );
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    fireEvent.change(textarea, { target: { value: '  hello world  ' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(submissions).toEqual(['hello world']);
    expect(textarea.value).toBe('');
  });

  it('submit is disabled when the textarea is empty or only whitespace', () => {
    const onSubmit = vi.fn();
    render(<ChatPanel conversation={conv([])} onSubmitTurn={onSubmit} />);
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   \n  ' } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled prop locks the input even with non-empty content', () => {
    render(
      <ChatPanel
        conversation={conv([turn('t::1', 'user', 'message', 'a')])}
        onSubmitTurn={() => {}}
        disabled
      />,
    );
    const textarea = screen.getByTestId('customer-chat-panel-input') as HTMLTextAreaElement;
    const submit = screen.getByTestId('customer-chat-panel-submit') as HTMLButtonElement;
    expect(textarea.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
  });
});
