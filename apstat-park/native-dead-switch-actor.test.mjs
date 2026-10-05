import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeDeadSwitchActor } from './native-dead-switch-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });

test('death switch publishes and plays ordinary switch sound before its death action, once per press', () => {
  const actor = createNativeDeadSwitchActor({ spawn: row('DeadSwitch', 100, 200) }), events = [];
  actor.scene = { networkMode: 2, sendCommand: (...args) => events.push(args),
    playSound: name => events.push(name), stopNativeMusic: () => events.push('stop music'),
    sendNativeDeathPacket: packet => events.push(packet) };
  actor.networkOwner = true;
  actor.body.onOverlap({ type: 3, category: 1, actor: { renderOffset: {} } });
  assert.deepEqual(events, [], 'overlap latches; PRE publishes');
  actor.beforeMotion();
  assert.deepEqual(events, [['', 9, 0], 'switch', 'stop music', 'hit', [null, 3, null],
    { transport: 'host', target: 0xff, channel: 1, kind: 2, command: 0, value: 0 }]);
  actor.beforeMotion(); assert.equal(events.length, 6);
  actor.onCommand(0x14); actor.beforeMotion();
  assert.deepEqual(events.at(-1), ['', 10, 0]);
  assert.equal(events.filter(event => event === 'hit').length, 1);
});

test('replicated press snapshots do not directly fire death, but the following PRE transition does', () => {
  const actor = createNativeDeadSwitchActor({ spawn: row('DeadSwitch', 100, 200) }), events = [];
  actor.scene = { networkMode: 1, sendCommand: (...args) => events.push(args), playSound: sound => events.push(sound) };
  actor.replication = {};
  actor.applyPressedState(1); assert.deepEqual(events, ['switch']);
  actor.beforeMotion();
  assert.deepEqual(events, ['switch', 'switch', 'hit', [null, 3, null]]);
  actor.beforeMotion(); assert.equal(events.length, 4);
});

test('actual contact kills every player, including distant teammates', () => {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 2, createRigidWorld,
    stage: { createTable: [{ ...row('Player', 200, 670), label: '1' },
      { ...row('Player', 800, 670), label: '2' }, row('DeadSwitch', 200, 650)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: name => sounds.push(name),
    stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true);
    assert.equal(scene.players.length, 2);
    for (let i = 0; i < 8; i++) scene.step();
    assert.ok(scene.players.every(player => player.health === 0));
    assert.ok(scene.players.every(player => player.controllerKind === 3));
    assert.equal(scene.nativeMusicStopped, true);
    assert.ok(sounds.includes('hit'));
  } finally { scene.rigidWorld.dispose(); }
});

const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const count of [2, 8]) test(`original jump06 initializes for ${count} players`, () => {
  const scene = createNativeGameScene({ playerCount: count, createRigidWorld,
    stage: stages.find(stage => stage.name === 'stage_jump06'),
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true); assert.equal(scene.players.length, count);
    assert.equal(scene.creationSchedule.state.cursor, scene.creationSchedule.state.entries.length);
    for (let i = 0; i < 30; i++) scene.step();
    assert.ok(scene.findActor('DeadSwitch1')); assert.ok(scene.players.every(player => player.health === 1));
  } finally { scene.rigidWorld.dispose(); }
});
