import { defineConfig, configDefaults } from 'vitest/config';

// Suites that read files OUTSIDE this repo — the sibling `curriculum_render` checkout
// (../curriculum_render/...) or untracked/working local files (wsx.js, the in-progress
// data/skill-map.*) — so they only pass in the author's local multi-repo workspace and
// cannot run in a clean single-repo CI checkout. Excluded UNDER CI ONLY (GitHub Actions
// sets CI=true); they still run locally where those deps exist.
// TODO: make these self-skip on missing deps (describe.skipIf(existsSync(dep))) and drop
// this list.
const CI_ONLY_EXCLUDES = [
  'tests/level-editor.test.js',          // ../curriculum_render activities corpus
  'tests/level-editor-sim.test.js',      // ../curriculum_render activities corpus
  'tests/level-editor-lint.test.js',     // ../curriculum_render activities corpus
  'tests/candy-poke.test.js',            // ../curriculum_render
  'tests/doge-presence-submenu.test.js', // ../curriculum_render
  'tests/disambiguate-skills.test.js',   // working data/skill-map.* (uncommitted)
  'tests/skill-map.test.js',             // working data/skill-map.* (uncommitted)
];

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js', 'lib/**/*.test.js'],
    exclude: [...configDefaults.exclude, ...(process.env.CI ? CI_ONLY_EXCLUDES : [])],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['ai-grading-prompts.js']
    }
  }
});
