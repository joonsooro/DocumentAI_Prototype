/**
 * S3.5 F-11-live — browser-side agent client.
 *
 * Thin typed fetch wrappers around the three /api/* endpoints exposed by
 * src/server/devAgentMiddleware.ts. The browser bundle imports ONLY type
 * shapes from @domain/types (TypeScript strips type-only imports at build) —
 * NEVER the agent implementations or src/runtime/aiCoreClient.ts, which
 * carry the SAP AI Core service-key access path.
 *
 * Each endpoint returns either { kind: 'success', ...payload } or
 * { kind: 'failure', clarification, metric } — the same discriminated union
 * the server emits. The customer route consumes the union directly.
 *
 * Cycle 2 (2026-05-28): postChatTurnDecide DELETED. postCompile now takes
 * a ConversationState and returns the merged Compile Agent's
 * CompileAgentDecision (5-action discriminated union per A17).
 */

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
import { recordCustom } from '@runtime/qualityMetricLog';

type AgentFailureWire = {
  readonly kind: 'failure';
  readonly clarification: ClarificationRequest;
  readonly metric: QualityMetric;
  readonly metrics: readonly QualityMetric[];
};

export type CompileResponse =
  | { readonly kind: 'success'; readonly decision: CompileAgentDecision; readonly metrics: readonly QualityMetric[] }
  | AgentFailureWire;

export type CapabilityResponse =
  | { readonly kind: 'success'; readonly assessments: readonly CapabilityAssessment[]; readonly metrics: readonly QualityMetric[] }
  | AgentFailureWire;

export type ReadinessResponse =
  | {
      readonly kind: 'success';
      readonly readiness: ReadinessDecision;
      readonly clarifications: readonly ClarificationRequest[];
      readonly metrics: readonly QualityMetric[];
    }
  | AgentFailureWire;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    // 4xx/5xx are middleware-level errors (request-shape, not agent failures).
    // We do NOT echo response text into the rendered DOM (agent_client_contract
    // must_not). The caller surfaces a generic "request failed" message and
    // the operator inspects the network panel for detail.
    throw new Error(`${path} returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

/**
 * SF #2f — replay mirrored sidecar QualityMetric rows into the browser-side
 * qualityMetricLog so the Agent I/O Dashboard on /internal reflects what
 * really fired. Fire-and-forget: a malformed row, or a response payload that
 * predates the SF #2f wire (missing metrics field, e.g. from older test
 * stubs), never breaks the agent path. Mirrors the pattern at
 * aiCoreClient.ts:419-422.
 */
function replayMetricsToBrowserStore(metrics: readonly QualityMetric[] | undefined): void {
  if (!metrics || !Array.isArray(metrics)) return;
  for (const row of metrics) {
    try {
      recordCustom(
        {
          agent: row.agent,
          status: row.status,
          latencyMs: row.latencyMs,
          tokenUsage: row.tokenUsage,
          model: row.model,
          maxTokens: row.maxTokens,
          error: row.error,
        },
        { nowIso: row.loggedAt },
      );
    } catch {
      // observability must never break the agent path
    }
  }
}

export async function postCompile(args: {
  readonly conversation: ConversationState;
}): Promise<CompileResponse> {
  const response = await postJson<CompileResponse>('/api/compile', args);
  replayMetricsToBrowserStore(response.metrics);
  return response;
}

export async function postCapability(args: {
  readonly intent: CustomerIntent;
  readonly configuration: CompiledConfiguration;
}): Promise<CapabilityResponse> {
  const response = await postJson<CapabilityResponse>('/api/capability', args);
  replayMetricsToBrowserStore(response.metrics);
  return response;
}

export async function postReadiness(args: {
  readonly intent: CustomerIntent;
  readonly configuration: CompiledConfiguration;
}): Promise<ReadinessResponse> {
  const response = await postJson<ReadinessResponse>('/api/readiness', args);
  replayMetricsToBrowserStore(response.metrics);
  return response;
}
