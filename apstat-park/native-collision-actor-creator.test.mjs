import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeCollisionActorCreator } from './native-collision-actor-creator.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function creator(target = 'Rect', silent = false) {
  const actor = createNativeCollisionActorCreator({ spawn: row(silent ? 'CollisionActorCreatorSilent' : 'CollisionActorCreator',
    200, 580, 32.5, 96, target, 400.1, 672, 80, 40) });
  const spawned = [], sounds = [];
  actor.scene = { networkMode: 0, spawnDynamicActor: spawn => spawned.push(structuredClone(spawn)),
    playSound: sound => sounds.push(sound) };
  return { actor, spawned, sounds };
}

test('creator translates parameters to an absolute child descriptor and fires once on player overlap', () => {
  const { actor, spawned, sounds } = creator();
  assert.deepEqual(actor.body.rawBounds, { x: 0, y: 0, width: 32.5, height: 96 });
  assert.equal(actor.body.type, 0); assert.equal(actor.body.category, 4);
  assert.equal(actor.networkType, 0x27); assert.equal(actor.replicationMode, 0);
  actor.body.onOverlap({ category: 2 }); assert.equal(spawned.length, 0);
  actor.body.onOverlap({ category: 1 }); actor.body.onOverlap({ category: 1 });
  assert.equal(spawned.length, 1); assert.equal(actor.readCreatorState(), 1);
  assert.deepEqual(spawned[0].raw, [0, 0, 'Rect', '', Math.fround(400.1), 672, 80, 40]);
  assert.deepEqual(sounds, ['generate']);
});

test('silent creator has identical replication edge behavior without sound', () => {
  const { actor, spawned, sounds } = creator('Rect', true);
  actor.replication = {}; actor.scene.networkMode = 1;
  actor.body.onOverlap({ category: 1 }); assert.equal(actor.triggered, 0);
  actor.applyCreatorState(1); actor.applyCreatorState(2); actor.applyCreatorState(2);
  assert.equal(spawned.length, 1); assert.equal(actor.triggered, 2);
  actor.applyCreatorState(0); actor.applyCreatorState(-1);
  assert.equal(spawned.length, 2); assert.deepEqual(sounds, []);
});

test('replica Key and Goal triggers play their sound but leave creation to authority', () => {
  for (const target of ['Key', 'Goal']) {
    const local = creator(target); local.actor.body.onOverlap({ category: 1 });
    assert.equal(local.spawned[0].forceReplication, true);
    const replica = creator(target); replica.actor.replication = {}; replica.actor.scene.networkMode = 1;
    replica.actor.applyCreatorState(1);
    assert.equal(replica.spawned.length, 0); assert.deepEqual(replica.sounds, ['generate']);
    assert.equal(replica.actor.triggered, 1);
  }
});

test('creator preserves float/string child parameters and coerces unsupported Lua values to numeric zero', () => {
  const actor = createNativeCollisionActorCreator({ spawn: row('CollisionActorCreator', 0, 0,
    1, 2, 'Rect', 10, 20, .1, 'x'.repeat(70), true, null) });
  assert.deepEqual(actor.childSpawn.raw.slice(6), [Math.fround(.1), 'x'.repeat(63), 0, 0]);
});

function fixture(target = 'Rect', enabled = true) {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 100, 640),
      row('CollisionActorCreator', 150, 580, 32, 96, target, 400, 672, 96, 40)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => action === 6, pressed: () => false },
    playSound: sound => sounds.push(sound), stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  if (!enabled) scene.scrollFlags &= ~0x100;
  return { scene, sounds };
}

test('actual Player contact constructs a native Rect body through the scene factory exactly once', () => {
  const { scene, sounds } = fixture();
  try {
    scene.setActive(true); assert.equal(scene.findActor('Rect'), null);
    const initialBodies = scene.bodyWorld.bodies.length;
    for (let i = 0; i < 35; i++) scene.step();
    const rect = scene.findActor('Rect');
    assert.ok(rect); assert.deepEqual(rect.position, { x: 400, y: 672 });
    assert.deepEqual(rect.body.rawBounds, { x: 0, y: -40, width: 96, height: 40 });
    assert.equal(rect.body.flags & 1, 1); assert.equal(scene.bodyWorld.bodies.length, initialBodies + 1);
    assert.deepEqual(sounds, ['generate']);
  } finally { scene.rigidWorld.dispose(); }
});

test('scene creation gate prevents child creation while the trigger still latches and sounds', () => {
  const { scene, sounds } = fixture('Rect', false);
  try {
    scene.setActive(true); for (let i = 0; i < 35; i++) scene.step();
    assert.equal(scene.findActor('Rect'), null);
    assert.equal(scene.findActor('CollisionActorCreator').triggered, 1);
    assert.deepEqual(sounds, ['generate']);
  } finally { scene.rigidWorld.dispose(); }
});

const originalStages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const name of ['stage_darkness01', 'stage_darkness02']) for (const playerCount of [2, 8]) {
  test(`original ${name} assembles native actors for a ${playerCount}-person party`, () => {
    const scene = createNativeGameScene({ playerCount, createRigidWorld, randomInclusive: () => 0,
      stage: originalStages.find(stage => stage.name === name),
      playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
      spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
        playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
    try {
      scene.setActive(true);
      assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
      assert.ok(scene.players.length > 0);
      assert.ok(scene.findActor('CollisionActorCreator'));
      assert.ok(scene.findActor('CollisionActorCreatorSilent'));
      for (let i = 0; i < 30; i++) scene.step();
      assert.ok(scene.players.every(p => p.health === 1 && Number.isFinite(p.position.y)));
    } finally { scene.rigidWorld.dispose(); }
  });
}
