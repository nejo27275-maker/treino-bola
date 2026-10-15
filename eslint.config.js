/**
 * ESLint para os arquivos JavaScript do projeto (scripts de build, service worker e o
 * aviso para navegadores antigos). O código TypeScript de src/ e tests/ é verificado pelo
 * compilador em modo estrito (`npm run typecheck`).
 */
const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'valid-typeof': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-throw-literal': 'error',
  eqeqeq: ['error', 'always'],
  'prefer-const': 'error',
  'no-var': 'error',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const serviceWorkerGlobals = {
  self: 'readonly',
  caches: 'readonly',
  fetch: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  URL: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'public/vendor/**',
      '**/*.ts',
    ],
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: nodeGlobals },
    rules,
  },
  {
    files: ['scripts/sw-template.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: serviceWorkerGlobals },
    rules,
  },
  {
    // Executado só por navegadores antigos: usa ES5 de propósito.
    files: ['public/nomodule.js'],
    languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: { document: 'readonly' } },
    rules: { ...rules, 'no-var': 'off', 'prefer-const': 'off' },
  },
];
