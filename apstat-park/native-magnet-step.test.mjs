import test from 'node:test';
import assert from 'node:assert/strict';
import { stepNativeMagnetInput, stepNativeMagnetGrab } from './native-magnet-step.mjs';
import { followNativeMagnetOwner } from './native-magnet-position.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
const f = Math.fround;
function fixture() {
  const player = x => createNativePlayer({ position: { x, y: 100 },
    presentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } });
  const owner = player(200), target = player(300), sounds = [];
  const input = { held: true, pressed: false };
  owner.input = { held: action => action === 11 && input.held, pressed: action => action === 11 && input.pressed };
  const scene = { players: [owner, target], actorManager: { flags: 0 }, playSound: name => sounds.push(name) };
  const magnet = { owner, scene, candidates: [target], target: null, magnetFlags: 0, soundSeconds: 0, spriteFlags: 9 };
  followNativeMagnetOwner(magnet);
  return { magnet, owner, target, scene, input, sounds };
}

test('hold input, toggle edges, hidden owner and replica authority match native branches', () => {
  const { magnet, owner, scene, input } = fixture();
  assert.equal(stepNativeMagnetInput(magnet, .1), true);
  input.held = false; assert.equal(stepNativeMagnetInput(magnet, .1), false);
  scene.magnetToggleInput = true; input.pressed = true;
  assert.equal(stepNativeMagnetInput(magnet, .1), true);
  input.pressed = false; assert.equal(stepNativeMagnetInput(magnet, .1), true);
  input.pressed = true; assert.equal(stepNativeMagnetInput(magnet, .1), false);
  magnet.replication = {}; scene.networkMode = 1; owner.canReceiveDamage = () => false;
  magnet.magnetFlags |= 2; assert.equal(stepNativeMagnetInput(magnet, .1), true);
  owner.spriteFlags &= ~8; assert.equal(stepNativeMagnetInput(magnet, .1), false);
});

test('sound repeats on the frame after countdown expiry and respects manager pause', () => {
  const { magnet, scene, sounds, input } = fixture();
  stepNativeMagnetInput(magnet, f(.6)); assert.deepEqual(sounds, ['magnet']);
  assert.equal(magnet.soundSeconds, 0);
  scene.actorManager.flags = 8; stepNativeMagnetInput(magnet, 1);
  assert.equal(sounds.length, 1);
  scene.actorManager.flags = 0; stepNativeMagnetInput(magnet, .1);
  assert.equal(sounds.length, 2);
  input.held = false; stepNativeMagnetInput(magnet, .1); assert.equal(magnet.soundSeconds, 0);
});

test('acquisition freezes first, next contact pulls, and missing contact releases without reacquisition', () => {
  const { magnet, owner, target } = fixture();
  stepNativeMagnetGrab(magnet, 1 / 60);
  assert.equal(magnet.target, target); assert.equal(target.position.x, 300);
  assert.equal(owner.motionFlags & 4, 0); assert.equal(magnet.candidates.length, 0);
  magnet.candidates.push(target); stepNativeMagnetGrab(magnet, 1 / 60);
  assert.equal(target.position.x, 298); assert.equal(target.velocity.x, -2);
  stepNativeMagnetGrab(magnet, 1 / 60);
  assert.equal(magnet.target, null); assert.equal(owner.motionFlags & 4, 4);
  assert.equal(target.controller.state.flags & 8, 0);
});

test('mutual grab suppresses held horizontal velocity and applies airborne owner gravity', () => {
  const { magnet, owner, target } = fixture();
  stepNativeMagnetGrab(magnet, .01);
  target.carriedAttachments[0] = { isNativeMagnet: true, target: owner };
  target.velocity = { x: 4, y: 7 };
  magnet.candidates.push(target); stepNativeMagnetGrab(magnet, .01);
  assert.deepEqual(target.velocity, { x: 0, y: 7 });
  assert.equal(target.position.x, 298); assert.equal(owner.velocity.y, f(.65));
  owner.body.mapContacts.push({ x: 0, y: 1 });
  magnet.candidates.push(target); stepNativeMagnetGrab(magnet, .01);
  assert.equal(owner.velocity.y, f(.65));
});
