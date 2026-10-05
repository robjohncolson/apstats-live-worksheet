import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeUpDownLiftActor } from './native-up-down-lift-actor.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const lift = (...params) => createNativeUpDownLiftActor({ spawn: row('UpDownLift', 400, 600, ...params), partySize: 4 });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });

test('UpDownLift uses integer party-adjusted amplitude, positive float speed and category0 inset body', () => {
  const actor = lift(127.6, 0, .75);
  assert.equal(actor.amplitude, 127); assert.equal(actor.speed, .75);
  assert.equal(lift(-70.9, -2.9, 0).amplitude, -78); assert.equal(lift(0).amplitude, -70);
  assert.equal(lift(8, -2).amplitude, -70, 'zero adjusted amplitude retains constructor default');
  assert.deepEqual(actor.body.rawBounds, { x: -59, y: -9, width: 118, height: 18 });
  assert.equal(actor.body.category, 0); assert.equal(actor.body.type, 2); assert.equal(actor.body.flags & 3, 3);
});

test('free motion follows sine extrema with strict period wrap and applies speed to phase only', () => {
  const actor = lift(-70);
  actor.beforeMotion(1.25);
  assert.equal(actor.offset.y, -70); assert.equal(actor.position.y, 530);
  actor.beforeMotion(1.25); actor.beforeMotion(1.25);
  assert.equal(actor.offset.y, 70); assert.equal(actor.position.y, 670);
  actor.beforeMotion(1.25); assert.equal(actor.nextPhase, 5);
  actor.beforeMotion(.25); assert.equal(actor.nextPhase, .25);
  const fast = lift(-70, 0, 2); fast.beforeMotion(.625);
  assert.equal(fast.offset.y, -70);
  const largeStep = lift(-70); largeStep.beforeMotion(12);
  assert.equal(largeStep.nextPhase, 7, 'native subtracts period only once');
});

test('blocked rider chain holds phase, then skips to opposite travel instead of crushing the rider', () => {
  const actor = lift(-70), world = createNativeBodyRegistry();
  attachNativeBody(world, actor.body);
  const rider = { bodies: [], velocity: { x: 0, y: 0 } };
  const body = createNativeActorRectangle(rider, { x: -10, y: -20, width: 20, height: 20 }, 3, true);
  attachNativeBody(world, body); placeNativeActorBodies(rider, { x: 400, y: 591 });
  actor.body.contacts.push({ bodyId: body.id, normal: { x: 0, y: -1 } });
  body.mapContacts.push({ x: 0, y: -1 });
  actor.beforeMotion(.25); assert.equal(actor.offset.y, 0); assert.equal(actor.liftFlags & 1, 1);
  for (let i = 0; i < 9; i++) actor.beforeMotion(.25);
  assert.equal(actor.offset.y, 0); assert.equal(actor.blockedSeconds, 2.25);
  assert.equal(actor.blockedPhaseSkip, 2.5); assert.equal(actor.previousPhase, 0);
  actor.beforeMotion(.25);
  assert.equal(actor.previousPhase, 2.5); assert.equal(actor.nextPhase, 2.75);
  assert.equal(actor.blockedSeconds, 0); assert.equal(actor.blockedPhaseSkip, 0);
  assert.ok(actor.offset.y > 21 && actor.offset.y < 22);
  assert.equal(rider.position.y, f(591 + actor.offset.y));
});

test('solver correction updates both offsets and arms blocked timing; negative skips wrap by7.5', () => {
  const actor = lift(-70);
  actor.onPositionResolved({ x: 410, y: 590 });
  assert.deepEqual(actor.offset, { x: 10, y: -10 }); assert.equal(actor.liftFlags & 1, 1);
  actor.previousPhase = 2;
  actor.beforeMotion(.25);
  assert.equal(actor.blockedPhaseSkip, 6); assert.equal(actor.blockedSeconds, .25);
  assert.equal(actor.previousPhase, 2); assert.equal(actor.position.x, 410);
});

test('actual native Player stays on the moving lift through both halves of its cycle', () => {
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('UpDownLift', 400, 600, -40), row('Player', 400, 550)],
      map: { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 40 * 23 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true);
    for (let i = 0; i < 60; i++) scene.step();
    const actor = scene.findActor('UpDownLift'), player = scene.players[0];
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 0; i < 300; i++) {
      scene.step(); minimum = Math.min(minimum, actor.offset.y); maximum = Math.max(maximum, actor.offset.y);
      assert.ok(Math.abs(player.position.y - actor.position.y + 8.01) < .025);
    }
    assert.ok(minimum < -39.9 && maximum > 39.9); assert.equal(player.health, 1);
  } finally { scene.rigidWorld.dispose(); }
});
