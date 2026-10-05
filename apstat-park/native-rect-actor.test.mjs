import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeRectActor } from './native-rect-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(rows) {
  const held = new Set();
  const scene = createNativeGameScene({ playerCount: 2, createRigidWorld,
    stage: { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, { playerPresentation: presentation }) });
  return { scene, held };
}

test('Rect preserves party-adjusted bottom anchor and native category, priority and initial disabled state', () => {
  const spawn = row('Rect', 100, 200, 20, 40, -10, 5, 3, -2);
  const actor = createNativeRectActor({ spawn, partySize: 8 });
  assert.deepEqual(actor.position, { x: 78, y: 188 });
  assert.deepEqual(actor.body.rawBounds, { x: 0, y: -70, width: 40, height: 70 });
  assert.equal(actor.body.category, 6);
  assert.equal(actor.body.type, 2);
  assert.equal(actor.body.flags & 3, 2);
  assert.equal(actor.managerPriority, 2);
  assert.equal(actor.patch.uvY, .515625);
});

test('assembled Player lands on a native Rect instead of falling through to map floor', () => {
  const { scene } = fixture([row('Player', 100, 500, 0), row('Rect', 50, 672, 200, 72)]);
  try {
    scene.setActive(true);
    const rect = scene.findActor('Rect'), player = scene.players[0];
    assert.equal(rect.body.flags & 1, 1);
    for (let i = 0; i < 90; i++) scene.step();
    assert.ok(Math.abs(player.position.y - 600.99) < .02);
    assert.ok(player.body.contacts.some(contact => contact.bodyId === rect.body.id));
    assert.deepEqual(rect.position, { x: 50, y: 672 });
  } finally { scene.rigidWorld.dispose(); }
});

test('Rect waits until overlapping Player leaves, then hiding its art retains collision', () => {
  const { scene, held } = fixture([row('Player', 100, 640, 0), row('Rect', 0, 672, 200, 72)]);
  try {
    scene.setActive(true);
    const rect = scene.findActor('Rect');
    for (let i = 0; i < 10; i++) scene.step();
    assert.equal(rect.body.flags & 1, 0, 'occupied platform remains disabled');
    held.add(6);
    for (let i = 0; i < 60; i++) scene.step();
    assert.equal(rect.body.flags & 1, 1);
    scene.sendCommand('Rect', 0xe, 0);
    assert.equal(rect.patchFlags & 8, 0);
    assert.equal(rect.spriteFlags & 8, 8, 'command targets the Rect component, not the common sprite');
    assert.equal(rect.body.flags & 1, 1);
    scene.sendCommand('Rect', 0xe, 1);
    assert.equal(rect.patchFlags & 8, 8);
  } finally { scene.rigidWorld.dispose(); }
});

test('invisible Rect is solid immediately; darkness only hides its component when light expires', () => {
  const invisible = createNativeRectActor({ spawn: row('InvisibleRect', 0, 100, 100, 50), partySize: 2 });
  assert.equal(invisible.body.flags & 1, 1);
  assert.equal(invisible.spriteFlags & 8, 0);
  assert.equal(invisible.patchFlags & 8, 0);
  const { scene } = fixture([row('DarknessRect', 0, 100, 100, 50)]);
  try {
    scene.actorManager.flags = 8;
    scene.setActive(true);
    const rect = scene.findActor('DarknessRect');
    assert.equal(rect.body.flags & 1, 1, 'alternate PRE also enables a clear body');
    scene.sendCommand(null, 0x2c, null);
    assert.equal(rect.patchFlags & 8, 0);
    assert.equal(rect.body.flags & 1, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('Rect visibility query includes camera offset and attached stop command freezes scheduling', () => {
  const { scene } = fixture([row('Rect', 20, 100, 100, 50)]);
  try {
    scene.setActive(true);
    const rect = scene.findActor('Rect');
    scene.viewPosition.x = 100; scene.viewOffset.x = 20;
    assert.equal(rect.onCommand(0x13), 1, 'right edge exactly on viewport boundary');
    scene.viewOffset.x = 21;
    assert.equal(rect.onCommand(0x13), 0);
    rect.onCommand(0x1c);
    assert.equal(rect.flags & 1, 1);
    assert.equal(rect.spriteFlags & 2, 2);
    assert.deepEqual(rect.stepStartPosition, rect.position);
  } finally { scene.rigidWorld.dispose(); }
});

test('shared stage factory fails explicitly for an actor whose native implementation is missing', () => {
  const { scene } = fixture([]);
  try {
    assert.throws(() => spawnNativeStageActor(scene, row('Warp', 0, 0)), /not implemented: Warp/);
    assert.equal(scene.bodyWorld.bodies.length, 0);
  } finally { scene.rigidWorld.dispose(); }
});
