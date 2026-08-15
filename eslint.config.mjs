import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', '**/node_modules/**', 'splitio.html'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { 'no-undef': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
);
