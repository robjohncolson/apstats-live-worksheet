import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeLiftActor } from './native-lift-actor.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
const lift = (...params) => createNativeLiftActor({ partySize: 4,
  spawn: { actorName: 'Lift', label: '1', x: 400, y: 600, raw: [0, 0, 'Lift', '1', 400, 600, ...params] } });

test('Lift parses both integer party offsets and preserves zero or negative speed', () => {
  const actor = lift(100.9, -20.9, 2.9, -3.9, -1, 1, 1);
  assert.deepEqual(actor.amplitude, { x: 108, y: -32 });
  assert.equal(actor.speed, -1); assert.equal(actor.liftFlags, 10);
  assert.equal(actor.body.category, 5);
  assert.equal(lift(0, 0, 0, 0, 'bad').speed, 0);
});

test('command lift waits, returns to its origin, stops, and can be triggered again', () => {
  const actor = lift(100, 0, 0, 0, 1, 1, 1);
  actor.scene = { scrollFlags: 0, networkMode: 0 };
  actor.beforeMotion(.25); assert.equal(actor.position.x, 400);
  actor.onCommand(9); assert.equal(actor.scene.scrollFlags, 0x1000);
  // Waiting at zero displacement sets blocked bit; the native phase skip is retained.
  actor.beforeMotion(2.5);
  assert.equal(actor.liftFlags & 4, 0); assert.equal(actor.nextPhase, 0);
  actor.onCommand(9); actor.beforeMotion(1.25);
  assert.equal(actor.position.x, 500);
  actor.beforeMotion(1.25);
  assert.equal(actor.position.x, 400); assert.equal(actor.scene.scrollFlags, 0);
  actor.scene.networkMode = 1; actor.onCommand(9);
  assert.equal(actor.liftFlags & 4, 0);
});

test('ordinary Lift continues through the negative half of the sine cycle', () => {
  const actor = lift(100, -40);
  actor.beforeMotion(1.25); assert.deepEqual(actor.offset, { x: 100, y: -40 });
  actor.beforeMotion(2.5); assert.deepEqual(actor.offset, { x: -100, y: 40 });
  actor.beforeMotion(1.25); assert.equal(actor.nextPhase, 5);
  actor.beforeMotion(.25); assert.equal(actor.nextPhase, .25);
});

test('horizontal movement carries a rider then its side neighbor, not the rider above it', () => {
  const actor = lift(100, 0), world = createNativeBodyRegistry();
  attachNativeBody(world, actor.body);
  const riders = [0, 1, 2].map(index => {
    const rider = { bodies: [], position: { x: 400 + index * 20, y: 580 } };
    rider.body = createNativeActorRectangle(rider, { x: -10, y: -20, width: 20, height: 20 }, 3, true);
    attachNativeBody(world, rider.body); placeNativeActorBodies(rider, rider.position);
    return rider;
  });
  actor.body.contacts.push({ bodyId: riders[0].body.id, normal: { x: 0, y: -1 } });
  riders[0].body.contacts.push({ bodyId: riders[1].body.id, normal: { x: 1, y: 0 } });
  riders[0].body.contacts.push({ bodyId: riders[2].body.id, normal: { x: 0, y: -1 } });
  actor.beforeMotion(1.25);
  assert.deepEqual(riders.map(r => r.position.x), [500, 520, 440]);
});

import { readFile } from 'node:fs/promises';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
test('actual Player contact starts a command lift only after the delay', () => {
  const trigger = { ...row('DelaySwitch', 200, 664, .25), label: 'Lift1' };
  const platform = { ...row('Lift', 400, 600, 100, 0, 0, 0, 1, 1, 1), label: '1' };
  const game = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 200, 640), trigger, platform],
      map: { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 840 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    game.setActive(true); for (let i = 0; i < 8; i++) game.step();
    assert.equal((game.findActor('Lift1').liftFlags & 4), 0);
    for (let i = 0; i < 20; i++) game.step();
    assert.ok((game.findActor('Lift1').liftFlags & 4) >= 1);
    assert.ok(game.findActor('Lift1').position.x > 400);
  } finally { game.rigidWorld.dispose(); }
});

