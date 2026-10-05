import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeFallBoxActor } from './native-fall-box-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function box(width = 48, height = 48) {
  const actor = createNativeFallBoxActor({ spawn: row('FallBox', 400, 500, width, height) });
  actor.scene = { viewScale: 1, viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 } };
  return actor;
}

test('FallBox keeps float dimensions, bottom anchor, two-pixel inset and initially disabled body', () => {
  const actor = box(48.5, 30.25);
  assert.deepEqual(actor.spriteBounds, { x: -24.25, y: -30.25, width: 48.5, height: 30.25 });
  assert.deepEqual(actor.body.rawBounds, { x: -22.25, y: -28.25, width: 44.5, height: 26.25 });
  assert.equal(actor.body.flags & 1, 0); assert.equal(actor.body.type, 3); assert.equal(actor.body.category, 2);
  assert.equal(actor.managerPriority, 2); assert.equal(actor.paletteIndex, 9);
  actor.beforeMotion(0); assert.equal(actor.body.flags & 1, 1);
});

test('top STAY starts a persistent delay; crossing .22 seconds does not apply gravity until next PRE', () => {
  const actor = box(), velocities = [];
  actor.components.push({ consumeVelocity: v => velocities.push({ ...v }) });
  actor.body.onContactStay(null, { x: 1, y: 0 }); assert.equal(actor.fallFlags, 0);
  actor.body.onContactStay(null, { x: 0, y: -1 }); actor.beforeMotion(.22);
  assert.equal(actor.triggeredSeconds, f(.22)); assert.equal(actor.velocity.y, 0);
  actor.beforeMotion(.01); assert.equal(actor.velocity.y, 0);
  actor.beforeMotion(0); assert.equal(actor.velocity.y, f(.65));
  actor.body.mapContacts.push({ x: 0, y: 1 }); actor.beforeMotion(1);
  assert.equal(actor.velocity.y, 0); assert.equal(actor.fallFlags, 1);
  actor.body.mapContacts.length = 0; actor.beforeMotion(0);
  assert.equal(actor.velocity.y, f(.65)); assert.equal(velocities.length, 3);
});

test('horizontal culling toggles collision and patch with native one-pixel margins and camera scale', () => {
  const actor = box(); actor.position.x = -25;
  actor.beforeMotion(0); assert.equal(actor.body.flags & 1, 1, 'left margin is inclusive');
  actor.position.x = -25.01; actor.beforeMotion(0);
  assert.equal(actor.body.flags & 1, 0); assert.equal(actor.patchFlags & 8, 0);
  actor.position.x = 1305; actor.beforeMotion(0);
  assert.equal(actor.body.flags & 1, 0, 'right margin is exclusive');
  actor.scene.viewPosition.x = 1; actor.beforeMotion(0);
  assert.equal(actor.body.flags & 1, 1);
  actor.scene.viewScale = 2; actor.position.x = 666; actor.beforeMotion(0);
  assert.equal(actor.body.flags & 1, 0);
  actor.scene.viewOffset.x = 1; actor.beforeMotion(0); assert.equal(actor.body.flags & 1, 1);
});

test('triggered falling box is removed only below twice scaled screen height, ignoring cameraY', () => {
  const actor = box(); actor.fallFlags = 1; actor.triggeredSeconds = 1;
  actor.scene.viewScale = 2; actor.scene.viewPosition.y = 1000;
  actor.position.y = 720; actor.beforeMotion(0); assert.equal(actor.flags & 0x20, 0);
  actor.position.y = 720.01; actor.beforeMotion(0); assert.equal(actor.flags & 0x20, 0x20);
});

function sceneFixture(floor = true) {
  return createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('FallBox', 400, 500, 96, 32), row('Player', 400, 440)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => floor && i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
}

test('actual Player triggers FallBox, which falls and lands without resetting its trigger or spawn', () => {
  const scene = sceneFixture();
  try {
    scene.setActive(true); const actor = scene.findActor('FallBox');
    for (let i = 0; i < 100; i++) scene.step();
    assert.equal(actor.fallFlags, 1); assert.ok(actor.triggeredSeconds > f(.22));
    assert.ok(Math.abs(actor.position.y - 673.99) < .02); assert.equal(actor.spawnPosition.y, 500);
    assert.equal(actor.velocity.y, 0); assert.equal(scene.players[0].health, 1);
    assert.equal(actor.body.flags & 1, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('native scene retires an out-of-bounds falling box and detaches its body', () => {
  const scene = sceneFixture(false);
  try {
    scene.setActive(true); const actor = scene.findActor('FallBox');
    for (let i = 0; i < 100; i++) scene.step();
    assert.equal(actor.manager, null); assert.equal(scene.findActor('FallBox'), null);
    assert.ok(!scene.bodyWorld.bodies.includes(actor.body));
  } finally { scene.rigidWorld.dispose(); }
});

const originalStages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const name of ['stage_fall01', 'stage_fall02']) for (const playerCount of [2, 8]) {
  test(`original ${name} assembles all scheduled actors for ${playerCount} players`, () => {
    const scene = createNativeGameScene({ playerCount, createRigidWorld,
      stage: originalStages.find(stage => stage.name === name),
      playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
      spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
        playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
    try {
      scene.setActive(true);
      assert.equal(scene.players.length, playerCount);
      assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
      assert.ok(scene.creationSchedule.state.entries.some(e => e.created && e.spawn.actorName === 'FallBox'));
      assert.ok(scene.findActor('Key')); assert.ok(scene.findActor('Goal')); assert.ok(scene.findActor('Thunder'));
      for (let i = 0; i < 30; i++) scene.step();
      assert.ok(scene.players.every(p => p.health === 1 && Number.isFinite(p.position.y)));
    } finally { scene.rigidWorld.dispose(); }
  });
}
