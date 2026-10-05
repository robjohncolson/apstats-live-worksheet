import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeWindActor } from './native-wind-actor.mjs';
import { createNativeScrollLimitRangeActor } from './native-scroll-limit-range-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });

test('Wind selects party-indexed strength and offsets its two bodies vertically before registration', () => {
  const spawn = row('Wind', 600, 672, -5, -2, -3.1, -4);
  const actor = createNativeWindActor({ spawn, partySize: 3 });
  assert.equal(actor.strength, f(-3.1)); assert.deepEqual(actor.position, { x: 600, y: 657 });
  assert.deepEqual(actor.body.rawBounds, { x: -31, y: -75, width: 62, height: 74 });
  assert.equal(actor.body.type, 2); assert.equal(actor.body.category, 0);
  assert.deepEqual(actor.windBody.rawBounds, { x: -1280, y: -60, width: 1280, height: 16 });
  assert.equal(actor.windBody.type, 0); assert.equal(actor.windBody.category, 4);
  assert.equal(createNativeWindActor({ spawn, partySize: 1 }).strength, -2);
  assert.equal(createNativeWindActor({ spawn, partySize: 8 }).strength, 0);
  const recipient = { externalVelocity: { x: 99, y: -5 } };
  actor.windBody.onOverlap({ actor: recipient, category: 3 });
  assert.deepEqual(recipient.externalVelocity, { x: f(-3.1), y: 0 });
});

test('ScrollLimitRange uses strict previous camera extrema and waits for carried native Key', () => {
  for (const all of [0, 1]) {
    const actor = createNativeScrollLimitRangeActor({ spawn: row('ScrollLimitRange', 200, 0, 99, all) });
    let key = null;
    actor.scene = { playerMinX: 200, playerMaxX: 200, scrollMode: 1, findActor: name => name === 'Key' ? key : null };
    actor.beforeMotion(); assert.equal(actor.phase, 0);
    actor.scene.playerMaxX = 201; actor.beforeMotion();
    assert.equal(actor.phase, all ? 0 : 1);
    actor.scene.playerMinX = 201; actor.beforeMotion();
    assert.equal(actor.phase, 1); assert.equal(actor.scene.scrollMode, 2);
    key = { carrier: {} }; actor.beforeMotion(); assert.equal(actor.phase, 1);
    key.isNativeKey = true; actor.beforeMotion();
    assert.equal(actor.phase, 2); assert.equal(actor.scene.scrollMode, 1);
    key.carrier = null; actor.scene.playerMinX = 0; actor.beforeMotion();
    assert.equal(actor.phase, 2, 'finished trigger never rearms');
  }
});

function fixture(rows, held = () => false) {
  return createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { scrollable: 1, createTable: rows, map: { width: 60, height: 24, chipSize: 32,
      table: Array.from({ length: 1440 }, (_, i) => i >= 60 * 21 ? 2 : 1) } },
    playerInput: { held, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
}

test('actual grounded Player is blown horizontally by the Wind sensor without movement input', () => {
  const scene = fixture([row('Player', 400, 670), row('Wind', 600, 672, 0, -2)]);
  try {
    scene.setActive(true); const player = scene.players[0];
    for (let i = 0; i < 30; i++) scene.step();
    assert.ok(player.position.x < 350); assert.equal(player.velocity.x, -2);
    assert.ok(Math.abs(player.position.y - 672.99) < .02); assert.equal(player.health, 1);
    assert.equal(scene.findActor('Wind').position.x, 600);
  } finally { scene.rigidWorld.dispose(); }
});

test('actual Player crossing range and collecting native Key changes camera modes in sequence', () => {
  const scene = fixture([row('Player', 100, 640), row('ScrollLimitRange', 180, 0, 999), row('Key', 330, 640)], action => action === 6);
  try {
    scene.setActive(true); const trigger = scene.findActor('ScrollLimitRange');
    const phases = new Set();
    for (let i = 0; i < 95; i++) { scene.step(); phases.add(trigger.phase); }
    assert.deepEqual([...phases], [0, 1, 2]);
    assert.equal(scene.scrollMode, 1); assert.equal(scene.findActor('Key').carrier, scene.players[0]);
  } finally { scene.rigidWorld.dispose(); }
});

const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const playerCount of [2, 8]) test(`original jump05 assembles with native Wind and scrolling trigger for ${playerCount} players`, () => {
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: stages.find(stage => stage.name === 'stage_jump05'),
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true);
    assert.equal(scene.players.length, playerCount);
    assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
    assert.ok(scene.findActor('Wind')); assert.ok(scene.findActor('ScrollLimitRange'));
    for (let i = 0; i < 30; i++) scene.step();
    assert.ok(scene.players.every(p => p.health === 1));
  } finally { scene.rigidWorld.dispose(); }
});
