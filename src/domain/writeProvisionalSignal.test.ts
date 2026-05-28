/**
 * F-27 — RED-3 binding: _writeProvisionalSignal rejects any write that
 * doesn't carry the N9 consent guard (status === 'awaiting_notify_decision'
 * AND last user turn matches /^\s*yes\b/i).
 *
 * Also asserts that the in-memory product-signal store is unchanged
 * after a rejected write — N9 must be enforced at the data layer, not
 * just at the chat UX layer.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { ChatTurn, ConversationState } from '@domain/types';
import { _writeProvisionalSignal, type ProvisionalSignalSeed } from './writeProvisionalSignal';
import {
  getProductSignals,
  _resetCorrectionStoreForTests,
} from './submitCorrection';

const baseSeed = (overrides: Partial<ProvisionalSignalSeed> = {}): ProvisionalSignalSeed => ({
  id: 'ps::test::1',
  signalType: 'unsupported_free_text_business_condition',
  category: 'commercial invoice / integration request',
  intentFragment: 'Can you fill these fields in S/4 HANA?',
  suggestedProductArea: 'integration_capability',
  documentType: 'commercial_invoice',
  ...overrides,
});

const turn = (id: string, role: ChatTurn['role'], kind: ChatTurn['kind'], content: string): ChatTurn => ({
  id,
  role,
  kind,
  content,
  timestamp: '2026-05-26T19:30:00Z',
});

const conversation = (status: ConversationState['status'], turns: readonly ChatTurn[]): ConversationState => ({
  id: 'conv::test::1',
  turns,
  compiledConfigVersionRefs: [],
  status,
  pendingSignal: null,
});

describe('F-27 / RED-3 — _writeProvisionalSignal N9 guard at the data layer', () => {
  beforeEach(() => {
    _resetCorrectionStoreForTests();
  });

  it('rejects when status is not awaiting_notify_decision', () => {
    const state = conversation('collecting', [turn('t::1', 'user', 'message', 'yes')]);
    const result = _writeProvisionalSignal(state, baseSeed());
    expect(result.rejected).toBe(true);
    if (result.rejected) {
      expect(result.reason).toContain('N9 guard tripped');
      expect(result.reason).toContain("'collecting'");
    }
    // RED-3 store-unchanged invariant: this module does not touch the store
    expect(getProductSignals().length).toBe(0);
  });

  it("rejects when status is awaiting_notify_decision BUT the last user turn isn't 'yes'", () => {
    const state = conversation('awaiting_notify_decision', [
      turn('t::1', 'assistant', 'notify_team_question', 'notify?'),
      turn('t::2', 'user', 'message', 'no thanks'),
    ]);
    const result = _writeProvisionalSignal(state, baseSeed());
    expect(result.rejected).toBe(true);
    if (result.rejected) {
      expect(result.reason).toContain('explicit consent required');
    }
    expect(getProductSignals().length).toBe(0);
  });

  it('rejects when there is no user turn at all', () => {
    const state = conversation('awaiting_notify_decision', [
      turn('t::1', 'assistant', 'notify_team_question', 'notify?'),
    ]);
    const result = _writeProvisionalSignal(state, baseSeed());
    expect(result.rejected).toBe(true);
    if (result.rejected) {
      expect(result.reason).toContain('no user turn');
    }
    expect(getProductSignals().length).toBe(0);
  });

  it('accepts when status=awaiting_notify_decision AND last user turn matches /^\\s*yes\\b/i', () => {
    const state = conversation('awaiting_notify_decision', [
      turn('t::1', 'assistant', 'notify_team_question', 'notify?'),
      turn('t::2', 'user', 'message', 'yes please'),
    ]);
    const result = _writeProvisionalSignal(state, baseSeed());
    expect(result.rejected).toBe(false);
    if (!result.rejected) {
      expect(result.signal.status).toBe('provisional');
      expect(result.signal.provenance).toBe('conversational_notify_team');
      expect(result.signal.governanceApprovedAt).toBeNull();
      expect(result.signal.id).toBe('ps::test::1');
    }
  });

  it('matches "Yes" / "YES" / "  yes" (case-insensitive, leading whitespace)', () => {
    for (const candidate of ['Yes', 'YES', '  yes', 'yes, do it']) {
      const state = conversation('awaiting_notify_decision', [
        turn('t::1', 'assistant', 'notify_team_question', 'notify?'),
        turn('t::2', 'user', 'message', candidate),
      ]);
      const result = _writeProvisionalSignal(state, baseSeed({ id: `ps::${candidate.length}` }));
      expect(result.rejected).toBe(false);
    }
  });

  it("does NOT match 'yesterday' or 'yet' (word-boundary required)", () => {
    for (const candidate of ['yesterday', 'yet again', 'yeah']) {
      const state = conversation('awaiting_notify_decision', [
        turn('t::1', 'assistant', 'notify_team_question', 'notify?'),
        turn('t::2', 'user', 'message', candidate),
      ]);
      const result = _writeProvisionalSignal(state, baseSeed());
      expect(result.rejected).toBe(true);
    }
  });
});
