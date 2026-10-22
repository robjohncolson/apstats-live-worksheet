// Vendor the ONE offline queue into curriculum_render (fa canonical -> cr mirror).
//
// follow-alongs/offline-queue.js is the only copy anyone edits. The quiz app's
// gradebook-client.js consumes the same window.OfflineQueue API, so cr carries a
// byte-identical mirror. tests/offline-queue-identity.test.js in BOTH repos fails
// on drift (skipped when the sibling checkout is absent).
//
// Also mirrored: tests/offline-queue-unified.test.js, the shared behaviour suite
// that runs against the queue in both repos.
//
// Usage: node scripts/sync-offline-queue.mjs [crDir]   (default: ../curriculum_render)
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SYNCED_FILES = ['offline-queue.js', 'tests/offline-queue-unified.test.js'];

const root = fileURLToPath(new URL('../', import.meta.url));
const cr = resolve(process.argv[2] || resolve(root, '../curriculum_render'));

if (!existsSync(resolve(cr, 'offline-queue.js'))) {
  console.error('sync-offline-queue: curriculum_render checkout not found at ' + cr);
  process.exit(1);
}

let changed = 0;
for (const file of SYNCED_FILES) {
  const from = resolve(root, file);
  const to = resolve(cr, file);
  const before = existsSync(to) ? readFileSync(to) : null;
  copyFileSync(from, to);
  if (before === null || !before.equals(readFileSync(to))) {
    changed += 1;
    console.log('  updated ' + to);
  }
}
console.log(`Offline queue synchronized to ${cr} (${SYNCED_FILES.length} files, ${changed} changed)`);
