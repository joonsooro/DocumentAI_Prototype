import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vite config — SUB-3 (React 18 + TS + Vite + @ui5/webcomponents-react).
// F-14 (DAEJOO asset binding, A9): assets are served from app/assets/ via the
// project-root publicDir so URLs resolve to /assets/daejoo-invoice.pdf at runtime.
// Runtime code MUST NOT reference ~/Downloads — enforced by an ESLint rule.
//
// S3.5 F-11-live: devAgentPlugin mounts POST /api/compile, /api/capability,
// /api/readiness so the browser bundle can drive the live AI Core agents
// without importing src/runtime/aiCoreClient.ts (which is Node-only and
// holds the service-key credentials). The plugin is dev-server only — it
// has no apply: 'build' branch — so production bundles never include the
// middleware or its transitive @domain/* / @runtime/* imports. The middleware
// module is imported DYNAMICALLY inside configureServer so vite build never
// loads it at config-time (Node's loader would fail to resolve @domain/*
// aliases at config-load — only Vite's dev runtime applies them).
const devAgentPlugin = {
  name: 'document-ai-flywheel-dev-agent',
  apply: 'serve' as const,
  async configureServer(server: {
    middlewares: { use: (m: (req: unknown, res: unknown, next: () => void) => void) => void };
  }) {
    // String-variable indirection defeats esbuild's static-import scanner;
    // the middleware module is loaded only when the dev server starts, NOT
    // at vite-config-load time (where Node's loader cannot resolve our
    // @domain/* / @runtime/* path aliases).
    const modulePath = './src/server/devAgentMiddleware.ts';
    const mod = (await import(/* @vite-ignore */ modulePath)) as {
      agentMiddleware: () => (req: unknown, res: unknown, next: () => void) => void;
    };
    server.middlewares.use(mod.agentMiddleware());
  },
};

export default defineConfig({
  root: '.',
  publicDir: 'app',
  plugins: [react(), devAgentPlugin],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@runtime': fileURLToPath(new URL('./src/runtime', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@routes': fileURLToPath(new URL('./src/routes', import.meta.url)),
      '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
