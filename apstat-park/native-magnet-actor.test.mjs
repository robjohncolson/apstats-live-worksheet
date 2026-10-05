import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeMagnetActor } from './native-magnet-actor.mjs';
import { stepNativeMagnetParticles } from './native-magnet-particles.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };

test('actual scene sensor collects Player, grabs, pulls and releases on input', () => {
  let held = false;
  const scene = createNativeGameScene({ playerCount: 2, createRigidWorld, spawnActor() { throw new Error('Unexpected fixture spawn'); },
    stage: { createTable: [], map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 840 ? 2 : 1) } },
    playerInput: { held: (action, slot) => slot === 0 && action === 11 && held, pressed: () => false }, playSound() {} });
  try {
    const owner = createNativePlayer({ playerIndex: 0, position: { x: 200, y: 665 }, presentation });
    const target = createNativePlayer({ playerIndex: 1, position: { x: 290, y: 665 }, presentation });
    owner.name = 'Player0'; target.name = 'Player1';
    scene.addPlayer(owner); scene.addPlayer(target);
    const magnet = createNativeMagnetActor({ owner, position: owner.position, randomFloat: () => .5 });
    scene.addActor(magnet); scene.setActive(true);
    for (let i = 0; i < 4; i++) scene.step();
    held = true;
    for (let i = 0; i < 4; i++) scene.step();
    assert.equal(magnet.target, target);
    assert.ok(target.position.x < 290);
    assert.equal(owner.carriedAttachments[0], magnet);
    held = false; scene.step();
    assert.equal(magnet.target, null);
    assert.equal(target.controller.state.flags & 8, 0);
  } finally { scene.rigidWorld.dispose(); }
});

test('particles preserve correlated spawn coordinates, capacity RNG calls and pause', () => {
  const magnet = { owner: { scale: { x: 1 } }, scene: { actorManager: { flags: 0 } }, magnetFlags: 2, particles: [] };
  let calls = 0;
  stepNativeMagnetParticles(magnet, () => { calls++; return .5; });
  assert.equal(calls, 3);
  assert.deepEqual(magnet.particles[0], { x: 95, y: -17.5, alpha: .5, moving: true });
  magnet.scene.actorManager.flags = 8;
  stepNativeMagnetParticles(magnet, () => { throw new Error('paused RNG'); });
  assert.equal(magnet.particles[0].x, 95);
  magnet.scene.actorManager.flags = 0; magnet.magnetFlags = 0;
  stepNativeMagnetParticles(magnet, () => { throw new Error('inactive RNG'); });
  assert.ok(magnet.particles[0].x < 95); assert.ok(magnet.particles[0].alpha < .5);
  magnet.magnetFlags = 2; magnet.particles = Array.from({ length: 16 }, () => ({ x: 95, y: 0, alpha: .5, moving: true }));
  calls = 0; stepNativeMagnetParticles(magnet, () => { calls++; return 1; });
  assert.equal(calls, 1); assert.equal(magnet.particles.length, 16);
});
