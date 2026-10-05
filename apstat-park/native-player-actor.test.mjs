import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';
import { stepNativeSceneFrame } from './native-scene-frame.mjs';
import { nativePlayerMovementBoundary, applyNativePlayerScrollBoundary, checkNativePlayerFallBounds } from './native-player-boundary.mjs';
import { isNativePlayerAirborne } from './native-player-motion.mjs';
import { createNativeBalance } from './native-balance-actor.mjs';
import { createNativeSeesaw } from './native-seesaw.mjs';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { stepNativeGameScenePhysics } from './native-scene-frame.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { readFile } from 'node:fs/promises';

const fixture = () => {
  const held = new Set(), pressed = new Set(), events = [];
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, players: [], playerCount: 1,
    viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 }, viewScale: 1,
    scrollMode: 0, scrollFlags: 0, scrollLimit: -1, maximumPlayerY: 720, minimumPlayerY: 0,
    stageRetryEligible: true, actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    playerInput: { held: action => held.has(action), pressed: action => pressed.has(action) },
    playSound: name => events.push(['sound', name]) };
  scene.bodyWorld.map = { width: 40, height: 24, chipSize: 32,
    table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1), customFlags: [] };
  scene.bodyWorld.collisionMatrix[33] = 1;
  scene.clipPlayerMovement = (actor, value) => nativePlayerMovementBoundary(scene, actor, value);
  scene.applyPlayerScrollBoundary = (actor, velocity) => applyNativePlayerScrollBoundary(scene, actor, velocity);
  scene.checkPlayerFallBounds = (actor, state) => checkNativePlayerFallBounds(scene, actor, state);
  scene.notifyPlayerRelocation = () => events.push(['relocate']);
  scene.onStep = () => stepNativeBodyWorld(scene.bodyWorld);
  const actor = createNativePlayer({ position: { x: 320, y: 620 }, presentation: {
    setAnimation: (_actor, value) => events.push(['animation', value]),
    setScale: () => {}, resetSpriteBounds: () => events.push(['bounds']) } });
  scene.players.push(actor);
  queueNativeActor(scene.actorManager, actor, 0, scene);
  return { scene, actor, held, pressed, events };
};

test('assembled Player lands on map, walks, jumps and lands through the native scene loop', () => {
  const { actor, scene, held, pressed, events } = fixture();
  for (let i = 0; i < 60; i++) stepNativeSceneFrame(scene);
  assert.equal(isNativePlayerAirborne(actor), false);
  assert.ok(Math.abs(actor.position.y - 672.99) < .02);
  const startX = actor.position.x, startY = actor.position.y;
  held.add(6);
  for (let i = 0; i < 10; i++) stepNativeSceneFrame(scene);
  assert.equal(actor.position.x, startX + 30);
  assert.equal(actor.animation, 1);
  held.add(2); pressed.add(2);
  stepNativeSceneFrame(scene); pressed.clear();
  for (let i = 0; i < 12; i++) stepNativeSceneFrame(scene);
  assert.ok(actor.position.y < startY - 40);
  assert.equal(actor.animation, 2, 'walking cannot replace jump art mid-flight');
  assert.equal(isNativePlayerAirborne(actor), true);
  held.clear();
  for (let i = 0; i < 180; i++) stepNativeSceneFrame(scene);
  assert.equal(isNativePlayerAirborne(actor), false);
  assert.equal(actor.animation, 0);
  assert.equal(actor.positionHistory.length, 256);
  assert.ok(events.some(event => event[0] === 'sound' && event[1] === 'jump'));
});

test('assembled Player accepts damage, switches controller next frame, and completes death without respawn', () => {
  const { actor, scene, events } = fixture();
  for (let i = 0; i < 60; i++) stepNativeSceneFrame(scene);
  const start = { ...actor.position };
  assert.equal(actor.onCommand(4), 1);
  assert.equal(actor.controllerKind, 2);
  stepNativeSceneFrame(scene);
  assert.equal(actor.controllerKind, 3);
  assert.equal(actor.animation, 4);
  assert.deepEqual(actor.position, start);
  assert.equal(actor.body.flags & 1, 0);
  for (let i = 0; i < 300 && actor.controllerKind !== 1; i++) stepNativeSceneFrame(scene);
  assert.equal(actor.controllerKind, 1);
  assert.equal(actor.spriteFlags & 8, 0);
  assert.ok(actor.position.y > 2880);
  assert.equal(scene.flags & 2, 2);
  assert.equal(events.filter(event => event[0] === 'animation' && event[1] === 4).length, 1);
});

test('assembled Player disable/enable stops scheduling and pending relocation resumes before showing', () => {
  const { actor, scene } = fixture();
  stepNativeSceneFrame(scene);
  actor.onCommand(0xe, 0);
  const position = { ...actor.position };
  stepNativeSceneFrame(scene);
  assert.deepEqual(actor.position, position);
  assert.equal(actor.spriteFlags & 10, 2);
  actor.onCommand(7, { x: 500, y: 500 });
  actor.onCommand(0xe, 1);
  assert.equal(actor.flags & 1, 0);
  assert.equal(actor.spriteFlags & 8, 0);
  stepNativeSceneFrame(scene);
  assert.deepEqual(actor.position, { x: 500, y: 500 });
  assert.equal(actor.spriteFlags & 10, 8);
  assert.equal(actor.body.flags & 1, 1);
});

test('assembled Player loads and rides Balance, jumps, and returns through both native physics worlds', async () => {
  const { actor, scene, held, pressed } = fixture();
  const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
  scene.rigidWorld = await createNativeRigidWorld({ moduleOptions: { wasmBinary } });
  try {
    scene.playerCount = 2;
    scene.bodyWorld.collisionMatrix[1] = scene.bodyWorld.collisionMatrix[32] = 1;
    scene.updateCamera = () => {};
    scene.updateOutcomes = () => {};
    scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
    placeNativeActorBodies(actor, { x: 1090, y: 570 });
    const seesaw = createNativeSeesaw({ position: { x: 640, y: 358 }, parent: true, type: 1 });
    seesaw.name = 'SeesawParent';
    queueNativeActor(scene.actorManager, seesaw, 0, scene);
    scene.sendCommand = (name, command, value) => {
      assert.equal(name, seesaw.name);
      seesaw.onCommand(command, value);
    };
    const balance = createNativeBalance({ name: 'BalanceSeesawParent', position: { x: 640, y: 604 }, span: 900 });
    queueNativeActor(scene.actorManager, balance, 0, scene);
    for (let i = 0; i < 150; i++) stepNativeSceneFrame(scene);
    assert.equal(isNativePlayerAirborne(actor), false);
    assert.equal(balance.right.supportCount, 1);
    assert.ok(balance.right.currentOffset > 40);
    const startY = actor.position.y;
    held.add(2); pressed.add(2);
    stepNativeSceneFrame(scene); pressed.clear();
    for (let i = 0; i < 12; i++) stepNativeSceneFrame(scene);
    assert.ok(actor.position.y < startY - 40);
    held.clear();
    for (let i = 0; i < 160; i++) stepNativeSceneFrame(scene);
    assert.equal(isNativePlayerAirborne(actor), false);
    assert.equal(balance.right.supportCount, 1);
  } finally { scene.rigidWorld.dispose(); }
});
