import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeGoalActor } from './native-goal-actor.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';
import { stepNativeSceneFrame } from './native-scene-frame.mjs';
import { nativePlayerMovementBoundary, applyNativePlayerScrollBoundary, checkNativePlayerFallBounds } from './native-player-boundary.mjs';

const fixture = () => {
  const sounds = [], pressed = new Set();
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, mapOffset: 0,
    viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 }, viewScale: 1,
    scrollMode: 0, maximumPlayerY: 720, minimumPlayerY: 0, players: [],
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    playSound: name => sounds.push(name), playerInput: { held: () => false, pressed: action => pressed.has(action) } };
  scene.bodyWorld.map = { width: 40, height: 24, chipSize: 32, table: Array(960).fill(1), customFlags: [] };
  scene.bodyWorld.collisionMatrix[42] = scene.bodyWorld.collisionMatrix[321] = 1;
  scene.onStep = () => stepNativeBodyWorld(scene.bodyWorld);
  scene.clipPlayerMovement = (actor, value) => nativePlayerMovementBoundary(scene, actor, value);
  scene.applyPlayerScrollBoundary = (actor, velocity) => applyNativePlayerScrollBoundary(scene, actor, velocity);
  scene.checkPlayerFallBounds = (actor, state) => checkNativePlayerFallBounds(scene, actor, state);
  return { scene, sounds, pressed };
};

test('Goal owns native art and category10 sensor, offsets after registration and opens only once', () => {
  const { scene, sounds } = fixture();
  scene.mapOffset = 100;
  const goal = createNativeGoalActor({ position: { x: 112, y: 200 } });
  assert.deepEqual(goal.spriteBounds, { x: -32, y: -64, width: 64, height: 64 });
  assert.deepEqual(goal.body.localBounds, { x: -24, y: -32, width: 48, height: 32 });
  assert.equal(goal.body.type, 0);
  assert.equal(goal.body.category, 10);
  queueNativeActor(scene.actorManager, goal, 0, scene);
  assert.equal(goal.position.x, 212);
  assert.equal(goal.body.position.x, 112);
  stepNativeSceneFrame(scene);
  assert.equal(goal.body.position.x, 212);
  goal.onCommand(9); goal.onCommand(9); goal.applyOpenedState(false);
  assert.equal(goal.opened, true);
  assert.deepEqual(sounds, ['get']);
  assert.deepEqual(goal.spriteUV, { x: .09375, y: .5625, width: .046875, height: .046875 });
});

test('Key overlap opens Goal locally; replicated overlap defers to replicated opened state', () => {
  const { scene, sounds } = fixture();
  const goal = createNativeGoalActor();
  queueNativeActor(scene.actorManager, goal, 0, scene);
  goal.networkOwner = {}; scene.networkMode = 1;
  goal.body.onOverlap({ category: 8 });
  assert.equal(goal.opened, false);
  goal.applyOpenedState(true);
  assert.equal(goal.opened, true);
  assert.deepEqual(sounds, ['get']);
  const local = createNativeGoalActor();
  queueNativeActor(scene.actorManager, local, 0, scene);
  local.body.onOverlap({ category: 8 });
  assert.equal(local.opened, true);
  local.spriteAvailable = false; local.opened = false;
  local.open();
  assert.equal(local.opened, false);
});

test('decoded Goal sensor extension grows upward and keeps its bottom anchored', () => {
  const goal = createNativeGoalActor({ sensorExtension: { enabled: true, mode: 1, height: 50 } });
  assert.deepEqual(goal.body.localBounds, { x: -24, y: -82, width: 48, height: 82 });
  assert.deepEqual(createNativeGoalActor({ sensorExtension: { enabled: true, mode: 2, height: 50 } }).body.localBounds,
    { x: -24, y: -32, width: 48, height: 32 });
});

test('registered native Player enters an opened Goal and can leave after the door delay', () => {
  const { scene, pressed } = fixture();
  const player = createNativePlayer({ position: { x: 100, y: 100 }, presentation: { setAnimation() {}, setScale() {} } });
  const goal = createNativeGoalActor({ position: { x: 100, y: 100 } });
  scene.players.push(player);
  queueNativeActor(scene.actorManager, player, 0, scene);
  queueNativeActor(scene.actorManager, goal, 0, scene);
  goal.onCommand(9);
  pressed.add(3);
  stepNativeSceneFrame(scene);
  assert.equal(player.fallState, 4);
  pressed.clear();
  stepNativeSceneFrame(scene);
  assert.equal(player.controllerKind, 4);
  assert.equal(player.body.flags & 1, 0);
  for (let i = 0; i < 62; i++) stepNativeSceneFrame(scene);
  pressed.add(3);
  stepNativeSceneFrame(scene);
  assert.equal(player.fallState, 2);
  pressed.clear();
  stepNativeSceneFrame(scene);
  assert.equal(player.controllerKind, 2);
  assert.equal(player.body.flags & 1, 1);
  assert.equal(player.spriteFlags & 8, 8);
});
