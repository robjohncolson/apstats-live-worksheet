import { defineConfig, configDefaults } from 'vitest/config';

// `npm run test:quick` — the fast gate (target: under 2 minutes on the teacher's box).
// Runs only the suites that pin the grade engine, the Desk contracts and the CI-pinning
// guards. The full root suite (`npm test`, ~12 min here) and the roster-server suite
// (`cd roster-server && npm test`) stay the release gate; this is the "did I break the
// obvious thing" loop you run between edits.
//
// The roster-server files run from the root runner on purpose: they declare
// `@vitest-environment node` themselves and resolve their deps from roster-server/node_modules.
// BCRYPT_COST=4 mirrors roster-server/vitest.config.js (tests only; prod never sets it).
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    env: { BCRYPT_COST: '4' },
    testTimeout: 15000,
    hookTimeout: 45000,
    include: [
      // grade engine
      'roster-server/tests/golden-master*.test.js',
      'roster-server/tests/lesson-grade*.test.js',
      // Desk contract tests
      'tests/desk-*.test.js',
      // CI-pinning tests
      'tests/remaining-feature-contracts.test.js',
      'tests/grade-engine-bundle-parity.test.js',
      'tests/gitnexus-shadow.test.js',
      'tests/lineage.test.js',
      'tests/pwa.test.js',
      'tests/ced-no-raw-keys.test.js',
      'tests/alias-hosts.test.js',
    ],
    exclude: [...configDefaults.exclude, '.weekly-dok-wt/**'],
  },
});
