import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Vitest config — F-19 eval harness reads from src/evals/.
// Globals enabled so eval cases can use describe/it/expect without per-file imports.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['default'],
  },
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
});
