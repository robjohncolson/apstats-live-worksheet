import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeColorBoxActor } from './native-color-box-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(rows, originalStage, playerCount = 2) {
  const held = new Set();
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: originalStage ?? { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: (action, slot) => held.has(`${slot}:${action}`), pressed: () => false },
    playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, held };
}

test('ColorBox resolves party-relative and excluded colors; forced colors remain absolute', () => {
  const make = (name, ...params) => createNativeColorBoxActor({ spawn: row(name, 200, 400, ...params), partySize: 2 });
  const box = make('ColorBox', 6, 48, 60, 2);
  assert.equal(box.colorSlot, 1); assert.equal(box.onCommand(0x1f), 2);
  assert.deepEqual(box.body.rawBounds, { x: -22, y: -58, width: 44, height: 56 });
  assert.equal(box.body.type, 3); assert.equal(box.body.category, 2);
  assert.equal(make('ColorBox', 7).colorSlot, 1);
  const forced = make('ForceColorBox', 8, 48, 48);
  assert.equal(forced.colorSlot, 8); assert.equal(forced.motionFlags, 12);
});

test('actual player can push only its matching ColorBox', () => {
  const results = [];
  for (const color of [0, 1]) {
    const { scene, held } = fixture([row('Player', 160, 670), row('ColorBox', 230, 670, color, 48, 48)]);
    try {
      scene.setActive(true); held.add('0:6');
      for (let i = 0; i < 55; i++) scene.step();
      results.push(scene.findActor('ColorBox').position.x);
    } finally { scene.rigidWorld.dispose(); }
  }
  assert.ok(results[0] > 250, `matching player should move box: ${results}`);
  assert.equal(results[1], 230, 'wrong-color contact must not push');
});

test('matching input slot propagates through contact chains and ignores map contacts', () => {
  const { scene } = fixture([row('Player', 100, 600), row('PushBox', 200, 600, 100, 48, 48),
    row('ColorBox', 300, 600, 0, 48, 48)]);
  try {
    scene.setActive(true);
    const box = scene.findActor('ColorBox'), middle = scene.findActor('PushBox'), player = scene.players[0];
    const contact = actor => ({ bodyId: actor.bodies[0].body.id, normal: { x: -1, y: 0 }, state: 1 });
    box.body.contacts = [contact(middle)]; middle.body.contacts = [contact(player)];
    player.velocity.x = 3; middle.velocity.x = 0;
    box.beforeMotion(); assert.equal(box.velocity.x, 1);
    player.playerIndex = 1; box.beforeMotion(); assert.equal(box.velocity.x, 0);
    player.playerIndex = 0; player.velocity.x = -3; box.beforeMotion(); assert.equal(box.velocity.x, 0);
    box.body.contacts = []; box.body.mapContacts = [{ x: -1, y: 0 }];
    box.beforeMotion(); assert.equal(box.velocity.x, 0);
  } finally { scene.rigidWorld.dispose(); }
});

test('ColorBox disable and freeze commands preserve pending relocation and impulses', () => {
  const { scene } = fixture([row('ColorBox', 200, 600, 0, 48, 48)]);
  try {
    scene.setActive(true); const box = scene.findActor('ColorBox');
    box.onCommand(0xe, 0); assert.equal(box.body.flags & 1, 0); assert.equal(box.flags & 1, 1);
    box.onCommand(0xe, 1); assert.equal(box.body.flags & 1, 1); assert.equal(box.flags & 1, 0);
    box.onCommand(2, { x: 3, y: -4 }); box.onCommand(7, { x: 500, y: 400 });
    assert.equal(box.onCommand(0x1e, 1), 1); box.beforeMotion();
    assert.deepEqual(box.velocity, { x: 0, y: 0 }); assert.equal(box.boxFlags, 5);
    box.onCommand(0x1e, 0); box.beforeMotion();
    assert.deepEqual(box.velocity, { x: 3, y: Math.fround(Math.fround(.65) - 4) });
    box.afterMotion(); assert.deepEqual(box.position, { x: 500, y: 400 });
    box.onCommand(8); assert.deepEqual(box.position, { x: 200, y: 600 });
  } finally { scene.rigidWorld.dispose(); }
});

for (const name of ['stage_push01', 'stage_auto_scroll01']) {
  for (const count of [2, 8]) test(`original ${name} initializes for ${count} players`, () => {
    const { scene } = fixture([], stages.find(s => s.name === name), count);
    try {
      scene.setActive(true); assert.equal(scene.players.length, count);
      assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
      for (let i = 0; i < 30; i++) scene.step();
      assert.ok(scene.findActor('ColorBox'));
      assert.ok(scene.players.every(player => player.health === 1));
    } finally { scene.rigidWorld.dispose(); }
  });
}
