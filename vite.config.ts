import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vite config — SUB-3 (React 18 + TS + Vite + @ui5/webcomponents-react).
// F-14 (DAEJOO asset binding, A9): assets are served from app/assets/ via the
// project-root publicDir so URLs resolve to /assets/daejoo-invoice.pdf at runtime.
// Runtime code MUST NOT reference ~/Downloads — enforced by an ESLint rule.
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
