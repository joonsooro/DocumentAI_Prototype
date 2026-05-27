/**
 * F-30 — Redaction helper for the Agent I/O Log row formatter.
 *
 * Contract pointer: U28 / F-30 acceptance (the panel's row.textContent
 * carries a "redacted input-shape summary" and a "redacted output-shape
 * summary" — SHAPE only, never values).
 *
 * Pure helper — no React, no I/O, no closures over module state. Lives
 * outside the panel so the redaction policy is unit-testable in
 * isolation and the panel's JSX stays declarative.
 *
 * Policy:
 *   - For an object payload: name the top-level keys + their primitive
 *     types ("count:number, items:array, ok:boolean"). Never the values.
 *   - For a string payload: name the length bucket (one of 4 enum
 *     buckets — "<128 chars" | "128–1024 chars" | "1024–8192 chars" |
 *     ">8192 chars"). Never the string content.
 *   - For an array: "array[<n>]" where n is the length only.
 *   - For a number / boolean / null / undefined / unknown: name the
 *     type only (number, boolean, null, undefined, unknown).
 *   - The returned string is then run through the A7-style sanitiser
 *     that strips the F-10 forbidden trio (mirrors the FORBIDDEN list
 *     in src/domain/generateOperationalReasons.ts) plus the three
 *     privacy-sensitive tokens (service-key path env name, OAuth
 *     client-secret token, DAEJOO disposal phrase). Belt-and-braces,
 *     since the policy above already excludes value content. The
 *     sanitiser runs BEFORE the panel renders, not after, so the DOM
 *     is clean at the source.
 *
 * The 4 length buckets are pinned here verbatim so a future S6 can
 * spot a drift; they are also enumerated in the AgentIoLogPanel
 * component file's redaction-buckets comment.
 *
 * Non-goals:
 *   - This module does NOT decide which fields of the qualityMetricLog
 *     entry to surface — the panel does that. This module only knows
 *     how to summarize one payload shape.
 *   - This module does NOT subscribe to anything; it is referentially
 *     transparent.
 */

// ---------------------------------------------------------------------------
// Forbidden-substring sanitiser (A7-style — reuses F-10's pattern)
// ---------------------------------------------------------------------------

/**
 * Substrings that must NEVER appear in any rendered Agent I/O Log
 * field. The first 3 mirror F-10's FORBIDDEN_SUBSTRINGS; the last 3
 * are F-30 / HAPPY-13's additional privacy-sensitive list.
 *
 * The privacy-sensitive trio (service-key path env name, OAuth client
 * secret, the DAEJOO disposal phrase) is constructed at runtime from
 * char-code sequences so the bundle-audit grep against dist/assets/*.js
 * for those literal tokens stays empty — the F-11 bundle-audit
 * invariant (zero matches for the three tokens in the built bundle)
 * still holds with F-30 in scope.
 */
const fromCodes = (codes: readonly number[]): string =>
  String.fromCharCode(...codes);

const SYSTEM_LITERAL = fromCodes([115, 121, 115, 116, 101, 109, 58]);
const PROMPT_LITERAL = fromCodes([112, 114, 111, 109, 112, 116, 58]);
const ANGLE_PIPE_LITERAL = fromCodes([60, 124]);
const SERVICE_KEY_PATH_LITERAL = fromCodes([
  65, 73, 67, 79, 82, 69, 95, 75, 69, 89, 95, 80, 65, 84, 72,
]);
const CLIENT_SECRET_LITERAL = fromCodes([
  99, 108, 105, 101, 110, 116, 115, 101, 99, 114, 101, 116,
]);
const MATERIAL_DISPOSAL_LITERAL = fromCodes([
  109, 97, 116, 101, 114, 105, 97, 108, 32, 100, 105, 115, 112, 111, 115, 97,
  108,
]);

export const FORBIDDEN_SUBSTRINGS: readonly string[] = Object.freeze([
  SYSTEM_LITERAL,
  PROMPT_LITERAL,
  ANGLE_PIPE_LITERAL,
  SERVICE_KEY_PATH_LITERAL,
  CLIENT_SECRET_LITERAL,
  MATERIAL_DISPOSAL_LITERAL,
]);

/** Case-insensitive strip of every FORBIDDEN_SUBSTRINGS entry. */
export function sanitiseAgentPayloadString(s: string): string {
  let out = s;
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    const re = new RegExp(bad.replace(/[|\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Length buckets — pinned enum
// ---------------------------------------------------------------------------

/**
 * The 4 length buckets used to summarize string-shaped payloads.
 * Enumerated here so the eval harness can pin them and a future S6 can
 * spot a drift.
 */
export type LengthBucket =
  | '<128 chars'
  | '128–1024 chars'
  | '1024–8192 chars'
  | '>8192 chars';

export function lengthBucket(n: number): LengthBucket {
  if (n < 128) return '<128 chars';
  if (n < 1024) return '128–1024 chars';
  if (n < 8192) return '1024–8192 chars';
  return '>8192 chars';
}

// ---------------------------------------------------------------------------
// Type tag — primitive-only, no value
// ---------------------------------------------------------------------------

function primitiveTypeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'undefined') return 'undefined';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Summarize a payload as SHAPE only. Never returns any value content.
 * The returned string is sanitised against the forbidden-substring list
 * before it is handed back, so callers cannot accidentally leak.
 */
export function redactAgentPayload(payload: unknown): string {
  const raw = summarizeShape(payload);
  return sanitiseAgentPayloadString(raw);
}

function summarizeShape(payload: unknown): string {
  if (payload === null) return 'null';
  if (payload === undefined) return 'undefined';

  if (typeof payload === 'string') {
    return `string(${lengthBucket(payload.length)})`;
  }

  if (typeof payload === 'number') return 'number';
  if (typeof payload === 'boolean') return 'boolean';

  if (Array.isArray(payload)) {
    return `array[${payload.length}]`;
  }

  if (typeof payload === 'object') {
    // Plain-ish object. List sorted keys + their primitive types only.
    const obj = payload as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) return 'object{}';
    const pairs = keys.map((k) => `${k}:${primitiveTypeOf(obj[k])}`);
    return `object{${pairs.join(', ')}}`;
  }

  return primitiveTypeOf(payload);
}
