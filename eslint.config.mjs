import { defineConfig, globalIgnores } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores(['.nyc_output/**/*', 'coverage/**/*', 'node_modules']),
  {
    extends: compat.extends('plugin:prettier/recommended'),

    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },

    settings: {
      'import/resolver': {
        node: {
          paths: ['lib'],
          extensions: ['.js', '.d.ts'],
        },
      },
    },

    rules: {
      'arrow-body-style': 0,
      'comma-dangle': 0,
      'import/extensions': 0,
      'import/prefer-default-export': 0,
      'no-plusplus': 0,
      'no-restricted-syntax': 0,
      'no-use-before-define': 0,
    },
  },
]);
