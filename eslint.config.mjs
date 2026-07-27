import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * eslint-config-next v15 ships the legacy eslintrc format, so ESLint 9's flat
 * config needs FlatCompat to consume it. (create-next-app@16 emits a flat
 * config that imports `eslint-config-next/core-web-vitals` directly; that only
 * works with v16 of the config package.)
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // A leading underscore marks a deliberately unused binding: stub driver
      // parameters, and destructuring used to omit a key.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'db/migrations/**',
    ],
  },
]

export default eslintConfig
