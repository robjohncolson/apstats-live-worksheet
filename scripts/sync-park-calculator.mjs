// Explicit local vendoring step; the deployed relay never reads a sibling repo.
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const relay = resolve(process.argv[2] || resolve(root, '../curriculum_render/railway-server/apstat-park'));
for (const file of ['calculator-catalog.mjs', 'calculator-curriculum.mjs', 'calculator-engine.mjs', 'calculator-mission.mjs', 'calculator-lobby.mjs']) {
  copyFileSync(resolve(root, 'apstat-park', file), resolve(relay, file));
}
for (const file of [...nativeScriptFilenames, 'manifest.mjs']) {
  copyFileSync(resolve(root, 'ti84-trainer-v2/native', file), resolve(relay, 'calculator-native', file));
}
console.log('Calculator shared modules synchronized to ' + relay);
