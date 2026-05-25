/**
 * Shared SAP AI Core client — F-04 (DEP-1 in app-spec.json).
 *
 * Single load-bearing wrapper for every live AI Core call in the prototype.
 * F-04 (compile), F-05 (capability), F-06 (gap router), F-07 (clarification),
 * F-10 (readiness), F-15 (admin recs) all go through callAgent().
 *
 * Contract (app-spec.json#agent_client_contract):
 *   must:
 *     - load credentials via process.env.AICORE_KEY_PATH at boot; fail-fast
 *     - obtain OAuth token via client-credentials flow; cache in-memory only
 *     - reject any callAgent invocation missing { model } or { max_tokens }
 *     - stamp every AgentResult with { agent, source: 'aiCore', templateUsed: false, latency_ms, token_usage }
 *     - on failure throw AgentFailure { agent, reason, raw }
 *   must_not:
 *     - never substitute a canned fallback response (N4)
 *     - never log/persist the service key or the OAuth token
 *     - never echo system or user prompts back into rendered DOM
 *
 * Spec invariants enforced here:
 *   - HAPPY-3 / A1: source is always 'aiCore', templateUsed always false
 *   - N4 / EDGE-2: no canned fallback; failures throw AgentFailure (F-08 turns
 *     them into ClarificationRequest + QualityMetric downstream)
 *   - DEP-1 spend cap: model + max_tokens enforced at the type level (required
 *     params) and at the runtime level (defensive guard before dispatch)
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CallAgentParams<T = string> {
  /** Logical agent name (e.g. 'compile', 'capability'). Stamped on every result. */
  readonly agent: string;
  /** AI Core deployment ID (NOT a model name). e.g. 'd-abc123...' */
  readonly model: string;
  /** Hard cap on output tokens. Required — wrapper rejects calls without it. */
  readonly max_tokens: number;
  /** System prompt (sets agent role / constraints / negative-contract guards). */
  readonly system: string;
  /** User-message prompt (the actual input to reason over). */
  readonly user: string;
  /**
   * Optional JSON-validation hook. If supplied, the wrapper parses the model
   * response as JSON, runs it through `validate`, and throws AgentFailure on
   * any parse/validation error. Return value is the validated T that lands in
   * AgentResult<T>.value — the caller chooses T at the call site.
   */
  readonly expect_json_schema?: (parsed: unknown) => T;
  /** Optional override of the default request timeout (ms). */
  readonly timeout_ms?: number;
  /** Optional override of the default resource group (defaults to 'default'). */
  readonly resource_group?: string;
}

export interface AgentResult<T = string> {
  readonly agent: string;
  readonly source: 'aiCore';
  readonly templateUsed: false;
  readonly latency_ms: number;
  readonly token_usage: { readonly input: number; readonly output: number } | null;
  readonly model: string;
  readonly max_tokens: number;
  /** Raw text response when expect_json_schema not supplied; T when it is. */
  readonly value: T;
}

export type AgentFailureReason =
  | 'missing_model'
  | 'missing_max_tokens'
  | 'credential_load_failed'
  | 'oauth_failed'
  | 'http_error'
  | 'timeout'
  | 'malformed_json'
  | 'schema_validation_failed'
  | 'empty_response';

export class AgentFailure extends Error {
  readonly agent: string;
  readonly reason: AgentFailureReason;
  readonly raw: unknown;
  readonly httpStatus: number | null;
  constructor(opts: { agent: string; reason: AgentFailureReason; message: string; raw?: unknown; httpStatus?: number | null }) {
    super(opts.message);
    this.name = 'AgentFailure';
    this.agent = opts.agent;
    this.reason = opts.reason;
    this.raw = opts.raw ?? null;
    this.httpStatus = opts.httpStatus ?? null;
  }
}

// ---------------------------------------------------------------------------
// Service-key loading
// ---------------------------------------------------------------------------

interface AiCoreServiceKey {
  readonly serviceurls: { readonly AI_API_URL: string };
  readonly resourcegroup?: string;
  readonly clientid: string;
  readonly clientsecret: string;
  readonly url: string; // XSUAA token base URL
}

