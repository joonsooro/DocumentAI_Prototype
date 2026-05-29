/**
 * S3.5 F-11-live — Dev-server agent middleware.
 *
 * The browser bundle MUST NOT import from src/runtime/aiCoreClient.ts (Node
 * fs + service-key access) nor from src/domain/* (which transitively imports
 * aiCoreClient). This Vite middleware runs inside the Node-side dev server,
 * holds the agent imports, and exposes three JSON endpoints the browser can
 * POST to:
 *
 *   POST /api/compile     { conversation }   → { kind: 'success', decision: CompileAgentDecision } | failure
 *   POST /api/capability  { intent, configuration }
 *   POST /api/readiness   { intent, configuration }
 *
 * Cycle 2 (2026-05-28) rewrite: /api/compile now carries the merged Compile
 * Agent's CompileAgentDecision discriminated union (per A17). The prior
 * /api/chat-turn-decide endpoint has been DELETED — its job is absorbed
 * into /api/compile's 5-action output.
 *
 * Each handler wraps its agent call in F-08 runAgentWithFailureSurface, so an
 * AgentFailure becomes a structured 200 + { kind:'failure', clarification,
 * metric } JSON response — NEVER a 500 with a stack trace (N4 / agent_client_
 * contract.must_not). Request-shape errors (missing body field) return a
 * plain 400. Stateless: the client echoes intent + configuration back on each
 * follow-up call, so there is no server-side session map.
 *
 * Mounted by vite.config.ts via the configureServer hook. Only active in the
 * dev server — production builds never see this code path because this module
 * is never imported from src/components/** or src/routes/**.
 */

import type { Connect } from 'vite';
import type {
  CapabilityAssessment,
  ClarificationRequest,
  CompileAgentDecision,
  CompiledConfiguration,
  ConversationState,
  CustomerIntent,
  QualityMetric,
  ReadinessDecision,
} from '@domain/types';
import { compileAgent } from '@domain/compileIntentToConfiguration';
import { assessCapabilities } from '@domain/assessCapabilities';
import { decideReadiness } from '@domain/decideReadiness';
import { generateClarificationRequests } from '@domain/generateClarificationRequests';
import { simulateDocumentRun } from '@domain/simulateDocumentRun';
import { runAgentWithFailureSurface } from '@domain/agentFailureSurface';
import { captureMetricsDuring } from '@runtime/qualityMetricLog';
import { DAEJOO_PDF_URL } from '@data/assets';

// ---------------------------------------------------------------------------
// Wire types — what the browser sees over the network. Domain types are the
// source of truth; the wire layer just narrows where shapes are echoed back
// on follow-up calls (stateless server).
// ---------------------------------------------------------------------------

interface CompileRequest {
  readonly conversation: ConversationState;
}

interface ChainRequest {
  readonly intent: CustomerIntent;
  readonly configuration: CompiledConfiguration;
}

type AgentSuccess<T extends object> = { readonly kind: 'success'; readonly metrics: readonly QualityMetric[] } & T;
type AgentFailureWire = {
  readonly kind: 'failure';
  readonly clarification: ClarificationRequest;
  readonly metric: QualityMetric;
  readonly metrics: readonly QualityMetric[];
};

export type CompileResponse =
  | AgentSuccess<{ decision: CompileAgentDecision }>
  | AgentFailureWire;
export type CapabilityResponse =
  | AgentSuccess<{ assessments: readonly CapabilityAssessment[] }>
  | AgentFailureWire;
export type ReadinessResponse =
  | AgentSuccess<{
      readiness: ReadinessDecision;
      clarifications: readonly ClarificationRequest[];
    }>
  | AgentFailureWire;

// ---------------------------------------------------------------------------
// Handlers — pure functions over a parsed body. Exported so the test suite
// can exercise them without standing up a real HTTP server.
// ---------------------------------------------------------------------------

export async function handleCompile(body: CompileRequest): Promise<CompileResponse> {
  const { result: outcome, metrics } = await captureMetricsDuring(() =>
    runAgentWithFailureSurface(
      'compile',
      () => compileAgent(body.conversation),
    ),
  );

  if (outcome.kind === 'success') {
    return { kind: 'success', decision: outcome.value, metrics };
  }
  return { kind: 'failure', clarification: outcome.clarification, metric: outcome.metric, metrics };
}

