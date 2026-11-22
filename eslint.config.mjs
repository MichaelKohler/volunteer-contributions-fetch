import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['coverage/**/*', 'node_modules']),
  js.configs.recommended,
  prettierRecommended,
  {
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
]);
