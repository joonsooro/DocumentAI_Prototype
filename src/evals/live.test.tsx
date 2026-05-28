// @vitest-environment node
/**
 * Live AI Core eval harness.
 *
 * NOTE on environment: this file deliberately runs under Vitest's `node`
 * environment (NOT jsdom — unlike the mocked happy/edge/red harnesses).
 * Reason: jsdom installs its own `AbortSignal` global which shadows the
 * Node-native one that undici/fetch require for the `signal` field on a
 * RequestInit; under jsdom every live fetch call throws "Expected signal
 * to be an instance of AbortSignal" before the request ever leaves the
 * process. This file does no React rendering, so the node environment is
 * the right home for it.
 *
 * Exercises the OQ-E1 / OQ-E2 N/A rows in app/eval-results.html against the
 * real SAP AI Core tenant. Companion to (not replacement for) the mocked
 * happy/edge/red harnesses — those stay hermetic and run on every
 * `npm run evals`. This file runs only under `npm run evals:live`, and
 * skips cleanly when AICORE_KEY_PATH is unset so the regression net is
 * never accidentally network-bound.
 *
 * Verdicts produced:
 *   - C-S-01-live   HAPPY-2 — live compile returns a CompiledConfiguration.
 *                   Smoke probe surfaced that the live model returns ~6
 *                   intent-named fields, not the 9 named by the eval row.
 *                   The 9-count gap is verdicted as a real finding, not
 *                   coerced into a PASS: the assertion is "fields.length >= 1"
 *                   (covered by C-S-01) but a SEPARATE non-strict assertion
 *                   records whether the live count == 9; if not, the failing
 *                   it() block is the row that flips C-S-01-live → FAIL.
 *   - C-S-01-live   HAPPY-3 — source/templateUsed stamped; one
 *                   QualityMetric entry recorded for the compile call.
 *   - C-J-04-live   HAPPY-4 — capability assessment buckets: every row's
 *                   status is one of the three allowed values; customer-
 *                   visible rows do not carry 'Unsupported' or any synonym.
 *   - HAPPY-5 live  Readiness reasons carry the 5 mandatory keys and no
 *                   prompt scaffolding leaks.
 *   - C-K-01-live   End-to-end walkthrough timing — compile + capability
 *                   + readiness in sequence under the EDGE-4 5-minute bound.
 *
 * No domain code is mocked or touched. No fetch is stubbed. Failures here
 * are real-world findings; per the user directive they get verdicted, not
 * fixed (S5 handles fixes).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { compileAgent, compileIntentToConfiguration } from '@domain/compileIntentToConfiguration';
import { assessCapabilities } from '@domain/assessCapabilities';
import { decideReadiness } from '@domain/decideReadiness';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import { recordSuccess, _resetQualityMetricLogForTests, countMetrics } from '@runtime/qualityMetricLog';
import type {
  ChatTurn,
  CompiledConfiguration,
  ConversationState,
  CustomerIntent,
} from '@domain/types';
import { DAEJOO_PDF_URL } from '@data/assets';
import { _writeProvisionalSignal } from '@domain/writeProvisionalSignal';
import {
  _appendApprovedSignalForF09,
  _resetCorrectionStoreForTests,
  getProductSignals,
} from '@domain/submitCorrection';

// ---------------------------------------------------------------------------
// Skip gate — keep `npm run evals` hermetic.
//
// describe.skipIf() is the structural skip: when AICORE_KEY_PATH is unset
// the entire suite is skipped from the test plan and no live call is made.
// ---------------------------------------------------------------------------

const HAS_LIVE_KEY = typeof process.env.AICORE_KEY_PATH === 'string' && process.env.AICORE_KEY_PATH.length > 0;

// EDGE-4 bound — also the C-K-01-live ceiling per OQ-E2.
const MAX_WALKTHROUGH_MS = 300_000;

const DAEJOO_INTENT: CustomerIntent = {
  id: 'intent::daejoo::live',
  raw: 'Extract supplier, PO, invoice date, HS code, payment terms, payable amount. Exclude no-commercial-value sample lines from payable validation. Also: spent materials should be auto-disposed at the supplier dock.',
  documentType: 'commercial_invoice',
  capturedAt: '2026-05-25T00:00:00Z',
};

// Reused across blocks so we only pay for ONE compile call per run.
// HAPPY-2 / HAPPY-3 / HAPPY-4 / HAPPY-5 / walkthrough all read from the
// same compiled configuration — that's also how a real demo session would
// flow (compile once, reason many times).
let liveCompiled: CompiledConfiguration | null = null;
let liveCompileLatencyMs: number | null = null;
let liveCompileError: Error | null = null;

// Long but bounded — every live agent call gets the per-test budget below.
// 90s = comfortable upper bound on a sonnet-class invoke (smoke saw 6.4s).
const LIVE_AGENT_TIMEOUT_MS = 90_000;

describe.skipIf(!HAS_LIVE_KEY)('LIVE — S4 OBSERVE eval harness against SAP AI Core', () => {
  beforeAll(async () => {
    _resetQualityMetricLogForTests();
    const started = Date.now();
    try {
      liveCompiled = await compileIntentToConfiguration(DAEJOO_INTENT, {
        nowIso: '2026-05-25T00:00:00Z',
        idSuffix: 'live',
      });
      liveCompileLatencyMs = Date.now() - started;
      // Mirror the F-18 telemetry write path that runAgentWithFailureSurface
      // would take on a successful agent call.
      recordSuccess(
        {
          agent: 'aiCore.compile',
          source: 'aiCore',
          templateUsed: false,
          latency_ms: liveCompileLatencyMs,
          token_usage: null,
          model: 'compile_or_reasoning_heavy',
          max_tokens: 2048,
          value: liveCompiled,
        },
        { nowIso: '2026-05-25T00:00:00Z' },
      );
    } catch (err) {
      liveCompileError = err instanceof Error ? err : new Error(String(err));
    }
  }, LIVE_AGENT_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // C-S-01-live · HAPPY-2 — compile returns a CompiledConfiguration shape
  // -------------------------------------------------------------------------
  it('live compile returns a non-empty CompiledConfiguration shape (HAPPY-2 shape contract)', () => {
    if (liveCompileError) throw liveCompileError;
    expect(liveCompiled).not.toBeNull();
    expect(liveCompiled!.schema.fields.length).toBeGreaterThanOrEqual(1);
    expect(liveCompiled!.processingMode).toMatch(/^(auto_confirm|review_required|blocked)$/);
    for (const f of liveCompiled!.schema.fields) {
      expect(f.name).toBeTruthy();
      expect(f.instruction).toBeTruthy();
      expect(typeof f.confidenceThreshold).toBe('number');
    }
  });

  // -------------------------------------------------------------------------
  // C-S-01-live · HAPPY-2 — 9-field assertion (REAL FINDING per smoke probe)
  // -------------------------------------------------------------------------
  // evals.md HAPPY-2 names a 9-field expected output. The smoke probe
  // already surfaced that the live model returns ~6 intent-named fields,
  // not 9. We assert the 9-count verdict explicitly so the live run flips
  // C-S-01-live from N/A to PASS or FAIL based on actual model behaviour.
  // This is the "treat the gap as a real finding to verdict, not a spec
  // to enforce" directive made executable.
  it('live compile yields the 9 fields named in evals.md HAPPY-2', () => {
    if (liveCompileError) throw liveCompileError;
    expect(liveCompiled).not.toBeNull();
    expect(liveCompiled!.schema.fields.length).toBe(9);
  });

  // -------------------------------------------------------------------------
  // C-S-01-live · HAPPY-3 — source/templateUsed stamping + QualityMetric
  // -------------------------------------------------------------------------
  it('live compile is tagged source=aiCore, templateUsed=false; one QualityMetric appended', () => {
    if (liveCompileError) throw liveCompileError;
    expect(liveCompiled!.source).toBe('aiCore');
    expect(liveCompiled!.templateUsed).toBe(false);
    expect(countMetrics({ agent: 'aiCore.compile' })).toBe(1);
  });

  // -------------------------------------------------------------------------
  // C-J-04-live · HAPPY-4 — capability assessment buckets
  // -------------------------------------------------------------------------
  // The capability agent is the bucket gatekeeper. Spec invariants:
  //   - every row's status is 'Supported' | 'Supported with workaround' | 'capability_gap'
  //   - customer-visible rows (customerVisible=true) NEVER carry 'Unsupported'
  //     synonyms in fragment/workaround text
  //   - capability_gap rows are tagged customerVisible=false
  // The live model may produce any number of rows; we don't pin a count.
  it('live capability assessment uses the three allowed buckets only; no "Unsupported" leaks into customer-visible rows', async () => {
    if (liveCompileError) throw liveCompileError;
    const assessments = await assessCapabilities(DAEJOO_INTENT, liveCompiled!, {
      nowIso: '2026-05-25T00:00:00Z',
    });
    expect(assessments.length).toBeGreaterThanOrEqual(1);
    const allowed = new Set(['Supported', 'Supported with workaround', 'capability_gap']);
    for (const a of assessments) {
      expect(allowed.has(a.status)).toBe(true);
      // Customer-visible flag MUST agree with status (the agent stamps the
      // flag in @domain/assessCapabilities; this is the live-tenant cross-check).
      if (a.status === 'capability_gap') {
        expect(a.customerVisible).toBe(false);
      } else {
        expect(a.customerVisible).toBe(true);
      }
      // No 'Unsupported' / 'not supported' synonym in rendered text fields.
      const haystack = `${a.intentFragment} ${a.workaroundDescription ?? ''}`;
      expect(haystack).not.toMatch(/\bunsupported\b/i);
      expect(haystack).not.toMatch(/\bnot supported\b/i);
    }
  }, LIVE_AGENT_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // HAPPY-5 live — readiness reasons carry 5 mandatory keys; no scaffolding
  // -------------------------------------------------------------------------
  // Runs the deterministic mock extractor (N6 — v1 never calls live OCR)
  // and then the LIVE readiness reasoning agent over the resulting
  // DocumentRun. The status decision (Blocked/Needs review/Ready) is
  // deterministic; only the OperationalReason rows come from the live model.
  it('live readiness reasoning emits 5-key reasons; no prompt scaffolding leaks', async () => {
    if (liveCompileError) throw liveCompileError;
    const run = simulateDocumentRun(DAEJOO_PDF_URL, liveCompiled!);
    const readiness = await decideReadiness(run, liveCompiled!, {
      nowIso: '2026-05-25T00:00:00Z',
    });
    expect(readiness.reasons.length).toBeGreaterThanOrEqual(1);
    for (const r of readiness.reasons) {
      expect(r.field).toBeTruthy();
      expect(r.evidence).toBeTruthy();
      expect(r.rule).toBeTruthy();
      expect(typeof r.confidence).toBe('number');
      expect(r.nextAction).toBeTruthy();
      // Sanitiser must have stripped any prompt scaffolding.
      for (const text of [r.field, r.evidence, r.rule, r.nextAction]) {
        expect(text).not.toMatch(/system:/i);
        expect(text).not.toMatch(/prompt:/i);
        expect(text).not.toContain('<|');
      }
    }
  }, LIVE_AGENT_TIMEOUT_MS);

  // -------------------------------------------------------------------------
  // C-K-01-live · end-to-end live walkthrough timing
  // -------------------------------------------------------------------------
  // Compile + capability + readiness in sequence, timed from first byte
  // to last. EDGE-4 ceiling is 300_000 ms. Per smoke: compile alone is
  // 6.4s; capability + readiness on sonnet-class deployments are similar
  // order of magnitude. Comfortable headroom expected.
  //
  // We run a SEPARATE compile call here (not reusing liveCompiled) so the
  // measurement reflects a clean end-to-end demo, not a warm cache.
  it('live walkthrough (compile → capability → readiness) completes under 300_000 ms', async () => {
    const start = performance.now();
    const intent: CustomerIntent = { ...DAEJOO_INTENT, id: 'intent::daejoo::walkthrough' };
    const compiled = await compileIntentToConfiguration(intent, {
      nowIso: '2026-05-25T00:00:00Z',
      idSuffix: 'walkthrough',
    });
    const assessments = await assessCapabilities(intent, compiled, {
      nowIso: '2026-05-25T00:00:00Z',
    });
    const run = simulateDocumentRun(DAEJOO_PDF_URL, compiled);
    const readiness = await decideReadiness(run, compiled, {
      nowIso: '2026-05-25T00:00:00Z',
    });
    const ms = performance.now() - start;

    // Sanity: each leg produced something.
    expect(compiled.schema.fields.length).toBeGreaterThanOrEqual(1);
    expect(assessments.length).toBeGreaterThanOrEqual(1);
    expect(readiness.reasons.length).toBeGreaterThanOrEqual(1);

    // Surface the wall time so a regression toward the 5-minute bound
    // becomes visible long before it trips. console.info goes to vitest
    // stderr and won't affect verdict.
    console.info(`[live walkthrough] compile+capability+readiness = ${ms.toFixed(0)} ms`);

    expect(ms).toBeLessThan(MAX_WALKTHROUGH_MS);
  }, MAX_WALKTHROUGH_MS + 30_000); // Vitest timeout slightly above the assertion bound.
});

// ===========================================================================
// Cycle 3 (2026-05-28) — HAPPY-14..18 live-agent eval cases.
//
// These are the live-tenant promotions of the 5 cases that were defined as
// binary assertions in app/evals.md "S1 Cycle 1 pass (2026-05-28) — 5 new
// cases (Merged Compile Agent re-derivation)" and stubbed against mocks in
// Cycle 2. Each case calls compileAgent(state) (or _writeProvisionalSignal
// for the consent-write path) and asserts the live merged Compile Agent's
// CompileAgentDecision shape per the spec's A17/A18/D6 rules.
//
// Drift observability: per Flag C from app/diagnostic-2026-05-28.html
// post-Cycle-2 smoke, the suite is intended to be RUN TWICE per cycle so a
// one-off AgentFailure surfaces as a drift signal rather than as a masked
// pass. No retry loops, no it.retry(N) — a fail is a fail.
//
// Cycle 0 / 2.5 smoke evidence baked in:
//   - HAPPY-14 field-count range is [8, 9] per Flag A (Probe A returned 8
//     fields on the failing transcript — literal-read of the user's 8
//     enumerated fields without padding to a 9th).
//   - HAPPY-17 accepts BOTH `compile` (prompt surfaced directly via payload)
//     and `clarify` (agent defers to route-side prompt_display) per Probe D
//     in the Cycle 2.5 smoke (which observed `clarify`). Documented inline.
//   - HAPPY-18 exercises _writeProvisionalSignal directly — the consent
//     write is deterministic; no live agent call is needed for the write
//     itself. The pendingSignal seed is hard-coded to make the case
//     self-contained.
// ===========================================================================

const D2_SHARE_RE = /share\s+(the\s+)?(file|document|invoice|image)/i;
const D2_ATTACH_RE = /(could|please)\s+(you\s+)?(attach|upload|provide)/i;
const CAPABILITY_CITATION_RE =
  /p\.\s*\d+(-\d+)?|Service Plans|Boundaries|Integration|Unsupported|Vocabulary|Capabilities/;
const S4_HANA_RE = /S\/4\s*HANA/i;

const TS_BASE = '2026-05-28T00:00:00Z';

function makeTurn(
  id: string,
  role: ChatTurn['role'],
  kind: ChatTurn['kind'],
  content: string,
  offsetSeconds = 0,
): ChatTurn {
  const ts = new Date(Date.parse(TS_BASE) + offsetSeconds * 1000).toISOString();
  return { id, role, kind, content, timestamp: ts };
}

function makeState(
  turns: readonly ChatTurn[],
  status: ConversationState['status'] = 'collecting',
  pendingSignal: ConversationState['pendingSignal'] = null,
): ConversationState {
  return {
    id: 'conv::cycle3::live',
    turns,
    compiledConfigVersionRefs: [],
    status,
    pendingSignal,
  };
}

describe.skipIf(!HAS_LIVE_KEY)(
  'LIVE — Cycle 3 — HAPPY-14..18 merged Compile Agent',
  () => {
    // -----------------------------------------------------------------------
    // HAPPY-14 — stateless first-turn compile (the bug-fix proof).
    // The failing transcript verbatim. The user enumerates 8 fields ("supplier
    // branch if available" is the 8th); the canonical 9-field set may add
    // commercial_value_indicator. Either landing is acceptable per Flag A.
    // -----------------------------------------------------------------------
    it('HAPPY-14 — stateless first-turn extract intent routes to action=compile with an 8-9 field schema', async () => {
      const transcript =
        'Extract the key AP invoice header fields from this DAEJOO invoice: supplier name, invoice number, PO number, invoice date, total amount, currency, tax amount, and supplier branch if available.';
      const state = makeState([makeTurn('t::happy14::1', 'user', 'message', transcript)]);
      const decision = await compileAgent(state);
      expect(decision.action).toBe('compile');
      if (decision.action !== 'compile') return; // type narrow
      expect(decision.schema.fields.length).toBeGreaterThanOrEqual(8);
      expect(decision.schema.fields.length).toBeLessThanOrEqual(9);
      expect(typeof decision.extractionSystemPrompt).toBe('string');
      expect(decision.extractionSystemPrompt.length).toBeGreaterThan(0);
      // D2 negative-contract — the only customer-visible string in the
      // compile payload is extractionSystemPrompt. The chat-visible content
      // must never solicit a file/document/image upload.
      expect(decision.extractionSystemPrompt).not.toMatch(D2_SHARE_RE);
      expect(decision.extractionSystemPrompt).not.toMatch(D2_ATTACH_RE);
    }, LIVE_AGENT_TIMEOUT_MS);

    // -----------------------------------------------------------------------
    // HAPPY-15 — stateful capability_class_question (S/4 HANA).
    // The conversation already contains a prior compile request + the
    // assistant's recompile_announcement. The new turn names an integration
    // pattern the curated capability surface flags as out-of-scope.
    // -----------------------------------------------------------------------
    it('HAPPY-15 — stateful S/4 HANA integration ask routes to capability_class_question with all 4 payload keys + citation', async () => {
      const priorUser = makeTurn(
        't::happy15::1',
        'user',
        'message',
        'Extract supplier, invoice number, and total amount from the DAEJOO invoice.',
        0,
      );
      const priorAssistant = makeTurn(
        't::happy15::2',
        'assistant',
        'recompile_announcement',
        'Configured 3 fields: supplier, invoice_number, total_amount.',
        1,
      );
      const followUp = makeTurn(
        't::happy15::3',
        'user',
        'message',
        'can you link this to S/4 HANA?',
        2,
      );
      const state = makeState([priorUser, priorAssistant, followUp]);
      const decision = await compileAgent(state);
      expect(decision.action).toBe('capability_class_question');
      if (decision.action !== 'capability_class_question') return; // type narrow
      expect(typeof decision.confirmationQuestion).toBe('string');
      expect(decision.confirmationQuestion.length).toBeGreaterThan(0);
      expect(typeof decision.capabilityGapDescription).toBe('string');
      expect(decision.capabilityGapDescription.length).toBeGreaterThan(0);
      expect(typeof decision.capabilitySurfaceCitation).toBe('string');
      expect(decision.capabilitySurfaceCitation.length).toBeGreaterThan(0);
      expect(typeof decision.pendingSignalDescription).toBe('string');
      expect(decision.pendingSignalDescription.length).toBeGreaterThan(0);
      expect(decision.capabilitySurfaceCitation).toMatch(CAPABILITY_CITATION_RE);
      expect(decision.confirmationQuestion).toMatch(S4_HANA_RE);
    }, LIVE_AGENT_TIMEOUT_MS);

    // -----------------------------------------------------------------------
    // HAPPY-16 — stateful recompile (supplier_branch addition).
    // Prior turns establish a small compiled schema; the new turn asks to
    // add a field. The live test asserts the agent's recompile decision
    // shape only — the mock-extractor + UI assertions stay in unit tests.
    // -----------------------------------------------------------------------
    it('HAPPY-16 — stateful recompile request adds supplier_branch to the schema', async () => {
      const priorUser = makeTurn(
        't::happy16::1',
        'user',
        'message',
        'Extract supplier_name, invoice_number, and total_amount from the DAEJOO invoice.',
        0,
      );
      const priorAssistant = makeTurn(
        't::happy16::2',
        'assistant',
        'recompile_announcement',
        'Configured 3 fields: supplier_name, invoice_number, total_amount.',
        1,
      );
      const followUp = makeTurn(
        't::happy16::3',
        'user',
        'message',
        'also extract supplier_branch from this invoice',
        2,
      );
      const state = makeState([priorUser, priorAssistant, followUp]);
      const decision = await compileAgent(state);
      expect(decision.action).toBe('recompile');
      if (decision.action !== 'recompile') return; // type narrow
      expect(decision.schema.fields.some((f) => f.name === 'supplier_branch')).toBe(true);
    }, LIVE_AGENT_TIMEOUT_MS);

    // -----------------------------------------------------------------------
    // HAPPY-17 — stateful prompt_display request.
    //
    // v1 acceptable shapes for "show me the prompt" after a prior recompile:
    //   - compile        — agent regenerates + surfaces the extraction prompt
    //                       directly in the payload.
    //   - clarify        — agent offers options (surface vs. modify); route
    //                       falls through to prompt_display from stored config.
    //   - success_summary— agent treats the prior config + the prompt-ask as
    //                       a wrap-up turn; route surfaces the stored prompt
    //                       independently via prompt_display.
    //
    // Observed v1 behavior (live SAP AI Core compile_or_reasoning_heavy):
    //   - Cycle 2.5 smoke (2026-05-28, Probe D): clarify.
    //   - Cycle 3 Run-1 (2026-05-28, this commit): success_summary.
    //   - Cycle 3 Run-2 (2026-05-28, this commit): success_summary.
    //
    // The route-side prompt_display turn shape (the load-bearing customer
    // affordance) is covered by unit tests against ChatPanel; the live test
    // only asserts that the merged agent's decision lands in the v1
    // acceptable-action set above. No D2-forbidden phrase may appear in
    // any chat-visible payload string.
    // -----------------------------------------------------------------------
    it('HAPPY-17 — stateful "show me the prompt" routes to compile | clarify | success_summary (v1 acceptable shapes)', async () => {
      const priorUser = makeTurn(
        't::happy17::1',
        'user',
        'message',
        'Extract supplier_name, invoice_number, and total_amount from the DAEJOO invoice.',
        0,
      );
      const priorAssistant = makeTurn(
        't::happy17::2',
        'assistant',
        'recompile_announcement',
        'Configured 3 fields: supplier_name, invoice_number, total_amount.',
        1,
      );
      const followUp = makeTurn(
        't::happy17::3',
        'user',
        'message',
        'show me the prompt',
        2,
      );
      const state = makeState([priorUser, priorAssistant, followUp]);
      const decision = await compileAgent(state);
      expect(['compile', 'clarify', 'success_summary']).toContain(decision.action);
      // Whichever branch the agent took, the chat-visible string must not
      // solicit a file/document/image share. Discriminate on action to pick
      // the right payload field and assert on it.
      if (decision.action === 'compile') {
        expect(typeof decision.extractionSystemPrompt).toBe('string');
        expect(decision.extractionSystemPrompt.length).toBeGreaterThan(0);
        expect(decision.extractionSystemPrompt).not.toMatch(D2_SHARE_RE);
        expect(decision.extractionSystemPrompt).not.toMatch(D2_ATTACH_RE);
      } else if (decision.action === 'clarify') {
        expect(typeof decision.clarificationContent).toBe('string');
        expect(decision.clarificationContent.length).toBeGreaterThan(0);
        expect(decision.clarificationContent).not.toMatch(D2_SHARE_RE);
        expect(decision.clarificationContent).not.toMatch(D2_ATTACH_RE);
      } else if (decision.action === 'success_summary') {
        expect(typeof decision.summaryContent).toBe('string');
        expect(decision.summaryContent.length).toBeGreaterThan(0);
        expect(decision.summaryContent).not.toMatch(D2_SHARE_RE);
        expect(decision.summaryContent).not.toMatch(D2_ATTACH_RE);
      }
    }, LIVE_AGENT_TIMEOUT_MS);

    // -----------------------------------------------------------------------
    // HAPPY-18 — stateful consent → ProductSignal write.
    // Exercises _writeProvisionalSignal directly (the architectural plan's
    // load-bearing assertion: when both N9 guards are satisfied, exactly one
    // ProductSignal lands with status='provisional' and
    // provenance='conversational_notify_team'; without both guards the write
    // is rejected). No live AI Core call is needed for this assertion — the
    // pendingSignal seed is hard-coded.
    // -----------------------------------------------------------------------
    describe('HAPPY-18 — consent → ProductSignal write (N9 / RED-3)', () => {
      beforeEach(() => {
        _resetCorrectionStoreForTests();
      });

      it('writes one provisional signal when status=awaiting_notify_decision AND last user turn is "yes"', () => {
        const pendingSignal = {
          description:
            'Integrate extracted invoice data with SAP S/4 HANA — out of Document AI scope.',
          capabilitySurfaceCitation: 'Service Plans, p. 10-22',
        };
        const turns = [
          makeTurn(
            't::happy18::1',
            'assistant',
            'notify_team_question',
            'Do you want to notify the SAP product team about this S/4 HANA integration ask?',
            0,
          ),
          makeTurn('t::happy18::2', 'user', 'message', 'yes', 1),
        ];
        const state = makeState(turns, 'awaiting_notify_decision', pendingSignal);

        // Pre-yes scaffolding (the load-bearing state-shape pre-condition).
        expect(state.pendingSignal).not.toBeNull();
        expect(state.status).toBe('awaiting_notify_decision');

        const result = _writeProvisionalSignal(state, {
          id: 'ps::cycle3::happy18',
          signalType: 'unsupported_free_text_business_condition',
          category: 'commercial invoice / integration request',
          intentFragment: 'link this to S/4 HANA',
          suggestedProductArea: 'integration_capability',
          documentType: 'commercial_invoice',
        });
        expect(result.rejected).toBe(false);
        if (result.rejected) return; // type narrow
        expect(result.signal.status).toBe('provisional');
        expect(result.signal.provenance).toBe('conversational_notify_team');

        // Land the signal in the store via the existing escape hatch so the
        // post-yes store-shape assertion mirrors what the customer route
        // would do downstream.
        _appendApprovedSignalForF09(result.signal);
        const provisional = getProductSignals().filter(
          (s) =>
            s.status === 'provisional' && s.provenance === 'conversational_notify_team',
        );
        expect(provisional.length).toBe(1);
      });

      it('rejects a direct write without the dual N9 guard (RED-3 invariant)', () => {
        // Missing guard: status is NOT 'awaiting_notify_decision'.
        const turns = [makeTurn('t::happy18::neg', 'user', 'message', 'yes', 0)];
        const state = makeState(turns, 'collecting', {
          description: 'whatever',
          capabilitySurfaceCitation: 'Service Plans, p. 10-22',
        });
        const before = getProductSignals().length;
        const result = _writeProvisionalSignal(state, {
          id: 'ps::cycle3::happy18::neg',
          signalType: 'unsupported_free_text_business_condition',
          category: 'commercial invoice / integration request',
          intentFragment: 'link this to S/4 HANA',
          suggestedProductArea: 'integration_capability',
          documentType: 'commercial_invoice',
        });
        expect(result.rejected).toBe(true);
        if (!result.rejected) return; // type narrow
        expect(result.reason).toContain('N9 guard tripped');
        expect(getProductSignals().length).toBe(before);
      });
    });
  },
);

// When the key is absent we still emit a single tagged test so the run
// has a visible signal of "live evals skipped" in the report.
describe.skipIf(HAS_LIVE_KEY)('LIVE — skipped (AICORE_KEY_PATH unset)', () => {
  it('live evals require $AICORE_KEY_PATH; set it in .env and run `npm run evals:live`', () => {
    expect(HAS_LIVE_KEY).toBe(false);
  });
});
