import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeStepEnemyActor } from './native-step-enemy-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const enemy = (...params) => createNativeStepEnemyActor({ spawn: row('StepEnemy', 400, 650, ...params) });

test('StepEnemy retains native centered body, Lua integer direction and sprite walk data', () => {
  const actor = enemy(-1, 1);
  assert.deepEqual(actor.direction, { x: -1, y: 0 }); assert.equal(actor.replicationMode, 0);
  assert.deepEqual(actor.body.rawBounds, { x: -24, y: -13, width: 48, height: 26 });
  assert.equal(actor.body.category, 7); assert.equal(actor.body.type, 3);
  assert.equal(actor.spriteScale.x, -1); assert.equal(enemy(-.9).direction.x, 1);
  assert.deepEqual(actor.spriteAction.keys.map(k => k.frame), [0, 12, 24]);
});

test('movement is per-frame and notifies components before and after native gravity or floor reset', () => {
  const actor = enemy(-1), velocities = [];
  actor.components.push({ consumeVelocity: v => velocities.push({ ...v }) });
  actor.beforeMotion(0);
  assert.deepEqual(velocities, [{ x: -1, y: 0 }, { x: -1, y: Math.fround(.65) }]);
  actor.body.mapContacts.push({ x: 0, y: 1 }); actor.beforeMotion(100);
  assert.deepEqual(actor.velocity, { x: -1, y: 0 });
});

test('BEGIN map and side contacts reverse heading while top contacts bounce any actor', () => {
  const actor = enemy(), commands = [];
  const recipient = { velocity: { x: -3, y: 0 }, canReceiveDamage: () => true,
    onCommand: (...args) => commands.push(args) };
  actor.beforeMotion();
  actor.body.onContactBegin(null, { x: 1, y: 0 }, 0);
  assert.equal(actor.direction.x, -1); assert.equal(actor.spriteScale.x, -1);
  assert.equal(actor.velocity.x, 1, 'turn affects next PRE, not current velocity');
  actor.body.onContactBegin({ category: 1, actor: recipient }, { x: -1, y: 0 }, 1);
  assert.equal(actor.direction.x, 1); assert.deepEqual(commands, [[4, null]]);
  recipient.velocity.x = 3;
  actor.body.onContactBegin({ category: 1, actor: recipient }, { x: 1, y: 0 }, 1);
  assert.equal(actor.direction.x, 1, 'same-direction movement does not turn');
  recipient.canReceiveDamage = () => false;
  actor.body.onContactBegin({ category: 1, actor: recipient }, { x: 1, y: 0 }, 1);
  assert.equal(commands.length, 2);
  actor.body.onContactBegin({ category: 2, actor: recipient }, { x: 0, y: -1 }, 1);
  assert.deepEqual(commands.at(-1), [0, null]);
  actor.body.onContactBegin({ category: 1, actor: recipient }, { x: 0, y: 1 }, 1);
  assert.equal(commands.length, 3); assert.equal(actor.body.onContactStay, undefined);
});

function sceneFixture(playerPosition, left = false, wall = false) {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('StepEnemy', 450, 650, left ? -1 : 1), ...(playerPosition ? [row('Player', ...playerPosition)] : [])],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 || (wall && i % 40 === 18) ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: sound => sounds.push(sound),
    stageRetryEligible: () => true,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, sounds };
}

test('native body pass turns StepEnemy at a tile wall and it walks back along the floor', () => {
  const { scene } = sceneFixture(null, false, true);
  try {
    scene.setActive(true);
    const actor = scene.findActor('StepEnemy');
    for (let i = 0; i < 160; i++) scene.step();
    assert.equal(actor.direction.x, -1); assert.ok(actor.position.x < 520);
    assert.ok(Math.abs(actor.position.y - 658.99) < .02);
  } finally { scene.rigidWorld.dispose(); }
});

test('native Player landing on StepEnemy bounces without damage or removing the enemy', () => {
  const { scene, sounds } = sceneFixture([470, 580]);
  try {
    scene.setActive(true);
    let bounced = false;
    for (let i = 0; i < 35; i++) { scene.step(); if (scene.players[0].velocity.y < -4) bounced = true; }
    assert.ok(bounced); assert.equal(scene.players[0].health, 1);
    assert.ok(sounds.includes('jump')); assert.ok(!sounds.includes('hit'));
    assert.equal(scene.findActor('StepEnemy').body.flags & 1, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('native StepEnemy side contact damages Player and enters its original death controller', () => {
  const { scene, sounds } = sceneFixture([370, 670], true);
  try {
    scene.setActive(true);
    for (let i = 0; i < 70; i++) scene.step();
    assert.equal(scene.players[0].health, 0); assert.equal(scene.players[0].controllerKind, 3);
    assert.ok(sounds.includes('hit')); assert.equal(scene.flags & 0x80, 0x80);
    assert.equal(scene.findActor('StepEnemy').direction.x, 1);
  } finally { scene.rigidWorld.dispose(); }
});
