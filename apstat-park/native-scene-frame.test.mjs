import assert from 'node:assert/strict';
import test from 'node:test';
import { stepNativeSceneFrame, stepNativeGameScenePhysics, NATIVE_FRAME_SECONDS } from './native-scene-frame.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeBody, initializeNativeRectangleBody } from './native-body.mjs';

const scene = () => ({ flags: 0x20, frame: 0n, highestFrame: 0n,
  viewPosition: { x: 5, y: 6 }, actorManager: createNativeActorManager(2),
  bodyWorld: createNativeBodyRegistry(), onStep() {} });

test('scene frame snapshots view and runs input, PRE, STEP, POST and presentation at fixed native cadence', () => {
  const world = scene(), events = [];
  world.flags |= 0x200;
  world.beforeFrame = dt => { events.push(['before', dt]); world.viewPosition.x = 8; };
  world.updateInputs = (dt, frame) => events.push(['input', dt, frame]);
  world.spawnDueActors = x => events.push(['spawn', x]);
  queueNativeActor(world.actorManager, { onPre: dt => events.push(['pre', dt]), onPost: dt => events.push(['post', dt]) }, 0);
  world.onStep = dt => events.push(['step', dt]);
  world.afterActorPost = dt => events.push(['presentation', dt]);
  stepNativeSceneFrame(world);
  assert.deepEqual(world.previousViewPosition, { x: 5, y: 6 });
  assert.deepEqual(events, [['before', NATIVE_FRAME_SECONDS], ['input', NATIVE_FRAME_SECONDS, 0n], ['spawn', 8],
    ['pre', NATIVE_FRAME_SECONDS], ['step', NATIVE_FRAME_SECONDS], ['post', NATIVE_FRAME_SECONDS], ['presentation', NATIVE_FRAME_SECONDS]]);
  assert.equal(world.frame, 1n);
  assert.equal(world.highestFrame, 1n);
});

test('inactive scene still runs scene hooks and counts frames, but leaves pending actors unpromoted', () => {
  const world = scene(), events = [];
  world.flags = 0;
  world.inputOwner = {};
  const actor = { onPre: () => assert.fail('inactive actor'), onPost: () => assert.fail('inactive actor') };
  queueNativeActor(world.actorManager, actor, 0);
  world.updateInputs = () => assert.fail('external input owner');
  world.beforeFrame = () => events.push('before');
  world.onStep = () => events.push('step');
  stepNativeSceneFrame(world);
  assert.deepEqual(events, ['before', 'step']);
  assert.equal(world.actorManager.pending, actor);
  assert.equal(world.frame, 1n);
});

test('scene rereads active flag between callbacks rather than freezing phase eligibility', () => {
  const world = scene(), events = [];
  queueNativeActor(world.actorManager, { onPre: () => { events.push('pre'); world.flags = 0; },
    onPost: () => events.push('post') }, 0);
  world.onStep = () => events.push('step');
  stepNativeSceneFrame(world);
  assert.deepEqual(events, ['pre', 'step']);
  world.onStep = () => { events.push('reactivate'); world.flags = 0x20; };
  stepNativeSceneFrame(world);
  assert.deepEqual(events.slice(2), ['reactivate', 'post']);
});

test('GameScene steps the separate rigid world before custom overlap callbacks, then camera and outcomes', () => {
  const world = scene(), events = [];
  const a = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width: 10, height: 10 }, 0);
  const b = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width: 10, height: 10 }, 0);
  b.position.x = 20;
  attachNativeBody(world.bodyWorld, a);
  attachNativeBody(world.bodyWorld, b);
  a.onOverlap = () => events.push('overlap');
  world.updateGameTimer = () => events.push('timer');
  world.rigidWorld = { step: (dt, velocity, position) => {
    events.push(['rigid', dt, velocity, position]);
    b.position.x = 5;
  } };
  world.updateCamera = () => events.push('camera');
  world.updateOutcomes = () => events.push('outcomes');
  world.onStep = dt => stepNativeGameScenePhysics(world, dt);
  queueNativeActor(world.actorManager, { onPre: () => events.push('pre'), onPost: () => events.push('post') }, 0);
  stepNativeSceneFrame(world);
  assert.deepEqual(events, ['pre', 'timer', ['rigid', NATIVE_FRAME_SECONDS, 10, 10], 'overlap', 'camera', 'outcomes', 'post']);
});

test('active GameScene refuses a missing rigid solver or missing outcome implementation', () => {
  const world = scene();
  assert.throws(() => stepNativeGameScenePhysics(world, NATIVE_FRAME_SECONDS), /rigid-body/);
  world.rigidWorld = { step() { assert.fail('validation must precede partial stepping'); } };
  assert.throws(() => stepNativeGameScenePhysics(world, NATIVE_FRAME_SECONDS), /camera and outcome/);
  world.flags = 0;
  assert.doesNotThrow(() => stepNativeGameScenePhysics(world, NATIVE_FRAME_SECONDS));
});

test('scene frame uses uint64 increment and preserves its high-water frame after wrap', () => {
  const world = scene();
  world.frame = (1n << 64n) - 1n;
  world.highestFrame = world.frame;
  stepNativeSceneFrame(world);
  assert.equal(world.frame, 0n);
  assert.equal(world.highestFrame, (1n << 64n) - 1n);
});
