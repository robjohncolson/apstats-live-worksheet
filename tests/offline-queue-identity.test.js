/**
 * ONE offline queue (sprint C2, 2026-10-22). follow-alongs/offline-queue.js is the
 * canonical copy; curriculum_render/offline-queue.js is written by
 * scripts/sync-offline-queue.mjs and must stay byte-identical. The shared
 * behaviour suite tests/offline-queue-unified.test.js is mirrored the same way.
 *
 * Skipped when the sibling curriculum_render checkout is absent (CI runners).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sibling = resolve(repo, '../curriculum_render');
const SYNCED_FILES = ['offline-queue.js', 'tests/offline-queue-unified.test.js'];

describe('offline-queue.js is one file in two repos', () => {
  it('the sync script lists exactly the mirrored files', async () => {
    const src = readFileSync(resolve(repo, 'scripts/sync-offline-queue.mjs'), 'utf8');
    for (const file of SYNCED_FILES) expect(src).toContain(`'${file}'`);
  });

  it('the canonical file names the sync script and this test', () => {
    const src = readFileSync(resolve(repo, 'offline-queue.js'), 'utf8');
    expect(src).toContain('scripts/sync-offline-queue.mjs');
    expect(src).toContain('tests/offline-queue-identity.test.js');
  });

  it.skipIf(!existsSync(resolve(sibling, 'offline-queue.js')))(
    'curriculum_render copies are byte-identical (skipped when the sibling repo is absent)',
    () => {
      for (const file of SYNCED_FILES) {
        const ours = readFileSync(resolve(repo, file));
        const theirs = readFileSync(resolve(sibling, file));
        expect(ours.equals(theirs), `${file} drifted: run node scripts/sync-offline-queue.mjs`).toBe(true);
      }
    }
  );
});
