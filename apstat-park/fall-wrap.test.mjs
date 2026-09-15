// Falling off the bottom of a level wraps to the top (PICO PARK), it does not
// respawn and it never resets the shared attempt. Only a hazard hit does that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('./board-scene.mjs', import.meta.url), 'utf8');

test('a fall wraps to the top at the same x before the pose is sent', () => {
  const wrap = scene.indexOf('if(player.y>level.height){player.y=-28;player.standingOn=null;}');
  const send = scene.indexOf('replica.motion(pose());');
  assert.ok(wrap > 0, 'wrap rule present');
  assert.ok(wrap < send, 'wrap happens before the pose is sent, so the relay never sees y > height');
  assert.doesNotMatch(scene, /player\.y>level\.height\+20/);   // the old fall-respawn checks are gone
});

test('only a hazard hit respawns (alone) or restarts the shared attempt (together)', () => {
  assert.match(scene, /if\(hit\)Object\.assign\(player,level\.spawn/);
  assert.match(scene, /if\(hit\)\{\s*if\(!retrying\)retrying=replica\.queue\('retry','hazard'/);
  assert.doesNotMatch(scene, /queue\('retry','fall'/);
});
