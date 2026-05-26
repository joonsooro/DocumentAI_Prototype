import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vite config — SUB-3 (React 18 + TS + Vite + @ui5/webcomponents-react).
// F-14 (DAEJOO asset binding, A9): assets are served from app/assets/ via the
// project-root publicDir so URLs resolve to /assets/daejoo-invoice.pdf at runtime.
// Runtime code MUST NOT reference ~/Downloads — enforced by an ESLint rule.
//
// S3.5 F-11-live: /api/* requests are proxied to a sidecar Node process
// (scripts/dev-agent-server.ts on port 3001) that hosts the agent endpoints.
// Vite does NOT host the agent middleware itself — running it under Vite's
// SSR pipeline turned out to require fighting Vite internals (path aliases,
// noExternal, resolveId hooks) at every layer. The sidecar pattern is the
// production-shaped approach (browser ↔ proxy ↔ agent server) and keeps the
// vite.config.ts surface to a single proxy line. The browser bundle still
// imports nothing from src/runtime/aiCoreClient.ts — verified by the
// `grep dist/assets/*.js` audit.
export default defineConfig({
  root: '.',
  publicDir: 'app',
  plugins: [react()],
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
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
