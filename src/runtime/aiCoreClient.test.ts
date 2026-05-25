/**
 * F-04 (a) tests — aiCoreClient wrapper invariants.
 *
 * Binary assertions only. Fetch is globally mocked: NO live AI Core calls
 * during npm run test. The live tenant is exercised separately by
 * scripts/list-aicore-deployments.mjs and (in S4) by npm run evals:live.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  callAgent,
  loadServiceKey,
  AgentFailure,
  _resetClientForTests,
} from '@runtime/aiCoreClient';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_KEY = {
  serviceurls: { AI_API_URL: 'https://api.ai.test.example.com' },
  resourcegroup: 'default',
  clientid: 'test-client',
  clientsecret: 'test-secret',
  url: 'https://uaa.test.example.com',
};

let tmpDir: string;
let keyPath: string;
const origEnv = process.env.AICORE_KEY_PATH;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aicore-test-'));
  keyPath = join(tmpDir, 'aicore.json');
  writeFileSync(keyPath, JSON.stringify(FAKE_KEY));
  process.env.AICORE_KEY_PATH = keyPath;
  _resetClientForTests();
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env.AICORE_KEY_PATH = origEnv;
  _resetClientForTests();
});

// Helper: assemble a mocked fetch sequence (token call then invoke call).
function mockFetchSequence(...responses: Array<Partial<Response> & { jsonBody?: unknown; textBody?: string }>): void {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = queue.shift();
      if (!r) throw new Error('mock fetch exhausted');
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: r.statusText ?? 'OK',
        json: async () => r.jsonBody ?? {},
        text: async () => r.textBody ?? JSON.stringify(r.jsonBody ?? {}),
      } as unknown as Response;
    }),
  );
}

const TOKEN_RESPONSE = { jsonBody: { access_token: 'tok-abc', expires_in: 3600 } };
const SUCCESS_INVOKE = {
  jsonBody: {
    content: [{ type: 'text', text: 'hello world' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
};

// ---------------------------------------------------------------------------
// DEP-1 spend-cap enforcement (synchronous guards — fire before any I/O)
// ---------------------------------------------------------------------------

describe('aiCoreClient — DEP-1 spend cap', () => {
  it('rejects callAgent without model', async () => {
    await expect(
      callAgent({ agent: 'test', model: '', max_tokens: 100, system: 's', user: 'u' }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'missing_model' });
  });

  it('rejects callAgent without max_tokens', async () => {
    await expect(
      callAgent({ agent: 'test', model: 'd-abc', max_tokens: 0, system: 's', user: 'u' }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'missing_max_tokens' });
  });
});

// ---------------------------------------------------------------------------
// Credential loading
// ---------------------------------------------------------------------------

describe('aiCoreClient — credential loading', () => {
  it('fails fast when AICORE_KEY_PATH unset', () => {
    delete process.env.AICORE_KEY_PATH;
    _resetClientForTests();
    expect(() => loadServiceKey()).toThrow(AgentFailure);
  });

  it('fails fast when file is unreadable', () => {
    process.env.AICORE_KEY_PATH = '/no/such/file/exists.json';
    _resetClientForTests();
    expect(() => loadServiceKey()).toThrow(/not readable/);
  });

  it('fails fast when file is not valid JSON', () => {
    writeFileSync(keyPath, '{ not json');
    _resetClientForTests();
    expect(() => loadServiceKey()).toThrow(/not valid JSON/);
  });

  it('fails fast when required field missing', () => {
    writeFileSync(keyPath, JSON.stringify({ clientid: 'x' }));
    _resetClientForTests();
    expect(() => loadServiceKey()).toThrow(/missing required field/);
  });

  it('memoises the loaded key', () => {
    const k1 = loadServiceKey();
    const k2 = loadServiceKey();
    expect(k1).toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// Successful call path — stamping invariants
// ---------------------------------------------------------------------------

describe('aiCoreClient — successful callAgent', () => {
  it('stamps source=aiCore, templateUsed=false, model, max_tokens, latency_ms', async () => {
    mockFetchSequence(TOKEN_RESPONSE, SUCCESS_INVOKE);
    const r = await callAgent({
      agent: 'compile',
      model: 'd-deploy-haiku',
      max_tokens: 1024,
      system: 'you compile',
      user: 'compile this',
    });
    expect(r.source).toBe('aiCore');
    expect(r.templateUsed).toBe(false);
    expect(r.model).toBe('d-deploy-haiku');
    expect(r.max_tokens).toBe(1024);
    expect(typeof r.latency_ms).toBe('number');
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    expect(r.token_usage).toEqual({ input: 10, output: 5 });
    expect(r.value).toBe('hello world');
  });

  it('returns parsed+validated JSON when expect_json_schema supplied', async () => {
    mockFetchSequence(TOKEN_RESPONSE, {
      jsonBody: { content: [{ type: 'text', text: '{"ok":true,"n":42}' }] },
    });
    const r = await callAgent<{ ok: boolean; n: number }>({
      agent: 'capability',
      model: 'd-deploy-haiku',
      max_tokens: 256,
      system: 's',
      user: 'u',
      expect_json_schema: (parsed) => {
        const obj = parsed as { ok?: unknown; n?: unknown };
        if (typeof obj.ok !== 'boolean' || typeof obj.n !== 'number') {
          throw new Error('shape');
        }
        return parsed as { ok: boolean; n: number };
      },
    });
    expect(r.value).toEqual({ ok: true, n: 42 });
  });

  it('strips ```json fences before parsing', async () => {
    mockFetchSequence(TOKEN_RESPONSE, {
      jsonBody: { content: [{ type: 'text', text: '```json\n{"x":1}\n```' }] },
    });
    const r = await callAgent<{ x: number }>({
      agent: 'compile',
      model: 'd-1',
      max_tokens: 100,
      system: 's',
      user: 'u',
      expect_json_schema: (p) => p as { x: number },
    });
    expect(r.value).toEqual({ x: 1 });
  });
});

// ---------------------------------------------------------------------------
// Failure paths — AgentFailure with typed reason, N4 (no canned fallback)
// ---------------------------------------------------------------------------

describe('aiCoreClient — failure paths', () => {
  it('throws AgentFailure with reason=oauth_failed on non-2xx XSUAA', async () => {
    mockFetchSequence({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(
      callAgent({ agent: 'compile', model: 'd-1', max_tokens: 100, system: 's', user: 'u' }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'oauth_failed', httpStatus: 401 });
  });

  it('throws AgentFailure with reason=http_error on non-2xx invoke', async () => {
    mockFetchSequence(TOKEN_RESPONSE, { ok: false, status: 500, statusText: 'Server Error', textBody: 'boom' });
    await expect(
      callAgent({ agent: 'compile', model: 'd-1', max_tokens: 100, system: 's', user: 'u' }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'http_error', httpStatus: 500 });
  });

  it('throws AgentFailure with reason=empty_response when content is empty', async () => {
    mockFetchSequence(TOKEN_RESPONSE, { jsonBody: { content: [] } });
    await expect(
      callAgent({ agent: 'compile', model: 'd-1', max_tokens: 100, system: 's', user: 'u' }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'empty_response' });
  });

  it('throws AgentFailure with reason=malformed_json when expect_json_schema given but text is not JSON', async () => {
    mockFetchSequence(TOKEN_RESPONSE, {
      jsonBody: { content: [{ type: 'text', text: 'not json at all' }] },
    });
    await expect(
      callAgent({
        agent: 'compile',
        model: 'd-1',
        max_tokens: 100,
        system: 's',
        user: 'u',
        expect_json_schema: (p) => p,
      }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'malformed_json' });
  });

  it('throws AgentFailure with reason=schema_validation_failed when JSON parses but validator throws', async () => {
    mockFetchSequence(TOKEN_RESPONSE, {
      jsonBody: { content: [{ type: 'text', text: '{"wrong":"shape"}' }] },
    });
    await expect(
      callAgent({
        agent: 'compile',
        model: 'd-1',
        max_tokens: 100,
        system: 's',
        user: 'u',
        expect_json_schema: () => {
          throw new Error('expected x');
        },
      }),
    ).rejects.toMatchObject({ name: 'AgentFailure', reason: 'schema_validation_failed' });
  });

  it('NEVER returns a canned fallback (N4) — every failure throws', async () => {
    mockFetchSequence(TOKEN_RESPONSE, { ok: false, status: 503, statusText: 'Unavailable', textBody: '' });
    // Verify the wrapper throws rather than returning anything resembling a result.
    let returned: unknown = undefined;
    try {
      returned = await callAgent({ agent: 'compile', model: 'd-1', max_tokens: 100, system: 's', user: 'u' });
    } catch {
      // expected
    }
    expect(returned).toBeUndefined();
  });
});
