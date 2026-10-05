import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeSwitchActor } from './native-switch-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: actorName === 'Switch' ? 'Bridge' : '',
  x, y, raw: [0, 0, actorName, actorName === 'Switch' ? 'Bridge' : '', x, y, ...params] });
function fixture(momentary = 0) {
  const actor = createNativeSwitchActor({ spawn: row('Switch', 100, 200, momentary, 7, 'Other') });
  const commands = [], sounds = [], received = [];
  actor.scene = { sendCommand: (...args) => commands.push(args), playSound: sound => sounds.push(sound) };
  const other = { type: 3, category: 1, actor: { onCommand: (...args) => received.push(args) } };
  return { actor, commands, sounds, other, received };
}

test('Switch overlap latches immediately but publishes both targets and sound in the next PRE', () => {
  const { actor, commands, sounds, other } = fixture();
  assert.equal(actor.body.circleRadius, 12); assert.equal(actor.body.category, 5);
  assert.equal(actor.body.type, 0); assert.equal(actor.spriteFlags, 0x18);
  actor.body.onOverlap(other);
  assert.equal(actor.readPressedState(), 1); assert.deepEqual(commands, []);
  assert.deepEqual(other.actor.renderOffset, { x: 0, y: -3 });
  actor.beforeMotion();
  assert.deepEqual(commands, [['Bridge', 9, 7], ['Other', 9, 7]]);
  assert.deepEqual(sounds, ['switch']); assert.equal(actor.spriteUV.x, .171875);
  actor.beforeMotion();
  assert.equal(commands.length, 2, 'ordinary switch stays latched after contact ends');
});

test('momentary Switch releases one frame after contacts cease and suppresses repeated press events', () => {
  const { actor, commands, other } = fixture(1);
  actor.body.onOverlap(other); actor.beforeMotion();
  actor.body.onOverlap(other); actor.beforeMotion();
  assert.equal(commands.length, 2);
  actor.beforeMotion();
  assert.deepEqual(commands.slice(2), [['Bridge', 10, 7], ['Other', 10, 7]]);
  assert.equal(actor.spriteUV.x, .15625);
});

test('Switch accepts only physical categories1..3 and applies reset cooldown bounce until contact ends', () => {
  const { actor, commands, other, received } = fixture();
  for (const category of [0, 4, 5, 8]) actor.body.onOverlap({ ...other, category });
  actor.body.onOverlap({ ...other, type: 0 });
  assert.equal(actor.readPressedState(), 0);
  actor.body.onOverlap(other); actor.beforeMotion();
  actor.onCommand(0x14); actor.beforeMotion();
  assert.deepEqual(commands.slice(2), [['Bridge', 10, 7], ['Other', 10, 7]]);
  actor.body.onOverlap(other);
  assert.deepEqual(received, [[0, { x: -3, y: -7 }]]);
  assert.equal(actor.readPressedState(), 0);
  actor.beforeMotion(); actor.beforeMotion();
  actor.body.onOverlap(other);
  assert.equal(actor.readPressedState(), 1);
});

test('replica overlap only adjusts presentation; replicated pressed-state changes do not send commands', () => {
  const { actor, commands, sounds, other } = fixture();
  actor.replication = {}; actor.scene.networkMode = 1;
  actor.body.onOverlap(other);
  assert.equal(actor.readPressedState(), 0);
  assert.deepEqual(other.actor.renderOffset, { x: 0, y: -3 });
  actor.applyPressedState(1); actor.applyPressedState(1);
  assert.equal(actor.spriteUV.x, .171875); assert.deepEqual(sounds, ['switch']);
  actor.beforeMotion();
  assert.deepEqual(commands, []);
  actor.applyPressedState(0);
  assert.equal(actor.spriteUV.x, .15625);
});

test('Switch rearm flag emits release on overlap and optional input lock only on the new press', () => {
  const { actor, commands, other, received } = fixture();
  actor.switchFlags |= 0x84;
  actor.body.onOverlap(other); actor.beforeMotion();
  actor.body.onOverlap(other);
  assert.deepEqual(commands, [['Bridge', 9, 7], ['Other', 9, 7], ['Bridge', 10, 7], ['Other', 10, 7]]);
  assert.deepEqual(received, [[0x1a], [0x1a]]);
  actor.body.onOverlap(other);
  assert.equal(received.length, 2);
});

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
test('native Player reaches circular switch through input and activates the named target once', () => {
  const held = new Set([6]), activations = [];
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 100, 672, 0), row('Switch', 200, 674)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.addActor({ name: 'Bridge', flags: 0, onCommand: (...args) => activations.push(args) });
    scene.setActive(true);
    for (let i = 0; i < 75; i++) scene.step();
    assert.deepEqual(activations, [[9, 0]]);
    assert.equal(scene.findActor('SwitchBridge').readPressedState(), 1);
    assert.ok(scene.players[0].position.x > 250);
  } finally { scene.rigidWorld.dispose(); }
});
