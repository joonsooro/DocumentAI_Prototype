/**
 * S4.5 OBSERVE-WIRE — Langfuse client wrapper (DEP-3 in app-spec.json).
 *
 * Single load-bearing wrapper for every Langfuse touchpoint in the prototype.
 * Mirrors the pattern aiCoreClient.ts established for the SAP AI Core OAuth +
 * spend-cap surface — one file, one privacy boundary, one fail-soft point.
 *
 * Privacy invariants (load-bearing — extend agent_client_contract.must_not):
 *   - NEVER log system or user prompt content to Langfuse.
 *   - NEVER log model response text to Langfuse.
 *   - NEVER log the OAuth bearer token, the service-key file contents, or
 *     AICORE_KEY_PATH's resolved value.
 *   - NEVER log LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY values.
 *   - Trace capture is fire-and-forget: SDK throws at the boundary are
 *     warn-once'd and suppressed; the in-memory QualityMetric log + the F-18
 *     Internal panel + the Vitest eval report stay the system of record.
 *
 * Server-only: the dist audit (grep dist/assets/*.js for
 * AICORE_KEY_PATH | clientsecret | callAgent | langfuse | LANGFUSE) MUST
 * return ZERO matches. This module sits next to aiCoreClient.ts under
 * src/runtime/ — already proven server-only by the S3.REBUILD audit.
 *
 * Boot:
 *   - LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY both set → register a
 *     NodeTracerProvider + LangfuseSpanProcessor + enabled = true.
 *   - Either key missing → one console.warn line, enabled stays false, every
 *     helper becomes a no-op. Disabled is NOT a fatal error.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
  setLangfuseTracerProvider,
  startActiveObservation,
  startObservation,
  updateActiveObservation,
} from '@langfuse/tracing';
import type { QualityMetric } from '@domain/types';

// ---------------------------------------------------------------------------
// Module-level state — one boot per process
// ---------------------------------------------------------------------------

let enabled = false;
let initialised = false;
let processor: LangfuseSpanProcessor | null = null;
let warnedOnce = false;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Initialise the Langfuse tracer provider exactly once per process. Safe to
 * call multiple times — subsequent calls are no-ops. Returns true when trace
 * capture is enabled. NEVER throws.
 */
export function initLangfuseTracerProvider(): boolean {
  if (initialised) return enabled;
  initialised = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/$/, '');

  if (!publicKey || !secretKey) {
    warnOnce('[langfuse] disabled: LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set');
    return false;
  }

  try {
    processor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl });
    const provider = new NodeTracerProvider({ spanProcessors: [processor] });
    provider.register();
    setLangfuseTracerProvider(provider);
    enabled = true;
    console.info('[langfuse] enabled: trace capture active');
    return true;
  } catch (err) {
    // Boot-time SDK failure is observability, not correctness — warn and
    // continue. This is the only catch on the boot path; downstream helpers
    // assume `enabled === true` means a real provider is registered.
    warnOnce(`[langfuse] disabled: boot failed (${(err as Error).message})`);
    processor = null;
    enabled = false;
    return false;
  }
}

/**
 * Flush pending spans and shut the provider down. Called from the dev
 * server's SIGINT / process-exit hook. Best-effort: the process may be on
 * its way out so a flush failure cannot be surfaced upward in any useful way.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (!enabled || !processor) return;
  try {
    await processor.forceFlush();
    await processor.shutdown();
  } catch (err) {
    warnOnce(`[langfuse] shutdown flush failed: ${(err as Error).message}`);
  }
}

/** Test-only — reset the module-level state. */
export function _resetLangfuseClientForTests(): void {
  enabled = false;
  initialised = false;
  processor = null;
  warnedOnce = false;
}

// ---------------------------------------------------------------------------
// Helpers — the only call sites the rest of the codebase touches
// ---------------------------------------------------------------------------

export interface InstrumentCallAgentParams {
  readonly agent: string;
  readonly model: string;
  readonly max_tokens: number;
}

export interface InstrumentCallAgentMeta {
  readonly status: number;
  readonly latency_ms: number;
  readonly token_usage: { readonly input: number; readonly output: number } | null;
}

/**
 * Wrap the inner HTTP fetch of aiCoreClient.callAgent in a Langfuse
 * `generation` observation. The thunk runs unchanged; this wrapper attaches
 * metadata around it.
 *
 * Privacy: input / output content fields are NEVER attached. Only safe
 * metadata: agent name, model (deployment ID), max_tokens, latency_ms,
 * token_usage, http_status, and on failure {reason, httpStatus} from
 * AgentFailure.
 *
 * Re-throws AgentFailure unchanged so F-08 still converts to
 * ClarificationRequest + QualityMetric per N4 / EDGE-2.
 */
