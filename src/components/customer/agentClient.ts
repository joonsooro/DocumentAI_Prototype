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
 */

import type {
  CapabilityAssessment,
  ClarificationRequest,
  CompiledConfiguration,
  CustomerIntent,
  QualityMetric,
  ReadinessDecision,
} from '@domain/types';

type AgentFailureWire = {
  readonly kind: 'failure';
  readonly clarification: ClarificationRequest;
  readonly metric: QualityMetric;
};

export type CompileResponse =
  | { readonly kind: 'success'; readonly intent: CustomerIntent; readonly configuration: CompiledConfiguration }
  | AgentFailureWire;

export type CapabilityResponse =
  | { readonly kind: 'success'; readonly assessments: readonly CapabilityAssessment[] }
  | AgentFailureWire;

export type ReadinessResponse =
  | {
      readonly kind: 'success';
      readonly readiness: ReadinessDecision;
      readonly clarifications: readonly ClarificationRequest[];
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

export async function postCompile(args: {
  readonly raw: string;
  readonly documentType?: string;
}): Promise<CompileResponse> {
  return postJson<CompileResponse>('/api/compile', args);
}

export async function postCapability(args: {
  readonly intent: CustomerIntent;
  readonly configuration: CompiledConfiguration;
}): Promise<CapabilityResponse> {
  return postJson<CapabilityResponse>('/api/capability', args);
}

export async function postReadiness(args: {
  readonly intent: CustomerIntent;
  readonly configuration: CompiledConfiguration;
}): Promise<ReadinessResponse> {
  return postJson<ReadinessResponse>('/api/readiness', args);
}
