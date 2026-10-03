/**
 * ESLint flat config (ESLint 9).
 *
 * WHY THIS FILE IS NEW
 * --------------------
 * `eslint` v9 and `eslint-plugin-vue` were already dependencies and `pnpm lint`
 * was already documented, but no config file existed — so the command failed
 * outright with "couldn't find an eslint.config.(js|mjs|cjs) file". ESLint 9
 * removed support for `.eslintrc.*`, so the older format would not have worked
 * either.
 *
 * `typescript-eslint` is required, not optional: every component uses
 * `<script setup lang="ts">`, and vue-eslint-parser delegates the script block
 * to a TS parser. Without it the whole codebase fails to parse.
 */
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Build output, dependencies and generated files are never linted.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      // Scratch artefacts written by the visual-check scripts.
      '*-preview.html',
      '*.png',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  {
    // Let vue-eslint-parser hand `<script lang="ts">` to the TS parser.
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser environment. Declared explicitly rather than pulling in the
        // `globals` package: this list is small and stays visible.
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        matchMedia: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        getComputedStyle: 'readonly',

        // Injected by Vite's `define` and declared in src/env.d.ts. ESLint's
        // no-undef cannot see either, so it has to be listed here.
        __APP_VERSION__: 'readonly',
      },
    },
    rules: {
      // Unused vars are a real defect signal, but an underscore prefix is the
      // conventional way to say "intentionally unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` appears where the WebAPI returns loosely-shaped maps. Warn rather
      // than error so it stays visible without blocking the build.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Multi-word component names are a Vue style rule that does not fit
      // `index.vue`-style files and adds noise here.
      'vue/multi-word-component-names': 'off',

      // Formatting is Prettier's job; mixing the two produces churn.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
    },
  },

  // Node-side scripts: they run in Node and use `console`/`process`.
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Test files may use non-null assertions and loose typing freely.
  {
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