export async function instrumentCallAgent<T>(
  params: InstrumentCallAgentParams,
  fn: () => Promise<{ result: T; meta: InstrumentCallAgentMeta }>,
): Promise<{ result: T; meta: InstrumentCallAgentMeta }> {
  if (!enabled) return fn();

  return startActiveObservation(
    `aiCore.${params.agent}`,
    async () => {
      attachGenerationMetadata({
        model: params.model,
        modelParameters: { max_tokens: params.max_tokens },
        metadata: { agent: params.agent, capture_content: 'never' },
      });

      try {
        const value = await fn();
        attachGenerationMetadata({
          usageDetails: value.meta.token_usage
            ? { input: value.meta.token_usage.input, output: value.meta.token_usage.output }
            : undefined,
          metadata: {
            agent: params.agent,
            latency_ms: value.meta.latency_ms,
            http_status: value.meta.status,
            outcome: 'success',
            capture_content: 'never',
          },
        });
        return value;
      } catch (err) {
        // AgentFailure shape is locked by aiCoreClient.ts — reason is an enum
        // string, httpStatus is number|null, both safe to attach.
        const failure = err as { reason?: string; httpStatus?: number | null };
        attachGenerationMetadata({
          level: 'ERROR',
          statusMessage: failure.reason,
          metadata: {
            agent: params.agent,
            outcome: 'failure',
            reason: failure.reason,
            http_status: failure.httpStatus ?? null,
            capture_content: 'never',
          },
        });
        throw err;
      }
    },
    { asType: 'generation' },
  );
}

/**
 * Emit a child span for a pure-function agent (F-07 clarification, F-09
 * governance) that runs synchronously without an HTTP call. Attaches to the
 * active parent trace when one exists.
 *
 * Fire-and-forget by design: the pure function's behaviour is unchanged
 * whether Langfuse is enabled, disabled, or mid-failure.
 */
export function recordChildAgentSpan(params: { readonly agent: string; readonly latencyMs: number }): void {
  if (!enabled) return;
  void startActiveObservation(
    `agent.${params.agent}`,
    () => {
      attachSpanMetadata({
        metadata: {
          agent: params.agent,
          latency_ms: params.latencyMs,
          kind: 'pure_function_agent',
          capture_content: 'never',
        },
      });
    },
    { asType: 'span' },
  );
}

/**
 * Emit a Langfuse event for a QualityMetric entry. Called from the F-18
 * mirror sink that subscribes to the in-memory store.
 *
 * Writes ONLY agent, status, latencyMs, tokenUsage counts, error reason
 * (already a typed string from AgentFailureReason), model deployment id,
 * loggedAt. NEVER prompts, response text, OAuth token, or service-key path.
 */
export function recordQualityMetricEvent(metric: QualityMetric): void {
  if (!enabled) return;
  try {
    // Events auto-end on creation, so the factory startObservation form fits
    // here — not startActiveObservation, which is for scoped callbacks.
    startObservation(
      `qualityMetric.${metric.agent}`,
      {
        level: metric.status === 'fail' ? 'ERROR' : 'DEFAULT',
        statusMessage: metric.error ?? undefined,
        metadata: {
          agent: metric.agent,
          status: metric.status,
          latency_ms: metric.latencyMs,
          token_usage: metric.tokenUsage
            ? { input: metric.tokenUsage.input, output: metric.tokenUsage.output }
            : null,
          model: metric.model,
          logged_at: metric.loggedAt,
          source: 'qualityMetricLog',
          capture_content: 'never',
        },
      },
      { asType: 'event' },
    );
  } catch (err) {
    warnOnce(`[langfuse] qualityMetric event emit failed: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attach metadata to the active Langfuse observation. The SDK has overloaded
 * updateActiveObservation by asType — generation accepts model / modelParameters
 * / usageDetails, span/event accept only the base set. We provide two narrow
 * helpers so the call sites pick the right one explicitly.
 *
 * An SDK throw here means metadata is mis-shaped — bug, warn-once, never
 * propagate (observability MUST NOT break the agent call).
 */

type GenerationAttrs = {
  readonly model?: string;
  readonly modelParameters?: Record<string, string | number>;
  readonly usageDetails?: Record<string, number>;
  readonly metadata?: Record<string, unknown>;
  readonly level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  readonly statusMessage?: string;
};

type SpanAttrs = {
  readonly metadata?: Record<string, unknown>;
  readonly level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  readonly statusMessage?: string;
};

function attachGenerationMetadata(attrs: GenerationAttrs): void {
  try {
    updateActiveObservation(attrs, { asType: 'generation' });
  } catch (err) {
    warnOnce(`[langfuse] metadata attach failed: ${(err as Error).message}`);
  }
}

function attachSpanMetadata(attrs: SpanAttrs): void {
  try {
    updateActiveObservation(attrs);
  } catch (err) {
    warnOnce(`[langfuse] metadata attach failed: ${(err as Error).message}`);
  }
}

function warnOnce(msg: string): void {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(msg);
}
