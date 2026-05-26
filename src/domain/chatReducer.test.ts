/**
 * F-27 — chat reducer determinism + status transition tests.
 */
import { describe, expect, it } from 'vitest';
import type { ChatTurn, ConversationState } from '@domain/types';
import {
  applyChatTurn,
  createConversation,
  recordCompiledConfig,
} from './chatReducer';

const turn = (overrides: Partial<ChatTurn> & Pick<ChatTurn, 'id' | 'role' | 'kind' | 'content'>): ChatTurn => ({
  timestamp: '2026-05-26T19:30:00Z',
  ...overrides,
});

describe('F-27 applyChatTurn — determinism', () => {
  it('same (state, turn) inputs return identical state across 10 invocations', () => {
    const state = createConversation('conv::1');
    const t = turn({ id: 't::1', role: 'user', kind: 'message', content: 'hello' });
    const expected = applyChatTurn(state, t);
    for (let i = 0; i < 10; i++) {
      const next = applyChatTurn(state, t);
      expect(next).toEqual(expected);
    }
  });

  it('returns a new state object (state is not mutated in place)', () => {
    const state = createConversation('conv::1');
    const t = turn({ id: 't::1', role: 'user', kind: 'message', content: 'hello' });
    const next = applyChatTurn(state, t);
    expect(next).not.toBe(state);
    expect(state.turns.length).toBe(0); // original untouched
    expect(next.turns.length).toBe(1);
  });

  it('appends the turn at the end of the turns list', () => {
    let state: ConversationState = createConversation('conv::1');
    state = applyChatTurn(state, turn({ id: 't::1', role: 'user', kind: 'message', content: 'a' }));
    state = applyChatTurn(state, turn({ id: 't::2', role: 'assistant', kind: 'message', content: 'b' }));
    expect(state.turns.map((t) => t.id)).toEqual(['t::1', 't::2']);
  });
});

describe('F-27 applyChatTurn — status transitions', () => {
  it('assistant recompile_announcement → recompiling', () => {
    const state = createConversation('conv::1');
    const next = applyChatTurn(
      state,
      turn({ id: 't::1', role: 'assistant', kind: 'recompile_announcement', content: 'updating' }),
    );
    expect(next.status).toBe('recompiling');
  });

  it('assistant notify_team_question → awaiting_notify_decision', () => {
    const state = createConversation('conv::1');
    const next = applyChatTurn(
      state,
      turn({ id: 't::1', role: 'assistant', kind: 'notify_team_question', content: 'notify?' }),
    );
    expect(next.status).toBe('awaiting_notify_decision');
  });

  it('assistant success_summary → success', () => {
    const state = createConversation('conv::1');
    const next = applyChatTurn(
      state,
      turn({ id: 't::1', role: 'assistant', kind: 'success_summary', content: 'all done' }),
    );
    expect(next.status).toBe('success');
  });

  it('assistant notify_team_confirmation → completed', () => {
    const state = createConversation('conv::1');
    const next = applyChatTurn(
      state,
      turn({ id: 't::1', role: 'assistant', kind: 'notify_team_confirmation', content: 'noted' }),
    );
    expect(next.status).toBe('completed');
  });

  it('user message preserves the current status', () => {
    const state = applyChatTurn(
      createConversation('conv::1'),
      turn({ id: 't::a', role: 'assistant', kind: 'notify_team_question', content: 'notify?' }),
    );
    expect(state.status).toBe('awaiting_notify_decision');
    const next = applyChatTurn(state, turn({ id: 't::b', role: 'user', kind: 'message', content: 'yes' }));
    expect(next.status).toBe('awaiting_notify_decision');
  });

  it('assistant clarification_question / message preserves the current status', () => {
    let s = applyChatTurn(
      createConversation('conv::1'),
      turn({ id: 't::a', role: 'assistant', kind: 'recompile_announcement', content: 'r' }),
    );
    expect(s.status).toBe('recompiling');
    s = applyChatTurn(s, turn({ id: 't::b', role: 'assistant', kind: 'clarification_question', content: 'q' }));
    expect(s.status).toBe('recompiling');
  });
});

describe('F-27 recordCompiledConfig — version refs', () => {
  it('appends configId to compiledConfigVersionRefs', () => {
    const state = createConversation('conv::1');
    expect(state.compiledConfigVersionRefs.length).toBe(0);
    const next = recordCompiledConfig(state, 'cfg::1');
    expect(next.compiledConfigVersionRefs).toEqual(['cfg::1']);
    const next2 = recordCompiledConfig(next, 'cfg::2');
    expect(next2.compiledConfigVersionRefs).toEqual(['cfg::1', 'cfg::2']);
  });
});
