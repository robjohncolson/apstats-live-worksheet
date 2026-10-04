import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLobby, advanceLobby, pushersFor, TEAM_BLOCK } from './calculator-lobby.mjs';

test('client and relay use identical block rules', () => {
  assert.equal(fs.readFileSync(new URL('./calculator-lobby.mjs', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../../curriculum_render/railway-server/apstat-park/calculator-lobby.mjs', import.meta.url), 'utf8'));
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
