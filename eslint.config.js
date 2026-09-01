// @ts-check
import { defineConfig } from 'eslint/config'
import ts from 'typescript-eslint'

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  ...ts.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
