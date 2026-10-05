import test from 'node:test';
import assert from 'node:assert/strict';
import { updateNativeGameTimer, checkNativeTimerExpired } from './native-scene-timer.mjs';
import { updateNativeSceneCamera, updateNativeVisibleColumns } from './native-scene-camera.mjs';
import { updateNativeSceneOutcomes } from './native-scene-outcomes.mjs';
import { stepNativeGameScenePhysics, NATIVE_FRAME_SECONDS } from './native-scene-frame.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';

const fixture = () => {
  const messages = [];
  const scene = { scrollFlags: 0x200, remainingSeconds: 1, mapFlags: 7,
    actorManager: { flags: 0 }, sendCommand: (...args) => messages.push(args) };
  return { scene, messages };
};

test('timer decrements in float32, crosses zero without clamping, and broadcasts only on that step', () => {
  const { scene, messages } = fixture();
  scene.remainingSeconds = Math.fround(.01);
  updateNativeGameTimer(scene, NATIVE_FRAME_SECONDS);
  assert.equal(scene.remainingSeconds, Math.fround(Math.fround(.01) - NATIVE_FRAME_SECONDS));
  assert.ok(scene.remainingSeconds < 0);
  assert.equal(scene.mapFlags, 5);
  assert.deepEqual(messages, [[null, 0x2c, null]]);
  updateNativeGameTimer(scene, NATIVE_FRAME_SECONDS);
  assert.equal(messages.length, 1);
  checkNativeTimerExpired(scene);
  assert.equal(messages.length, 2, 'explicit expiration check is not latched');
});

test('timer respects mode, pause and client peer gates without suppressing host time', () => {
  const { scene } = fixture();
  scene.scrollFlags = 0;
  updateNativeGameTimer(scene, .25);
  assert.equal(scene.remainingSeconds, 1);
  scene.scrollFlags = 0x200; scene.actorManager.flags = 8;
  updateNativeGameTimer(scene, .25);
  assert.equal(scene.remainingSeconds, 1);
  scene.actorManager.flags = 0; scene.networkMode = 1;
  assert.throws(() => updateNativeGameTimer(scene, .25), /peer lookup/);
  scene.getTimerPeer = () => null;
  updateNativeGameTimer(scene, .25);
  assert.equal(scene.remainingSeconds, 1);
  scene.getTimerPeer = () => ({});
  updateNativeGameTimer(scene, .25);
  assert.equal(scene.remainingSeconds, .75);
  scene.networkMode = 2;
  scene.getTimerPeer = () => assert.fail('host does not use client lookup');
  updateNativeGameTimer(scene, .25);
  assert.equal(scene.remainingSeconds, .5);
});

test('expiration needs command dispatch and never broadcasts for a disabled timer or NaN', () => {
  const { scene, messages } = fixture();
  scene.remainingSeconds = 0; scene.scrollFlags = 0;
  checkNativeTimerExpired(scene);
  assert.equal(messages.length, 0);
  scene.scrollFlags = 0x200; scene.remainingSeconds = NaN;
  checkNativeTimerExpired(scene);
  assert.equal(messages.length, 0);
  scene.remainingSeconds = 0; delete scene.sendCommand;
  assert.throws(() => checkNativeTimerExpired(scene), /command dispatch/);
});

test('recovered timer, camera, visible columns and outcomes run in original GameScene STEP order', () => {
  const { scene, messages } = fixture();
  Object.assign(scene, { flags: 0x20, remainingSeconds: Math.fround(.01),
    players: [{ controllerKind: 4, position: { x: 1280, y: 100 }, carriedAttachments: [] }],
    bodyWorld: createNativeBodyRegistry(), viewPosition: { x: 0, y: 0 },
    viewOffset: { x: 0, y: 0 }, viewScale: 1, scrollMode: 2,
    scrollLimit: -1, scrollSpeed: 2, mapWidth: 100, chipSize: 32, mapOffset: 0 });
  scene.updateGameTimer = dt => updateNativeGameTimer(scene, dt);
  scene.rigidWorld = { step: (dt, velocity, position) => {
    assert.deepEqual([dt, velocity, position], [NATIVE_FRAME_SECONDS, 10, 10]);
    assert.deepEqual(messages, [[null, 0x2c, null]], 'timer expires before physics');
    assert.equal(scene.viewPosition.x, 0);
    assert.equal(scene.flags & 4, 0);
  } };
  scene.updateCamera = () => { updateNativeSceneCamera(scene); updateNativeVisibleColumns(scene); };
  scene.updateOutcomes = () => {
    assert.equal(scene.viewPosition.x, 2);
    assert.deepEqual(scene.visibleMapRect, { x: 0, y: 0, width: 42, height: -1 });
    updateNativeSceneOutcomes(scene);
  };
  stepNativeGameScenePhysics(scene, NATIVE_FRAME_SECONDS);
  assert.equal(scene.goalCount, 1);
  assert.equal(scene.flags & 4, 4);
});
