import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLobby, advanceLobby, pushersFor, TEAM_BLOCK } from './calculator-lobby.mjs';

// Track J (2026-10-22): the shared set comes from scripts/park-shared-modules.json (+ the
// native manifest), the same list scripts/sync-park-calculator.mjs copies -- so a module
// added there is guarded here without a second edit. Fix drift with `node scripts/sync-park-calculator.mjs`.
const SHARED = JSON.parse(fs.readFileSync(new URL('../scripts/park-shared-modules.json', import.meta.url), 'utf8'));
const RELAY = new URL('../../curriculum_render/railway-server/apstat-park/', import.meta.url);
const { nativeScriptFilenames } = await import('./calculator-native/manifest.mjs');

function sharedFiles() {
  const native = [...nativeScriptFilenames, ...SHARED.nativeExtraFiles].map((f) => SHARED.nativeDir + '/' + f);
  return [...SHARED.sharedModules, ...native];
}

test('client and relay use identical block rules', () => {
  assert.ok(SHARED.sharedModules.includes('calculator-lobby.mjs'));
  for (const file of sharedFiles()) {
    assert.equal(fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8'),
      fs.readFileSync(new URL(file, RELAY), 'utf8'),
      file + ' differs between client and relay; run node scripts/sync-park-calculator.mjs');
  }
});

test('every calculator module the relay imports from its own copy is in the shared manifest', () => {
  // A relay-side `import './calculator-x.mjs'` where apstat-park/calculator-x.mjs also exists
  // means both sides carry the module -- it must be in the synced set or it drifts by hand.
  const clientFiles = new Set(fs.readdirSync(new URL('./', import.meta.url)));
  const relayFiles = fs.readdirSync(RELAY).filter((f) => f.endsWith('.mjs') && !f.includes('.test.'));
  const missing = relayFiles.filter((f) => clientFiles.has(f) && !SHARED.sharedModules.includes(f));
  assert.deepEqual(missing, [], 'present on both sides but not in scripts/park-shared-modules.json');
});

test('the live count includes a five-player pushing chain, not spectators or stale input', () => {
  const lobby = createLobby(0);
  for (let i = 0; i < 5; i++) lobby.members.set('player' + i,
    { at: 0, pushing: true, pose: { x: TEAM_BLOCK.start - 20 * (i + 1), y: 676 } });
  lobby.members.set('walk-in', { at: 0, pushing: true, pose: { x: 1100, y: 676 } });
  lobby.members.set('watcher', { at: 0, pushing: false, pose: { x: 380, y: 676 } });
  lobby.members.set('jumper', { at: 0, pushing: true, pose: { x: 380, y: 640 } });
  assert.equal(pushersFor(lobby, 100).length, 5);
  assert.equal(pushersFor(lobby, 350).length, 0);
  advanceLobby(lobby, 100);
  assert.equal(lobby.x, TEAM_BLOCK.start + 6);
  const stopped = lobby.x;
  advanceLobby(lobby, 1000);
  assert.equal(lobby.x, stopped, 'a stalled connection cannot keep pushing');
});

test('docking locks the current pushers and requires fresh arrival readiness', () => {
  const lobby = createLobby(0);
  lobby.x = TEAM_BLOCK.dock - 2;
  for (const name of ['alice', 'bob']) lobby.members.set(name,
    { at: 0, pushing: true, ready: true, pose: { x: lobby.x - 20, y: 676 } });
  assert.equal(advanceLobby(lobby, 100), true);
  assert.equal(lobby.x, TEAM_BLOCK.dock);
  assert.deepEqual(lobby.roster, ['alice', 'bob']);
  assert.equal(lobby.phase, 'assembling');
  assert.equal(lobby.members.get('alice').ready, false);
  lobby.members.delete('bob');
  advanceLobby(lobby, 200);
  assert.deepEqual(lobby.roster, ['alice', 'bob'], 'leaving cannot silently shrink the selected team');
});
