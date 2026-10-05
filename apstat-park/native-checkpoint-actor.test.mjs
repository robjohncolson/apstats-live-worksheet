import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeCheckPointActor } from './native-checkpoint-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });

test('checkpoint captures first-body scaled dimensions once, including unsigned scene bounds', () => {
  const actor = createNativeCheckPointActor({ spawn: row('CheckPoint', 400, 672) });
  const sounds = [], store = new Map();
  actor.scene = { sceneId: 99, checkpointWord: 0xf1234567, checkpointStore: store,
    playSound: sound => sounds.push(sound) };
  assert.deepEqual(actor.body.rawBounds, { x: -16, y: -64, width: 32, height: 64 });
  assert.equal(actor.body.type, 0); assert.equal(actor.body.category, 8);
  const other = { category: 1, actor: { bodies: [{ body: {
    rawBounds: { x: -16, y: -47, width: 32, height: 46 },
    scale: { x: 2, y: .5 }, pivot: { x: 0, y: 0 } } }] } };
  actor.body.onOverlap({ category: 2 }); assert.equal(store.size, 0);
  actor.body.onOverlap(other); actor.body.onOverlap(other);
  assert.deepEqual(store.get(99), { position: { x: 368, y: 659.5 }, sceneWord: 0xf1234567 });
  assert.deepEqual(sounds, ['check']);
  const invalid = createNativeCheckPointActor({ spawn: row('CheckPoint', 100, 100) });
  invalid.scene = { ...actor.scene, sceneId: -1 };
  invalid.body.onOverlap(other); assert.equal(invalid.checked, true); assert.equal(store.size, 1);
});

function sceneFixture(store, sceneId = 7) {
  const second = row('Player', 100, 640); second.label = '2';
  return createNativeGameScene({ checkpointStore: store, sceneId, checkpointWord: 0x12345678,
    playerCount: 2, createRigidWorld,
    stage: { createTable: [row('Player', 360, 640), second, row('CheckPoint', 400, 672)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: (action, slot) => action === 6 && slot === 0, pressed: () => false },
    playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
}

test('actual Player reaches checkpoint; fresh retry restores saved position with 48-pixel slot stacking', () => {
  const store = new Map(), first = sceneFixture(store);
  try {
    first.setActive(true);
    for (let i = 0; i < 20; i++) first.step();
    assert.equal(first.findActor('CheckPoint').checked, true);
    assert.deepEqual(store.get(7), { position: { x: 384, y: 648 }, sceneWord: 0x12345678 });
  } finally { first.rigidWorld.dispose(); }
  const retry = sceneFixture(store);
  try {
    retry.checkpointWord = 999; retry.setActive(true);
    assert.deepEqual(retry.players.map(p => p.spawnPosition), [{ x: 384, y: 648 }, { x: 384, y: 600 }]);
    assert.equal(retry.checkpointWord, 0x12345678);
    assert.deepEqual(retry.viewPosition, { x: 204, y: 0 });
    assert.ok(retry.players.every(p => p.health === 1));
    assert.equal(retry.findActor('CheckPoint').checked, false, 'flag actor starts fresh on retry');
  } finally { retry.rigidWorld.dispose(); }
});

test('checkpoint restore is isolated by scene and uses shuffled input slots rather than creation order', () => {
  const store = new Map([[7, { position: { x: 100, y: 500 }, sceneWord: 42 }]]);
  const shuffled = sceneFixture(store), different = sceneFixture(store, 8);
  try {
    shuffled.playerSlots = [1, 0]; shuffled.setActive(true);
    assert.deepEqual(shuffled.players.map(p => p.spawnPosition), [{ x: 100, y: 452 }, { x: 100, y: 500 }]);
    assert.equal(shuffled.viewPosition.x, 0);
    different.setActive(true);
    assert.deepEqual(different.players.map(p => p.spawnPosition), [{ x: 360, y: 640 }, { x: 100, y: 640 }]);
    assert.equal(different.checkpointWord, 0x12345678);
  } finally { shuffled.rigidWorld.dispose(); different.rigidWorld.dispose(); }
});
