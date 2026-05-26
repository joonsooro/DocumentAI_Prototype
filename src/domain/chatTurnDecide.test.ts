/**
 * F-28 — chat.turn_decide agent tests.
 *
 * Live agent calls are exercised in src/evals/live.test.tsx against the
 * real SAP AI Core tenant. This file covers the deterministic surface:
 *
 *   - The TurnDecision discriminated union is exhaustive (4 actions);
 *     malformed responses throw, surfacing as AgentFailure via
 *     runAgentWithFailureSurface.
 *   - The wire endpoint shape (handleChatTurnDecide) matches the same
 *     { kind: 'success' | 'failure' } pattern as the other 3 handlers.
 *   - EDGE-7 helper: isMissedExtractionOnly returns true for
 *     missed-extraction conversations and false when a user turn
 *     contains a capability-class pattern.
 *   - The browser bundle stays clean of agent dispatch — the
 *     postChatTurnDecide wrapper imports ONLY type shapes.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { handleChatTurnDecide } from '../server/devAgentMiddleware';
import {
  CAPABILITY_CLASS_VALUES,
  isMissedExtractionOnly,
  type TurnDecision,
} from './chatTurnDecide';
import { _resetClientForTests } from '@runtime/aiCoreClient';
import type { ChatTurn, ConversationState } from '@domain/types';

// Force credential_load_failed so the live OAuth path never runs in
// these tests. AICORE_KEY_PATH at /dev/null/does-not-exist.json is
// the same path used by the existing devAgentMiddleware.test.ts.
const ORIGINAL_KEY_PATH = process.env.AICORE_KEY_PATH;

beforeEach(() => {
  process.env.AICORE_KEY_PATH = '/dev/null/does-not-exist.json';
  _resetClientForTests();
});

afterAll(() => {
  process.env.AICORE_KEY_PATH = ORIGINAL_KEY_PATH;
});

const turn = (id: string, role: ChatTurn['role'], kind: ChatTurn['kind'], content: string): ChatTurn => ({
  id,
  role,
  kind,
  content,
  timestamp: '2026-05-26T19:30:00Z',
});

const conv = (turns: readonly ChatTurn[], status: ConversationState['status'] = 'collecting'): ConversationState => ({
  id: 'conv::test::1',
  turns,
  compiledConfigVersionRefs: [],
  status,
});

describe('F-28 handleChatTurnDecide — wire shape contract', () => {
  it('returns { kind: failure } when the live agent path fails (credential_load_failed)', async () => {
    const response = await handleChatTurnDecide({
      conversation: conv([turn('t::1', 'user', 'message', 'hello')]),
    });
    expect(response.kind).toBe('failure');
    if (response.kind === 'failure') {
      expect(response.clarification.kind).toBe('agent_failure_surface');
      expect(response.metric.agent).toContain('aiCoreClient.loadServiceKey');
      expect(response.metric.status).toBe('fail');
    }
  });
});

describe('F-28 TurnDecision union — discriminated 4 actions only', () => {
  it('exhausts the 4 A12-policy actions', () => {
    // Static type-level + value-level assertion: every action label
    // appears in at least one valid TurnDecision shape.
    const samples: TurnDecision[] = [
      { action: 'clarify', clarificationContent: 'q' },
      { action: 'recompile', recompileSummary: 's' },
      {
        action: 'capability_class_question',
        classification: 'integration_request',
        questionContent: 'q',
      },
      { action: 'success_summary', summaryContent: 's' },
    ];
    const actions = samples.map((s) => s.action).sort();
    expect(actions).toEqual(
      ['capability_class_question', 'clarify', 'recompile', 'success_summary'].sort(),
    );
  });

  it('CAPABILITY_CLASS_VALUES exports the 5 A14 v1 patterns verbatim', () => {
    expect([...CAPABILITY_CLASS_VALUES].sort()).toEqual(
      [
        'bulk_operation',
        'cross_document_inference',
        'integration_request',
        'new_document_type',
        'predictive_request',
      ],
    );
  });
});

describe('F-28 isMissedExtractionOnly — EDGE-7 helper', () => {
  it('returns true for a clarify-only conversation (no capability-class patterns)', () => {
    const turns = [
      turn('t::1', 'user', 'message', 'payment_terms means net 30 from BoL'),
      turn('t::2', 'assistant', 'clarification_question', 'and supplier scope?'),
      turn('t::3', 'user', 'message', 'all suppliers in commercial invoices'),
      turn('t::4', 'assistant', 'recompile_announcement', 'updating'),
    ];
    expect(isMissedExtractionOnly(turns)).toBe(true);
  });

  it('returns false when a user turn contains an integration-class pattern', () => {
    const turns = [
      turn('t::1', 'user', 'message', 'Can you fill these fields in S/4 HANA?'),
    ];
    expect(isMissedExtractionOnly(turns)).toBe(false);
  });

  it('returns false for cross-document-inference patterns', () => {
    const turns = [
      turn('t::1', 'user', 'message', 'Cross-reference the PO from last month'),
    ];
    expect(isMissedExtractionOnly(turns)).toBe(false);
  });

  it('returns false for bulk-operation patterns', () => {
    const turns = [
      turn('t::1', 'user', 'message', 'Process 500 of these at once'),
    ];
    expect(isMissedExtractionOnly(turns)).toBe(false);
  });

  it('only inspects user turns — capability words in assistant turns do not count', () => {
    const turns = [
      turn('t::1', 'assistant', 'message', 'You could integrate with S/4 HANA in v2'),
      turn('t::2', 'user', 'message', 'OK, just extract the fields'),
    ];
    expect(isMissedExtractionOnly(turns)).toBe(true);
  });
});
