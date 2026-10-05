import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeWeightedLiftActor } from './native-weighted-lift-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { attachNativeBody } from './native-body-registry.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
const f = Math.fround;
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(rows, originalStage = null, playerCount = 2) {
  const held = new Set();
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: originalStage ?? { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    notifyPlayerRelocation() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, held };
}

test('WeightedLift decodes original party-dependent travel, thresholds and return speed', () => {
  const spawn = stages.find(s => s.name === 'stage_jump01').createTable.find(r => r.actorName === 'WeightedLift');
  const lift = createNativeWeightedLiftActor({ spawn, partySize: 8 });
  assert.equal(lift.maximumOffset, -216); assert.equal(lift.requiredLoad, 8);
  assert.equal(lift.returnSpeed, f(1 + f(f(-.1) * 6)));
  assert.deepEqual(lift.body.rawBounds, { x: -92, y: 67, width: 194, height: 18 });
  assert.equal(lift.body.category, 5); assert.equal(lift.body.flags & 3, 3);
  const base = createNativeWeightedLiftActor({ spawn: row('WeightedLift', 0, 0), partySize: 8 });
  assert.equal(base.requiredLoad, 2); assert.equal(base.maximumOffset, -70);
  const fixed = createNativeWeightedLiftActor({ spawn: row('WeightedLift', 0, 0, 154, 100, 0, 5, 1), partySize: 2 });
  assert.equal(fixed.requiredLoad, 5); assert.equal(fixed.returnsWhenEmpty, false);
});

test('extended lifts use party-indexed integer offsets and Ex2 has a narrow physical platform', () => {
  const spawn = stages.find(s => s.name === 'stage_weight02').createTable.find(r => r.actorName === 'WeightedLiftEx');
  const lift = createNativeWeightedLiftActor({ spawn, partySize: 8 });
  assert.equal(lift.maximumOffset, -212, 'native integer conversion truncates -82.5 party entry');
  assert.equal(lift.loadSpeed, .5); assert.equal(lift.returnSpeed, .5);
  const narrow = createNativeWeightedLiftActor({ spawn: row('WeightedLiftEx2', 0, 0, -192, 100, .5, 0, 48, 96), partySize: 3 });
  assert.equal(narrow.maximumOffset, -144);
  assert.deepEqual(narrow.body.rawBounds, { x: -28, y: 67, width: 56, height: 18 });
});

test('connected players and blocks load the lift; a rider ceiling blocks the complete displacement', () => {
  const { scene } = fixture([row('WeightedLift', 500, 500, -40, 100)]);
  try {
    scene.setActive(true);
    const lift = scene.findActor('WeightedLift');
    function rider(category, y) {
      const actor = { bodies: [], velocity: { x: 0, y: 0 } };
      const body = createNativeActorRectangle(actor, { x: -10, y: -20, width: 20, height: 20 }, 2, true);
      body.category = category; attachNativeBody(scene.bodyWorld, body);
      placeNativeActorBodies(actor, { x: 500, y }); return body;
    }
    const lower = rider(1, 565), upper = rider(2, 545);
    lift.body.contacts.push({ bodyId: lower.id, normal: { x: 0, y: -1 } });
    lower.contacts.push({ bodyId: upper.id, normal: { x: 0, y: -1 } });
    upper.mapContacts.push({ x: 0, y: -1 });
    lift.beforeMotion(1 / 60);
    assert.equal(lift.supportCount, 2); assert.equal(lift.offset.y, 0);
    upper.mapContacts.length = 0;
    lift.beforeMotion(1 / 60);
    assert.equal(lift.offset.y, -1); assert.equal(lower.actor.position.y, 564); assert.equal(upper.actor.position.y, 544);
    lift.body.contacts.length = 0;
    lift.beforeMotion(1 / 60);
    assert.equal(lift.offset.y, -0);
  } finally { scene.rigidWorld.dispose(); }
});

test('DOWN contact refreshes cooldown and return resumes only after its native timer elapses', () => {
  const { scene } = fixture([row('WeightedLift', 500, 500, -40, 100)]);
  try {
    scene.setActive(true);
    const lift = scene.findActor('WeightedLift');
    lift.offset.y = -10; lift.position.y = 490;
    lift.body.mapContacts.push({ x: 0, y: 1 });
    lift.beforeMotion(.5);
    assert.equal(lift.groundCooldown, f(.06)); assert.equal(lift.offset.y, -10);
    lift.body.mapContacts.length = 0;
    for (let i = 0; i < 3; i++) lift.beforeMotion(1 / 60);
    assert.equal(lift.offset.y, -10);
    lift.beforeMotion(1 / 60);
    assert.equal(lift.offset.y, -9);
  } finally { scene.rigidWorld.dispose(); }
});

test('two actual Players land on WeightedLift and ride it to the configured height', () => {
  const { scene } = fixture([row('WeightedLift', 500, 500, -40, 100), row('Player', 450, 520, 0), row('Player', 500, 520, 0)]);
  try {
    scene.setActive(true);
    for (let i = 0; i < 120; i++) scene.step();
    const lift = scene.findActor('WeightedLift');
    assert.equal(lift.supportCount, 2); assert.equal(lift.offset.y, -40);
    assert.equal(lift.position.y, 460);
    assert.ok(scene.players.every(p => Math.abs(p.position.y - 527.99) < .02));
    assert.equal(lift.counterPresentation().text, '0');
  } finally { scene.rigidWorld.dispose(); }
});

for (const playerCount of [2, 8]) test(`original stage_jump01 assembles all actor families with ${playerCount} players`, () => {
  const { scene, held } = fixture(null, stages.find(s => s.name === 'stage_jump01'), playerCount);
  try {
    scene.setActive(true);
    assert.equal(scene.players.length, playerCount);
    assert.equal(scene.findActor('Bridge').segments.length, 20);
    assert.ok(scene.findActor('WeightedLift'));
    assert.ok(scene.findActor('SwitchBridge'));
    held.add(6);
    for (let i = 0; i < 120; i++) scene.step();
    assert.ok(scene.players.every(p => Number.isFinite(p.position.x) && Number.isFinite(p.position.y)));
    assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
  } finally { scene.rigidWorld.dispose(); }
});
