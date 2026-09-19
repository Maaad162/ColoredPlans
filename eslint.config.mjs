import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', '.edge-*/**', 'playwright-report/**', 'test-results/**'] },
  { ...js.configs.recommended, files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['src/**/*.{ts,tsx}'], extends: [ts.configs.recommended],
    languageOptions: { globals: globals.browser, parserOptions: { projectService: true } },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
);
