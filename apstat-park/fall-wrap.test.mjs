// Falling off the bottom of a level wraps to the top (PICO PARK), it does not
// respawn and it never resets the shared attempt. Only a hazard hit does that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('./board-scene.mjs', import.meta.url), 'utf8');

test('a fall wraps to the top above the last solid ground, speed reset, before the pose is sent', () => {
  const wrap = scene.indexOf('if(player.y>level.height){');
  const send = scene.indexOf('replica.motion(pose());');
  assert.ok(wrap > 0, 'wrap rule present');
  assert.ok(wrap < send, 'wrap happens before the pose is sent, so the relay never sees y > height');
  assert.match(scene, /Object\.assign\(player,\{x:safe\.x,y:-28,vx:0,vy:0,standingOn:null\}\)/);   // speed reset
  assert.match(scene, /safe=lastGround&&at-lastWrapAt>2000\?lastGround:level\.spawn/);           // lip, with a loop guard
  assert.match(scene, /if\(grounded&&!wrapDrop\)lastGround=\{x:player\.x,y:player\.y\}/);
  assert.doesNotMatch(scene, /player\.y>level\.height\+20/);   // the old fall-respawn checks are gone
});

test('steering is locked during the drop, so a fall can never bridge a crevasse', () => {
  assert.match(scene, /if\(wrapDrop\)\{player\.x=wrapDrop\.x;player\.vx=0;if\(grounded\)wrapDrop=null;\}/);
});

test('only a hazard hit respawns (alone) or restarts the shared attempt (together)', () => {
  assert.match(scene, /if\(hit\)Object\.assign\(player,level\.spawn/);
  assert.match(scene, /if\(hit\)\{\s*if\(!retrying\)retrying=replica\.queue\('retry','hazard'/);
  assert.doesNotMatch(scene, /queue\('retry','fall'/);
});
