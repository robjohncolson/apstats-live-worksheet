import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeUpDownEnemyActor } from './native-up-down-enemy-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const enemy = (...params) => createNativeUpDownEnemyActor({ spawn: row('UpDownEnemy', 400, 620, ...params) });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });

test('UpDownEnemy has native sensor bounds, look animation and integer replication option', () => {
  const actor = enemy(1);
  assert.deepEqual(actor.body.rawBounds, { x: -28, y: -22, width: 56, height: 48 });
  assert.equal(actor.body.type, 0); assert.equal(actor.body.category, 7);
  assert.equal(actor.replicationMode, 0); assert.equal(enemy(.9).replicationMode, 1);
  assert.equal(actor.networkType, 0x1f);
  assert.deepEqual(actor.spriteAction.keys.map(k => k.frame), [0, 192, 240, 288]);
});

test('four-phase cycle checks previous elapsed time and preserves movement overshoot until next PRE', () => {
  const actor = enemy();
  actor.beforeMotion(2); assert.equal(actor.phase, 0); assert.equal(actor.phaseSeconds, 2);
  actor.beforeMotion(.25); assert.equal(actor.phase, 1); assert.equal(actor.phaseSeconds, 0);
  actor.beforeMotion(1.25); assert.equal(actor.position.y, 595);
  actor.beforeMotion(1.5); assert.equal(actor.position.y, 565); assert.equal(actor.phase, 1);
  actor.beforeMotion(.1); assert.equal(actor.position.y, 570); assert.equal(actor.phase, 2);
  actor.beforeMotion(2); assert.equal(actor.phase, 2);
  actor.beforeMotion(.1); assert.equal(actor.phase, 3); assert.equal(actor.phaseSeconds, 0);
  actor.beforeMotion(1.25); assert.equal(actor.position.y, 595);
  actor.beforeMotion(1.5); assert.equal(actor.position.y, 625);
  actor.beforeMotion(.1); assert.equal(actor.position.y, 620); assert.equal(actor.phase, 0);
  assert.deepEqual(actor.velocity, { x: 0, y: 0 });
});

test('received snapshot keeps phase timing and position until next spawn-relative motion', () => {
  const actor = enemy();
  actor.applyEnemyState({ x: 800, y: 900, phase: 1, phaseSeconds: .3, verticalOffset: -6 });
  assert.deepEqual(actor.readEnemyState(), { x: 800, y: 900, phase: 1, phaseSeconds: f(.3), verticalOffset: -6 });
  actor.beforeMotion(.1);
  assert.equal(actor.position.x, 400);
  assert.equal(actor.position.y, f(620 + f(f(f(f(.3) + f(.1)) / 2.5) * -50)));
  assert.deepEqual(actor.spawnPosition, { x: 400, y: 620 });
});

test('continuous overlap damages only authoritative category1 recipients with a null command4 payload', () => {
  const actor = enemy(), commands = [];
  const recipient = { canReceiveDamage: () => true, onCommand: (...args) => commands.push(args) };
  actor.body.onOverlap({ category: 2, actor: recipient });
  actor.body.onOverlap({ category: 1, actor: null });
  actor.body.onOverlap({ category: 1, actor: recipient });
  actor.body.onOverlap({ category: 1, actor: recipient });
  recipient.canReceiveDamage = () => false;
  actor.body.onOverlap({ category: 1, actor: recipient });
  assert.deepEqual(commands, [[4, null], [4, null]]);
});

function fixture(player = false) {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('UpDownEnemy', 400, 620), ...(player ? [row('Player', 400, 600)] : [])],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: sound => sounds.push(sound),
    stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, sounds };
}

test('actual Player overlapping UpDownEnemy dies rather than bouncing or standing on its body', () => {
  const { scene, sounds } = fixture(true);
  try {
    scene.setActive(true);
    for (let i = 0; i < 15; i++) scene.step();
    assert.equal(scene.players[0].health, 0); assert.equal(scene.players[0].controllerKind, 3);
    assert.equal(sounds.filter(s => s === 'hit').length, 1); assert.ok(!sounds.includes('jump'));
    assert.equal(scene.flags & 0x80, 0x80);
  } finally { scene.rigidWorld.dispose(); }
});

test('assembled enemy updates its sensor through a complete rise/wait/descent cycle', () => {
  const { scene } = fixture();
  try {
    scene.setActive(true); const actor = scene.findActor('UpDownEnemy');
    const phases = new Set(); let top = Infinity;
    for (let i = 0; i < 560; i++) {
      scene.step(); phases.add(actor.phase); top = Math.min(top, actor.position.y);
      assert.deepEqual(actor.body.position, actor.position);
    }
    assert.deepEqual([...phases], [0, 1, 2, 3]);
    assert.ok(top <= 570 && top > 569); assert.equal(actor.phase, 0);
    assert.equal(actor.position.y, 620);
  } finally { scene.rigidWorld.dispose(); }
});