const REQUIRED_KEY_FIELDS = ['serviceurls', 'clientid', 'clientsecret', 'url'] as const;

let cachedServiceKey: AiCoreServiceKey | null = null;

/**
 * Load the AI Core service key from $AICORE_KEY_PATH. Memoised — the file
 * is read once per process. Throws AgentFailure on any failure mode so the
 * wrapper's error surface stays uniform.
 */
export function loadServiceKey(): AiCoreServiceKey {
  if (cachedServiceKey) return cachedServiceKey;
  const path = process.env.AICORE_KEY_PATH;
  if (!path) {
    throw new AgentFailure({
      agent: 'aiCoreClient.loadServiceKey',
      reason: 'credential_load_failed',
      message: 'AICORE_KEY_PATH env var not set. Add it to gitignored .env (per app-spec DEP-1).',
    });
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new AgentFailure({
      agent: 'aiCoreClient.loadServiceKey',
      reason: 'credential_load_failed',
      message: `AI Core service key file not readable at AICORE_KEY_PATH (${(err as Error).message}).`,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AgentFailure({
      agent: 'aiCoreClient.loadServiceKey',
      reason: 'credential_load_failed',
      message: `AI Core service key is not valid JSON (${(err as Error).message}).`,
    });
  }
  const obj = parsed as Record<string, unknown>;
  const missing = REQUIRED_KEY_FIELDS.filter((k) => !(k in obj));
  if (missing.length > 0) {
    throw new AgentFailure({
      agent: 'aiCoreClient.loadServiceKey',
      reason: 'credential_load_failed',
      message: `AI Core service key missing required field(s): ${missing.join(', ')}.`,
    });
  }
  cachedServiceKey = parsed as AiCoreServiceKey;
  return cachedServiceKey;
}

/** Test-only — reset the service-key + token cache between Vitest cases. */
export function _resetClientForTests(): void {
  cachedServiceKey = null;
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// OAuth token cache
// ---------------------------------------------------------------------------

interface CachedToken {
  readonly access_token: string;
  readonly expires_at_ms: number;
}

let cachedToken: CachedToken | null = null;

/** Refresh the OAuth token if needed and return a valid one. */
async function ensureToken(key: AiCoreServiceKey): Promise<string> {
  const now = Date.now();
  // Refresh 60s before nominal expiry so a token never expires mid-flight.
  if (cachedToken && cachedToken.expires_at_ms - 60_000 > now) {
    return cachedToken.access_token;
  }
  const basic = Buffer.from(`${key.clientid}:${key.clientsecret}`).toString('base64');
  const url = `${key.url.replace(/\/$/, '')}/oauth/token?grant_type=client_credentials`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
  } catch (err) {
    throw new AgentFailure({
      agent: 'aiCoreClient.ensureToken',
      reason: 'oauth_failed',
      message: `XSUAA fetch failed: ${(err as Error).message}`,
    });
  }
  if (!resp.ok) {
    throw new AgentFailure({
      agent: 'aiCoreClient.ensureToken',
      reason: 'oauth_failed',
      message: `XSUAA returned ${resp.status} ${resp.statusText}.`,
      httpStatus: resp.status,
    });
  }
  const body = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new AgentFailure({
      agent: 'aiCoreClient.ensureToken',
      reason: 'oauth_failed',
      message: 'XSUAA response missing access_token.',
      raw: body,
    });
  }
  cachedToken = {
    access_token: body.access_token,
    expires_at_ms: now + (body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.access_token;
}

// ---------------------------------------------------------------------------
// Main call surface
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Issue a chat-completion request against AI Core's Claude deployment.
 *
 * Wire shape: SAP AI Core Claude deployments expose an Anthropic-shaped
 * /chat/completions endpoint at `{AI_API_URL}/v2/inference/deployments/{model}/invoke`.
 * The exact URL family is still OQ-1 — when OQ-1 closes, this single call
 * site is where the real shape lands.
 */
export async function callAgent<T = string>(params: CallAgentParams<T>): Promise<AgentResult<T>> {
  // ---- DEP-1 spend cap: enforce model + max_tokens before any I/O.
  if (!params.model || params.model.length === 0) {
    throw new AgentFailure({
      agent: params.agent,
      reason: 'missing_model',
      message: 'callAgent invoked without model — DEP-1 spend cap forbids unmodeled calls.',
    });
  }
  if (typeof params.max_tokens !== 'number' || params.max_tokens <= 0) {
    throw new AgentFailure({
      agent: params.agent,
      reason: 'missing_max_tokens',
      message: 'callAgent invoked without max_tokens — DEP-1 spend cap forbids unbounded calls.',
    });
  }

  const key = loadServiceKey();
  const token = await ensureToken(key);
  const resourceGroup = params.resource_group ?? key.resourcegroup ?? 'default';
  const url =
    `${key.serviceurls.AI_API_URL.replace(/\/$/, '')}` +
    `/v2/inference/deployments/${encodeURIComponent(params.model)}/invoke`;

  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: params.max_tokens,
    system: params.system,
    messages: [{ role: 'user' as const, content: params.user }],
  };

  const started = Date.now();
  let resp: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeout_ms ?? DEFAULT_TIMEOUT_MS);
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'AI-Resource-Group': resourceGroup,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = (err as Error).name === 'AbortError';
    throw new AgentFailure({
      agent: params.agent,
      reason: isAbort ? 'timeout' : 'http_error',
      message: `AI Core fetch ${isAbort ? 'timed out' : 'failed'}: ${(err as Error).message}`,
    });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const body = await safeText(resp);
    throw new AgentFailure({
      agent: params.agent,
      reason: 'http_error',
      message: `AI Core returned ${resp.status} ${resp.statusText}.`,
      raw: body,
      httpStatus: resp.status,
    });
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch (err) {
    throw new AgentFailure({
      agent: params.agent,
      reason: 'malformed_json',
      message: `AI Core response body is not valid JSON: ${(err as Error).message}`,
    });
  }

  // Extract assistant text from Anthropic-shaped response.
  const text = extractAssistantText(body);
  if (!text) {
    throw new AgentFailure({
      agent: params.agent,
      reason: 'empty_response',
      message: 'AI Core response contained no assistant text.',
      raw: body,
    });
  }

  // If a JSON schema validator was supplied, parse + validate. Otherwise
  // return the raw text. Either way, the result is stamped.
  let value: T;
  if (params.expect_json_schema) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(text));
    } catch (err) {
      throw new AgentFailure({
        agent: params.agent,
        reason: 'malformed_json',
        message: `Assistant text is not parseable JSON: ${(err as Error).message}`,
        raw: text,
      });
    }
    try {
      value = params.expect_json_schema(parsed);
    } catch (err) {
      throw new AgentFailure({
        agent: params.agent,
        reason: 'schema_validation_failed',
        message: `Assistant JSON failed schema validation: ${(err as Error).message}`,
        raw: parsed,
      });
    }
  } else {
    value = text as unknown as T;
  }

  return {
    agent: params.agent,
    source: 'aiCore',
    templateUsed: false,
    latency_ms: Date.now() - started,
    token_usage: extractUsage(body),
    model: params.model,
    max_tokens: params.max_tokens,
    value,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAssistantText(body: unknown): string | null {
  // Anthropic-shaped: { content: [{ type:'text', text:'...' }, ...] }
  const obj = body as { content?: Array<{ type?: string; text?: string }> };
  if (Array.isArray(obj?.content)) {
    return obj.content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim() || null;
  }
  return null;
}

function extractUsage(body: unknown): { input: number; output: number } | null {
  const obj = body as { usage?: { input_tokens?: number; output_tokens?: number } };
  if (obj?.usage && typeof obj.usage.input_tokens === 'number' && typeof obj.usage.output_tokens === 'number') {
    return { input: obj.usage.input_tokens, output: obj.usage.output_tokens };
  }
  return null;
}

/** Strip ```json ... ``` fences some models wrap around JSON output. */
function stripJsonFences(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1] : text;
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '<unreadable body>';
  }
}
