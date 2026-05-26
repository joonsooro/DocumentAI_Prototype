/**
 * S3.5 F-11-live — Sidecar dev agent server.
 *
 * Bare node:http server on PORT (default 3001) that hosts the three /api/*
 * endpoints the customer screen calls. Vite's dev server (port 5173) proxies
 * /api/* to here per vite.config.ts#server.proxy.
 *
 * Why a sidecar and not Vite middleware: hosting the agent under Vite's SSR
 * pipeline required fighting Vite internals (path aliases, noExternal,
 * resolveId hooks) at every layer because the @domain/* / @runtime/* aliases
 * are a Vite/tsconfig construct that Vite's SSR fallback (`nodeImport`)
 * does not respect for transitive imports. A separate process under `tsx`
 * sees the same tsconfig path aliases natively and Just Works.
 *
 * Run via `npm run dev:server` which loads .env so AICORE_KEY_PATH resolves.
 * The browser never talks to this server directly — only through the Vite
 * proxy, so the origin stays single (no CORS) and the production bundle is
 * unaffected.
 *
 * The actual handler bodies live in src/server/devAgentMiddleware.ts so the
 * shape contract is one definition shared between the sidecar and the
 * vitest middleware shape test.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  handleCompile,
  handleCapability,
  handleReadiness,
  handleChatTurnDecide,
} from '../src/server/devAgentMiddleware';
import { initLangfuseTracerProvider, shutdownLangfuse } from '../src/runtime/langfuseClient';
import { registerLangfuseSink } from '../src/runtime/qualityMetricLog';

const PORT = Number(process.env.AGENT_SERVER_PORT ?? 3001);

// Boot Langfuse trace capture once at server startup. Fail-soft per the
// langfuseClient contract — missing keys emit one warn line and continue
// with trace capture disabled. The rest of the server runs identically
// either way.
initLangfuseTracerProvider();

// Register the QualityMetric → Langfuse event mirror sink. Every push to
// the in-memory store also emits a Langfuse event with safe metadata only
// (agent / status / latency / token counts / error reason). Fire-and-forget:
// SDK throws are caught at the langfuseClient boundary; the in-memory store
// + the F-18 Internal panel stay the system of record (SUB-6).
registerLangfuseSink();

type Handler = (body: unknown) => Promise<unknown>;
const HANDLERS: Record<string, Handler> = {
  '/api/compile': handleCompile as Handler,
  '/api/capability': handleCapability as Handler,
  '/api/readiness': handleReadiness as Handler,
  '/api/chat-turn-decide': handleChatTurnDecide as Handler,
};

function isHandled(url: string | undefined): url is keyof typeof HANDLERS {
  return url !== undefined && Object.prototype.hasOwnProperty.call(HANDLERS, url);
}

function validate(url: keyof typeof HANDLERS, body: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body_must_be_json_object' };
  }
  const b = body as Record<string, unknown>;
  if (url === '/api/compile') {
    if (typeof b.raw !== 'string' || b.raw.trim().length === 0) {
      return { ok: false, error: 'raw_required' };
    }
  } else if (url === '/api/chat-turn-decide') {
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

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method !== 'POST' || !isHandled(req.url)) {
    sendJson(res, 404, { error: 'not_found' });
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
      const started = Date.now();
      const result = await HANDLERS[url](parsed);
      const ms = Date.now() - started;
      // eslint-disable-next-line no-console
      console.log(`[dev-agent-server] ${url} ${ms}ms`);
      sendJson(res, 200, result);
    } catch (err) {
      // Domain-level throws (e.g. simulateDocumentRun's unregistered-fixture)
      // surface as 500 with a generic message; we never echo prompts.
      sendJson(res, 500, { error: 'middleware_error', detail: (err as Error).message });
    }
  })();
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[dev-agent-server] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[dev-agent-server] AICORE_KEY_PATH ${process.env.AICORE_KEY_PATH ? 'set' : 'NOT SET'}`);
});

// Best-effort flush of any pending Langfuse spans on graceful shutdown so a
// final batch of traces makes it to Langfuse before the process dies.
async function gracefulShutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[dev-agent-server] received ${signal}, flushing langfuse...`);
  await shutdownLangfuse();
  process.exit(0);
}
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