export async function handleCapability(body: ChainRequest): Promise<CapabilityResponse> {
  const { result: outcome, metrics } = await captureMetricsDuring(() =>
    runAgentWithFailureSurface(
      'capability',
      () => assessCapabilities(body.intent, body.configuration),
    ),
  );

  if (outcome.kind === 'success') {
    return { kind: 'success', assessments: outcome.value, metrics };
  }
  return { kind: 'failure', clarification: outcome.clarification, metric: outcome.metric, metrics };
}

export async function handleReadiness(body: ChainRequest): Promise<ReadinessResponse> {
  // F-03 mock extractor runs server-side. Path is the canonical DAEJOO asset
  // — keeping the browser free of @domain/* imports means the client never
  // names the document path either. captureMetricsDuring wraps both the
  // readiness reasoning call AND the deterministic clarification generation
  // inside one capture scope so any push from either path mirrors back to
  // the browser dashboard.
  const { result, metrics } = await captureMetricsDuring(async () => {
    const run = simulateDocumentRun(DAEJOO_PDF_URL, body.configuration);
    const outcome = await runAgentWithFailureSurface(
      'readiness',
      () => decideReadiness(run, body.configuration),
    );
    // F-07 missed/low-confidence clarifications are pure-deterministic and run
    // regardless of the readiness reasoning outcome — same as the eval surface.
    const f07Clarifications = generateClarificationRequests(run, body.configuration);
    return { outcome, f07Clarifications };
  });

  if (result.outcome.kind === 'success') {
    return {
      kind: 'success',
      readiness: result.outcome.value,
      clarifications: result.f07Clarifications,
      metrics,
    };
  }
  return {
    kind: 'failure',
    clarification: result.outcome.clarification,
    metric: result.outcome.metric,
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Connect-style middleware — used by vite.config.ts configureServer
// ---------------------------------------------------------------------------

const HANDLERS = {
  '/api/compile': handleCompile as (body: unknown) => Promise<unknown>,
  '/api/capability': handleCapability as (body: unknown) => Promise<unknown>,
  '/api/readiness': handleReadiness as (body: unknown) => Promise<unknown>,
} satisfies Record<string, (body: unknown) => Promise<unknown>>;

type Handled = keyof typeof HANDLERS;

function isHandled(url: string | undefined): url is Handled {
  return url !== undefined && Object.prototype.hasOwnProperty.call(HANDLERS, url);
}

function validate(url: Handled, body: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body_must_be_json_object' };
  }
  const b = body as Record<string, unknown>;
  if (url === '/api/compile') {
    if (typeof b.conversation !== 'object' || b.conversation === null) {
      return { ok: false, error: 'conversation_required' };
    }
  } else {
    if (typeof b.intent !== 'object' || b.intent === null) {
      return { ok: false, error: 'intent_required' };
    }
    if (typeof b.configuration !== 'object' || b.configuration === null) {
      return { ok: false, error: 'configuration_required' };
    }
  }
  return { ok: true };
}

async function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function agentMiddleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method !== 'POST' || !isHandled(req.url)) {
      next();
      return;
    }
    const url = req.url;
    void (async () => {
      let parsed: unknown;
      try {
        const raw = await readBody(req);
        parsed = raw.length === 0 ? {} : JSON.parse(raw);
      } catch (err) {
        sendJson(res, 400, { error: 'invalid_json', detail: (err as Error).message });
        return;
      }
      const v = validate(url, parsed);
      if (!v.ok) {
        sendJson(res, 400, { error: v.error });
        return;
      }
      try {
        const result = await HANDLERS[url](parsed);
        sendJson(res, 200, result);
      } catch (err) {
        // runAgentWithFailureSurface never throws — but if a non-agent error
        // does escape (e.g. simulateDocumentRun's unregistered-fixture throw),
        // surface it as a 500 with a generic message. We do not echo prompts.
        sendJson(res, 500, {
          error: 'middleware_error',
          detail: (err as Error).message,
        });
      }
    })();
  };
}
