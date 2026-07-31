import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The `@/*` alias is declared explicitly rather than via vite-tsconfig-paths:
 * that plugin is ESM-only and this config is loaded through `require`, so
 * importing it fails. Keep this in sync with `paths` in tsconfig.json.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
})
