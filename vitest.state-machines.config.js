import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

// Behavioral boundary checks for STATE_MACHINE_MAP.md. Explicit filenames keep
// this gate local and predictable; the full release suites remain separate.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tests/identity-write-transitions.test.js',
      'tests/gradebook-client.test.js',
      'tests/roster-client.test.js',
      'tests/offline-queue-identity.test.js',
      'tests/offline-queue-lock-race.test.js',
      'tests/desk-learning-state-ownership.test.js',
      'tests/desk-flashcard-owner-recovery.test.js',
      'tests/desk-timed-deck.test.js',
      'tests/incident-progress-reset-identity-fork.test.js',
      'tests/progress-reset-matrix-identity-switch.test.js',
      'tests/desk-progress-lifecycle.test.js',
      'tests/desk-progress-app-module.test.js',
      'tests/activity-level.test.js',
      'tests/video-ondemand.test.js',
    ],
    minWorkers: 1,
    maxWorkers: 2,
  },
});
