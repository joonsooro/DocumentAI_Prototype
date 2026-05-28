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
  FORBIDDEN_FILE_REQUEST_PHRASES,
  SYSTEM_PROMPT,
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

describe('F-28 SYSTEM_PROMPT — S1/S2 D2-binding + first-turn enumeration', () => {
  it('enumerates the fifth missed-extraction pattern "first-turn field enumeration"', () => {
    expect(SYSTEM_PROMPT).toContain('first-turn field enumeration');
    expect(SYSTEM_PROMPT.toLowerCase()).toContain('first-turn field enumeration');
    // Canonical example field list (mirrors the live demo transcript
    // that motivated S1). The exact ordering supplier → invoice number
    // → PO number must appear verbatim so the haiku classifier sees a
    // closed reference example, not gestured prose.
    expect(SYSTEM_PROMPT).toContain('supplier, invoice number, PO number');
    expect(SYSTEM_PROMPT).toContain('invoice date');
    expect(SYSTEM_PROMPT).toContain('total amount');
    expect(SYSTEM_PROMPT).toContain('supplier branch');
    // Outcome pinned: the configuration IS the response.
    expect(SYSTEM_PROMPT).toContain("action='recompile'");
    expect(SYSTEM_PROMPT).toContain('configuration IS the response');
  });

  it('contains a DECISION RULES entry that pins first-turn field enumeration to action="recompile"', () => {
    // The DECISION RULES section must explicitly name the
    // commercial_invoice pinned document type AND the recompile
    // outcome — gesturing at "missing field context" left the haiku
    // model to infer this branch from prose (the Specification-Gulf
    // trap S1 closed).
    const decisionRulesIdx = SYSTEM_PROMPT.indexOf('DECISION RULES');
    const missedExtractionIdx = SYSTEM_PROMPT.indexOf('MISSED-EXTRACTION PATTERNS');
    expect(decisionRulesIdx).toBeGreaterThan(-1);
    expect(missedExtractionIdx).toBeGreaterThan(decisionRulesIdx);
    const decisionRulesSection = SYSTEM_PROMPT.slice(decisionRulesIdx, missedExtractionIdx);
    expect(decisionRulesSection).toContain('commercial_invoice');
    expect(decisionRulesSection).toContain("action='recompile'");
    expect(decisionRulesSection.toLowerCase()).toContain('enumerates fields');
    // The DECISION RULES section must also redirect the wrong-frame
    // "share the document" reflex into the recompile branch, so the
    // S3 reflect is not split across two non-adjacent sections.
    expect(decisionRulesSection).toMatch(/do not ask|do not.*share|already have|see negative contract/i);
  });

  it('forbids every utterance in FORBIDDEN_FILE_REQUEST_PHRASES literally in SYSTEM_PROMPT', () => {
    // The constant and the prompt must not drift — every forbidden
    // phrase exported by the module must appear in the prompt body
    // so the haiku classifier sees the closed reference list, not
    // gestured prose. (Same enumerate-don't-gesture binding S1 + S2
    // landed in spec.html + contract.html.)
    for (const phrase of FORBIDDEN_FILE_REQUEST_PHRASES) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
    // Sanity: the constant carries the 11 phrases the contract row
    // names; a future writer that prunes the list must also prune
    // the prompt (and this test will surface it).
    expect(FORBIDDEN_FILE_REQUEST_PHRASES.length).toBe(11);
  });

  it('the NEGATIVE CONTRACT block names D2, SUB-1, N6, and N1', () => {
    const negativeContractIdx = SYSTEM_PROMPT.indexOf('NEGATIVE CONTRACT');
    expect(negativeContractIdx).toBeGreaterThan(-1);
    const negativeContractSection = SYSTEM_PROMPT.slice(negativeContractIdx);
    expect(negativeContractSection).toContain('D2');
    expect(negativeContractSection).toContain('SUB-1');
    expect(negativeContractSection).toContain('N6');
    expect(negativeContractSection).toContain('N1');
    // The wrong-frame anti-pattern redirect must appear inside the
    // NEGATIVE CONTRACT section so the rule is self-contained at the
    // point a future writer reads it.
    expect(negativeContractSection).toContain("action='recompile'");
    // The capability-lie analogy to N1's "unsupported" must be
    // explicit — that's the load-bearing containment binding.
    expect(negativeContractSection.toLowerCase()).toContain('capability lie');
    expect(negativeContractSection).toContain('"unsupported"');
  });

  it('the wrong-frame anti-pattern redirects to action="recompile" (not clarify, not file ask)', () => {
    // The prompt must explicitly say: when the user enumerates
    // fields, the right action is action='recompile' — NOT
    // action='clarify' and NOT asking for a file. This is the
    // load-bearing redirect that closes the live-demo regression.
    expect(SYSTEM_PROMPT).toMatch(/wrong[-\s]frame/i);
    expect(SYSTEM_PROMPT).toContain('I need to see the document');
    expect(SYSTEM_PROMPT).toContain("action='recompile'");
    // The forbidden file-ask shapes must NEVER appear as a positive
    // instruction to the agent. Every occurrence of each forbidden
    // phrase in SYSTEM_PROMPT must be either (a) inside the NEGATIVE
    // CONTRACT section (which is itself a negation context — the
    // section enumerates forbidden examples) OR (b) preceded within
    // ~40 chars by a negation token (NEVER / not / do not / do NOT).
    // A positive imperative like "ask the user to share the document"
    // would necessarily violate both conditions.
    const negativeContractIdx = SYSTEM_PROMPT.indexOf('NEGATIVE CONTRACT');
    expect(negativeContractIdx).toBeGreaterThan(-1);
    for (const phrase of FORBIDDEN_FILE_REQUEST_PHRASES) {
      const matches = [...SYSTEM_PROMPT.matchAll(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        const idx = m.index ?? 0;
        const insideNegativeContract = idx > negativeContractIdx;
        const preceding = SYSTEM_PROMPT.slice(Math.max(0, idx - 40), idx);
        const precededByNegation = /never|do not|do NOT|\bnot\b|n[o']t/i.test(preceding);
        expect(insideNegativeContract || precededByNegation).toBe(true);
      }
    }
  });
});
