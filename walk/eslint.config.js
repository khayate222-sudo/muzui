import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['android/**','ios/**','dist/**', 'node_modules/**', '.npm-cache/**', 'data/**', 'test-results/**', 'artifacts/**', 'playwright-report/**'] }, js.configs.recommended, ...ts.configs.recommended, {
  files: ['**/*.{ts,tsx,js,mjs}'],
  languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
  rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
});
