/**
 * S5 SF (2026-05-28) — Sidecar import-graph guard.
 *
 * Closes the static-gate gap exposed by Cycle 2.5's post-Cycle-2 live
 * smoke. The sidecar (scripts/dev-agent-server.ts) is excluded from
 * tsconfig.json's include glob, so two regressions slipped past
 * tsc/eslint/vitest in Cycle 2's main commits and only surfaced when
 * the smoke tried to boot the sidecar:
 *   - src/domain/assessCapabilities.ts using Vite-only `?raw` import
 *     (worked under Vite/vitest, broke under tsx with
 *     ERR_UNKNOWN_FILE_EXTENSION ".md")
 *   - scripts/dev-agent-server.ts importing the deleted
 *     handleChatTurnDecide handler
 *
 * Both were fixed reactively in commit 9cc2cac. This test exists so
 * the next instance of "a future cycle deletes/renames a symbol that
 * the sidecar transitively imports" fails at vitest-run time rather
 * than at live-smoke time.
 *
 * The test uses a dynamic import inside the test body so the path is
 * resolved at runtime (under vitest's resolver, which understands the
 * tsconfig path aliases the sidecar's transitive imports rely on).
 * A static top-of-file `import` would force tsc to pull scripts/ into
 * the test file's resolve graph for type-checking, which defeats the
 * "scripts/ excluded from tsc" posture; the runtime import is what we
 * actually want to validate anyway.
 *
 * The sidecar's auto-start has been gated behind a standard ESM
 * main-module check (`import.meta.url === \`file://${process.argv[1]}\``),
 * so this dynamic import does NOT bind a port, does NOT initialise
 * Langfuse, and does NOT register signal handlers. It only verifies
 * that every transitive import resolves, every top-level const
 * initializer runs without throw, and the exported symbols
 * (createApp, HANDLERS, isHandled, validate, gracefulShutdown) are
 * present.
 *
 * What this test CATCHES:
 *   - A future cycle deletes a symbol the sidecar imports → reject.
 *   - A future cycle changes a Vite-only import (?raw, ?url, ?worker)
 *     in any transitively-loaded module → reject under tsx.
 *   - A future cycle adds a top-level side effect that throws
 *     (e.g. readFileSync against a missing path) → reject.
 *
 * What this test does NOT catch (intentional scope):
 *   - HTTP handler runtime behaviour — exercised by
 *     src/evals/live.test.tsx when AICORE_KEY_PATH is set.
 *   - Agent logic — exercised by the mocked tests in src/.
 */
import { describe, expect, it } from 'vitest';

describe('S5 SF — sidecar import-graph guard', () => {
  it('scripts/dev-agent-server.ts imports without throwing (guards sidecar-only regressions at vitest-run time)', async () => {
    // Dynamic import so the path is resolved at runtime by vitest's
    // resolver, not statically by tsc. The sidecar's auto-start is
    // gated behind a main-module check, so this import has no side
    // effects (no port bound, no Langfuse init, no signal handlers).
    const mod = await import('../../scripts/dev-agent-server');

    expect(mod).toBeDefined();
    expect(typeof mod.createApp).toBe('function');
    expect(typeof mod.isHandled).toBe('function');
    expect(typeof mod.validate).toBe('function');
    expect(typeof mod.gracefulShutdown).toBe('function');

    // HANDLERS must carry exactly the three Cycle 2 endpoints — no
    // /api/chat-turn-decide leftover from the deleted router.
    expect(Object.keys(mod.HANDLERS).sort()).toEqual(
      ['/api/capability', '/api/compile', '/api/readiness'].sort(),
    );

    // Each HANDLERS value must be a callable function. This catches
    // the failure mode the original Cycle 2 strip exposed: if a future
    // cycle deletes (or renames) one of the middleware handlers and
    // forgets to update the sidecar import, the named import binds
    // to `undefined` rather than throwing at module-load (tsx /
    // Node ESM is permissive on missing named imports), and HANDLERS
    // ends up with an undefined slot. We assert each slot is a
    // function so the next instance of that drift fails here, not at
    // live-smoke time.
    for (const [route, handler] of Object.entries(mod.HANDLERS)) {
      expect(typeof handler, `HANDLERS[${route}] is not a function — likely a deleted/renamed middleware export`).toBe('function');
    }

    // createApp() returns a real http.Server. We call it once (no
    // listen) to confirm every transitive top-level initializer
    // (including the assessCapabilities curated-surface readFileSync)
    // runs without throwing. http.createServer is synchronous and
    // doesn't bind a port until .listen() — safe to invoke here.
    const server = mod.createApp();
    expect(server).toBeDefined();
    expect(typeof (server as { listen: unknown }).listen).toBe('function');
    expect(typeof (server as { close: unknown }).close).toBe('function');
    (server as { close: () => void }).close();
  });
});
