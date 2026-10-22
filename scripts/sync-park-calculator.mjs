// Explicit local vendoring step; the deployed relay never reads a sibling repo.
//
// The shared set is discovered, never hand-listed here:
//   - scripts/park-shared-modules.json  -> every apstat-park/*.mjs the relay must mirror
//   - apstat-park/calculator-native/manifest.mjs -> the native engine files (+ manifest.mjs)
// apstat-park/calculator-lobby.test.mjs reads the same JSON and fails on any drift, so a
// module added to the JSON is synced AND guarded in one edit.
//
// Usage: node scripts/sync-park-calculator.mjs [relayDir]   (default: ../curriculum_render/railway-server/apstat-park)
import { copyFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeScriptFilenames } from '../apstat-park/calculator-native/manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('./park-shared-modules.json', import.meta.url), 'utf8'));
const relay = resolve(process.argv[2] || resolve(root, '../curriculum_render/railway-server/apstat-park'));

if (!existsSync(relay)) {
  console.error('sync-park-calculator: relay dir not found: ' + relay);
  process.exit(1);
}

const copies = [];
for (const file of manifest.sharedModules) {
  copies.push([resolve(root, 'apstat-park', file), resolve(relay, file)]);
}
for (const file of [...nativeScriptFilenames, ...manifest.nativeExtraFiles]) {
  copies.push([
    resolve(root, 'apstat-park', manifest.nativeDir, file),
    resolve(relay, manifest.nativeDir, file),
  ]);
}

let changed = 0;
for (const [from, to] of copies) {
  const before = existsSync(to) ? readFileSync(to) : null;
  copyFileSync(from, to);
  if (before === null || !before.equals(readFileSync(to))) {
    changed += 1;
    console.log('  updated ' + to);
  }
}
console.log(`Calculator shared modules synchronized to ${relay} (${copies.length} files, ${changed} changed)`);
