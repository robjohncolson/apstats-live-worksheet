import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // bcrypt-heavy auth paths (change-password, brute-force lockout, claim) do
    // several real password hashes per test. Under the full parallel run those
    // can blow past the 5s default and flake (they pass in isolation). Give the
    // whole suite crypto headroom so the green is reproducible, not load-dependent.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
