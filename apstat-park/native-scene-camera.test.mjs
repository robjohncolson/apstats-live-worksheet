import test from 'node:test';
import assert from 'node:assert/strict';
import { updateNativeSceneCamera, updateNativeVisibleColumns } from './native-scene-camera.mjs';

const player = (x, kind = 2, visible = true) => ({ position: { x, y: 100 },
  renderOffset: { x: 1000, y: 0 }, controllerKind: kind, spriteFlags: visible ? 8 : 0 });
const fixture = () => ({ players: [player(1280)], viewPosition: { x: 0, y: 0 },
  viewOffset: { x: 0, y: 0 }, viewScale: 1, scrollMode: 1, scrollFlags: 0,
  scrollLimit: -1, scrollSpeed: 2, cameraBlend: 0, cameraMaxStep: 4,
  mapWidth: 100, chipSize: 32, mapOffset: 0, actorManager: { flags: 0 }, flags: 0 });

test('fixed camera still records world player extrema and filters only hidden walking players', () => {
  const scene = fixture();
  scene.scrollMode = 0;
  scene.players = [player(20, 2, false), player(40), player(100, 4, false)];
  scene.cameraAnchor = { position: { x: 200 } };
  updateNativeSceneCamera(scene);
  assert.equal(scene.playerMinX, 40);
  assert.equal(scene.playerMaxX, 200);
  assert.equal(scene.viewPosition.x, 0);
  assert.equal(scene.mapViewLeft, undefined);
});

test('team following blends toward bounded movement and preserves native float overshoot', () => {
  const scene = fixture();
  scene.cameraBlend = 1;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 4);
  scene.actorManager.flags = 8;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 4, 'manager pause suppresses following');
  scene.actorManager.flags = 0;
  scene.cameraBlend = Math.fround(.99);
  updateNativeSceneCamera(scene);
  assert.ok(scene.cameraBlend > 1, 'blend is not clamped at one');
  scene.scrollFlags = 0x1000;
  scene.cameraBlend = 0;
  scene.viewPosition.x = 0;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 640, 'zero blend moves directly to team center');
});

test('auto camera pauses for dying players and network clients, clamps map end and supports unbounded scrolling', () => {
  const scene = fixture();
  scene.scrollMode = 2;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 2);
  scene.players[0].controllerKind = 3;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 2);
  scene.players[0].controllerKind = 2;
  scene.flags = 0x100; scene.networkMode = 1;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 2);
  scene.flags = 0;
  scene.viewPosition.x = 1919;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 1920);
  scene.scrollFlags = 8;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 1922);
});

test('scripted scroll overshoots by .01 then clears its target without following in the same frame', () => {
  const scene = fixture();
  scene.scrollLimit = 2;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, Math.fround(2.01));
  updateNativeSceneCamera(scene);
  assert.equal(scene.scrollLimit, -1);
  assert.equal(scene.viewPosition.x, Math.fround(2.01));
  updateNativeSceneCamera(scene);
  assert.ok(scene.viewPosition.x > 2.01);
});

test('forward-only and correction-only camera modes preserve their distinct boundary behavior', () => {
  const scene = fixture();
  scene.players[0].position.x = 0;
  scene.viewPosition.x = 100;
  scene.scrollFlags = 0x10;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 100);
  scene.scrollFlags = 0x80;
  scene.viewPosition.x = 2000;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 1920);
  scene.viewPosition.x = 100;
  updateNativeSceneCamera(scene);
  assert.equal(scene.viewPosition.x, 100, 'correction-only does not track the team');
});

test('visible map columns respect view scale, offset and native truncation for negative coordinates', () => {
  const scene = fixture();
  scene.viewScale = 2;
  scene.viewOffset.x = -31;
  updateNativeVisibleColumns(scene);
  assert.deepEqual(scene.visibleMapRect, { x: 0, y: 0, width: 22, height: -1 });
  scene.viewPosition.x = 95;
  updateNativeVisibleColumns(scene);
  assert.equal(scene.visibleMapRect.x, 2);
});
