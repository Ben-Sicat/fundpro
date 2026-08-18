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
      // `server-only` is a build-time guard with no runtime module, so it has
      // to be stubbed here. The guard still applies to `next build`, which is
      // where a client-bundle leak would actually happen.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
})
