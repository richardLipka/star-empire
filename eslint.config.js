import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // The simulation must stay headless: no DOM, no rendering.
    files: ['src/{core,sim,galaxy,fleet,empire,info,detection,events,perspective,app,governors,research}/**/*.js'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['three', 'three/*'], message: 'Simulation modules must not depend on rendering.' },
          { group: ['**/render/**', '**/ui/**'], message: 'Simulation modules must not import presentation code.' },
          { group: ['**/i18n/**'], message: 'Simulation code produces keys and parameters; only the UI translates.' },
        ],
      }],
    },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
