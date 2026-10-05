import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeGhostActor } from './native-ghost-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function ghost() {
  const actor = createNativeGhostActor({ spawn: row('Ghost', 400, 650, .5, 0, 2, 100) });
  actor.scene = { players: Array.from({ length: 4 }, (_, i) => ({ controllerKind: 2,
    position: { x: 100 + i * 20, y: 600 }, scale: { x: 1, y: 1 } })),
    actorManager: { flags: 0 }, findActor: () => null };
  return actor;
}

test('Ghost starts only when unwatched and stops at truncated active-player threshold', () => {
  const actor = ghost(); actor.beforeMotion(); assert.equal(actor.ghostFlags & 1, 0);
  actor.scene.players.forEach(p => p.scale.x = -1); actor.beforeMotion();
  assert.equal(actor.ghostFlags & 1, 1); assert.deepEqual(actor.velocity, { x: -2, y: 0 });
  actor.scene.players[0].scale.x = 1; actor.beforeMotion();
  assert.equal(actor.ghostFlags & 1, 1); assert.equal(actor.spriteUV.x, .515625);
  actor.scene.players[1].scale.x = 1; actor.beforeMotion();
  assert.equal(actor.ghostFlags & 1, 0); assert.equal(actor.velocity.x, 0);
  actor.scene.players[1].scale.x = -1; actor.beforeMotion();
  assert.equal(actor.ghostFlags & 1, 0, 'one watcher prevents restarting');
  actor.scene.players[0].controllerKind = 3; actor.beforeMotion();
  assert.equal(actor.ghostFlags & 1, 1, 'dying players are excluded');
});

test('nearby free key overrides nearest Player, carried key disables only the pickup sensor', () => {
  const actor = ghost(); actor.scene.players.forEach(p => p.scale.x = -1);
  const key = { isNativeKey: true, position: { x: 450, y: 600 }, carrier: null };
  actor.scene.findActor = () => key;
  actor.beforeMotion(); assert.deepEqual(actor.velocity, { x: 2, y: 0 });
  key.position.x = 500; actor.beforeMotion(); assert.equal(actor.velocity.x, -2, 'range is strict');
  key.carrier = actor; actor.beforeMotion();
  assert.equal(actor.body.flags & 1, 0); assert.equal(actor.damageBody.flags & 1, 1);
});

test('frozen flag retains prior velocity; goal-release command fades per frame then removes', () => {
  const actor = ghost(); actor.velocity.x = 3; actor.ghostFlags = 8;
  actor.beforeMotion(); assert.equal(actor.velocity.x, 3);
  actor.ghostFlags = 0; actor.onCommand(9); assert.equal(actor.ghostFlags, 2);
  actor.onCommand(0x18); actor.beforeMotion();
  assert.equal(actor.opacity, Math.fround(1 - Math.fround(.1)));
  assert.equal(actor.spriteColor >>> 24, 229); assert.equal(actor.velocity.x, 0);
  for (let i = 0; i < 10; i++) actor.beforeMotion();
  assert.equal(actor.flags & 0x20, 0x20);
});

test('floating is render-only and pauses during actor-manager replay', () => {
  const actor = ghost(), position = { ...actor.position };
  actor.afterMotion(.25); assert.deepEqual(actor.position, position);
  assert.equal(actor.renderOffset.y, Math.fround(Math.fround(Math.sin(.5)) * 8));
  actor.scene.actorManager.flags = 8; actor.afterMotion(.25); assert.equal(actor.bobSeconds, .25);
});

test('actual Player contact with Ghost enters native death while Ghost remains a camera anchor', () => {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 400, 620), row('Ghost', 400, 680, .5)],
      map: { width: 40, height: 24, chipSize: 32, table: Array(960).fill(1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: s => sounds.push(s), stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true); for (let i = 0; i < 10; i++) scene.step();
    assert.equal(scene.players[0].health, 0); assert.equal(scene.players[0].controllerKind, 3);
    assert.ok(sounds.includes('hit')); assert.equal(scene.cameraAnchor, scene.findActor('Ghost'));
  } finally { scene.rigidWorld.dispose(); }
});

const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const playerCount of [2, 8]) test(`original ghost01 assembles and simulates for ${playerCount} players`, () => {
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: stages.find(s => s.name === 'stage_ghost01'),
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true); assert.equal(scene.players.length, playerCount);
    assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
    for (let i = 0; i < 30; i++) scene.step();
    assert.ok(scene.findActor('Ghost')); assert.ok(scene.findActor('Key'));
    assert.ok(scene.players.every(p => p.health === 1));
  } finally { scene.rigidWorld.dispose(); }
});
