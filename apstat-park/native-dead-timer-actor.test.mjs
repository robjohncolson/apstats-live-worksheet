import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeDeadTimerActor } from './native-dead-timer-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function timer(seconds = 10, perPlayer = 0, partySize = 2) {
  const actor = createNativeDeadTimerActor({ spawn: row('DeadTimer', 426.6666667, 60, seconds, perPlayer), partySize });
  const sounds = [], commands = [], packets = [];
  actor.scene = { networkMode: 0, frame: 0n, highestFrame: 0n, viewScale: 1,
    viewPosition: { x: 1000, y: 1000 }, viewOffset: { x: 10, y: 10 },
    playSound: sound => sounds.push(sound), sendCommand: (...args) => commands.push(args),
    sendNativeTimerPacket: packet => packets.push(packet) };
  return { actor, sounds, commands, packets };
}

test('DeadTimer uses party-adjusted float time and screen-fixed rounded-up minute display', () => {
  const { actor } = timer(69, -2, 2);
  assert.equal(actor.seconds, 65); assert.equal(actor.resetValue, 0);
  assert.equal(actor.cameraRelative, false); assert.equal(actor.bodies.length, 0);
  assert.deepEqual(actor.readTimerDisplay(), { text: '01:05', x: 426, y: 60, fontSize: 32,
    horizontalAlignment: 2, verticalAlignment: 2, timeUp: null });
  actor.beforeMotion(.1); assert.equal(actor.readTimerDisplay().text, '01:05');
  assert.equal(timer(10, -2, 8).actor.seconds, 0);
  assert.equal(timer(.3, .1, 3).actor.seconds, f(f(.3) + f(f(3) * f(.1))));
});

test('null pauses; zero adds rounded time; bonuses are unsigned and expired timers reject them', () => {
  const { actor } = timer(2.1);
  actor.onCommand(9, null); actor.beforeMotion(1); assert.equal(actor.seconds, f(2.1));
  actor.onCommand(9, 0); assert.equal(actor.seconds, 3); assert.equal(actor.bonusCount, 1);
  assert.equal(actor.timerFlags & 1, 1, 'adding time does not unpause');
  actor.onCommand(10); actor.beforeMotion(.25); assert.equal(actor.seconds, 2.75);
  actor.onCommand(9, 2); assert.equal(actor.seconds, 5); assert.equal(actor.fontSize, f(36.8));
  actor.afterMotion(0); assert.equal(actor.fontSize, f(f(36.8) * f(.98)), 'font decay is per frame');
  for (let i = 0; i < 20; i++) actor.afterMotion(0);
  assert.equal(actor.fontSize, 32);
  actor.onCommand(9, -1); assert.equal(actor.seconds, f(2 ** 32));
  assert.equal(actor.readTimerDisplay().text, '-35791394:-8', 'out-of-range native display conversion yields INT_MIN');
  actor.timerFlags |= 2; actor.onCommand(9, 10); assert.equal(actor.seconds, f(2 ** 32));
  actor.onCommand(9, null); assert.equal(actor.timerFlags & 1, 0);
});

test('raw maxss preserves received NaN, which cannot trigger timer expiry', () => {
  const { actor, commands } = timer();
  actor.applyTimerState({ seconds: NaN, flags: 0, bonusCount: 0 });
  actor.beforeMotion(1);
  assert.ok(Number.isNaN(actor.seconds)); assert.deepEqual(commands, []); assert.equal(actor.timerFlags, 0);
});

test('expiry broadcasts null damage once; reset preserves TIME UP and resets current time to constructor zero', () => {
  const { actor, sounds, commands } = timer(.5);
  actor.beforeMotion(1); actor.beforeMotion(1);
  assert.equal(actor.seconds, 0); assert.equal(actor.timerFlags, 6);
  assert.deepEqual(commands, [[null, 3, null]]); assert.deepEqual(sounds, ['blip']);
  actor.afterMotion(.25); actor.scene.viewScale = 2;
  assert.deepEqual(actor.readTimerDisplay().timeUp, { text: 'TIME UP', x: 80, y: 180 });
  actor.onCommand(0x14); assert.equal(actor.seconds, 0); assert.equal(actor.timerFlags, 4);
  assert.equal(actor.timeUpSeconds, .25);
  actor.beforeMotion(0); assert.equal(commands.length, 2);
});

test('countdown sounds follow offset integer boundaries and client replay suppression', () => {
  const { actor, sounds } = timer(11.1);
  actor.beforeMotion(1); assert.deepEqual(sounds, [], 'no sound at ten seconds or above');
  actor.beforeMotion(.2); assert.deepEqual(sounds, ['select']);
  actor.scene.networkMode = 1;
  actor.beforeMotion(1); assert.equal(sounds.length, 1, 'client without history is silent');
  actor.flags |= 8; actor.beforeMotion(1); assert.equal(sounds.length, 2);
  actor.scene.highestFrame = 1n; actor.beforeMotion(1); assert.equal(sounds.length, 2);
  actor.scene.frame = 1n; actor.flags &= ~8; actor.historyDelay = 1;
  actor.beforeMotion(1); assert.equal(sounds.length, 3);
  actor.replication = {}; actor.beforeMotion(1); assert.equal(sounds.length, 3);
});

test('client replica expires silently; host-owned expiry sends the original broadcast event fields', () => {
  const client = timer(.1); client.actor.scene.networkMode = 1; client.actor.replication = {};
  client.actor.beforeMotion(1);
  assert.equal(client.actor.timerFlags, 2); assert.deepEqual(client.commands, []); assert.deepEqual(client.sounds, []);
  const host = timer(.1); host.actor.scene.networkMode = 2; host.actor.networkOwner = { id: 3 };
  host.actor.beforeMotion(1); host.actor.beforeMotion(1);
  assert.deepEqual(host.packets, [{ transport: 'host', target: 0xff, channel: 1, kind: 2, command: 2, value: 0 }]);
});

test('snapshot fields truncate separately and received boundaries beep even above ten seconds', () => {
  const { actor, sounds } = timer();
  actor.timerFlags = 0x1234; actor.bonusCount = 0x10003;
  assert.deepEqual(actor.readTimerState(), { seconds: 10, flags: 0x34, bonusCount: 3 });
  actor.applyTimerState({ seconds: 60.2, flags: 0x10104, bonusCount: 0x10004 });
  assert.equal(actor.timerFlags, 0x104); assert.equal(actor.bonusCount, 4);
  assert.equal(actor.fontSize, 32, 'received count compared to full previous uint32');
  actor.applyTimerState({ seconds: 60.1, flags: 4, bonusCount: 5 });
  assert.equal(actor.fontSize, f(36.8)); assert.deepEqual(sounds, ['select']);
  actor.applyTimerState({ seconds: 59.9, flags: 4, bonusCount: 5 });
  assert.deepEqual(sounds, ['select', 'select']);
});

function sceneFixture(rows, playerCount = 2) {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: sound => sounds.push(sound),
    stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, sounds };
}

test('assembled countdown kills every actual Player through native death controller, without hit sound or respawn', () => {
  const secondPlayer = row('Player', 200, 640); secondPlayer.label = '2';
  const { scene, sounds } = sceneFixture([row('Player', 100, 640), secondPlayer, row('DeadTimer', 400, 60, .03)]);
  try {
    scene.setActive(true); assert.equal(scene.players.length, 2);
    for (let i = 0; i < 10; i++) scene.step();
    assert.ok(scene.players.every(p => p.health === 0 && p.controllerKind === 3));
    assert.ok(scene.players.every(p => !(p.playerFlags & 0x10)), 'null expiry payload must not set the zero-payload death flag');
    assert.equal(sounds.filter(s => s === 'blip').length, 1); assert.ok(!sounds.includes('hit'));
    for (let i = 0; i < 80; i++) scene.step();
    assert.ok(scene.players.every(p => p.health === 0));
  } finally { scene.rigidWorld.dispose(); }
});

test('actual Player presses a named Switch to add time once through scene command routing', () => {
  const trigger = row('Switch', 400, 664, 0, 3); trigger.label = 'DeadTimer';
  const { scene } = sceneFixture([row('Player', 400, 640), row('DeadTimer', 400, 60, 2.2), trigger], 1);
  try {
    scene.setActive(true);
    for (let i = 0; i < 20; i++) scene.step();
    const actor = scene.findActor('DeadTimer');
    assert.equal(actor.bonusCount, 1); assert.ok(actor.seconds > 5 && actor.seconds < 6);
    assert.equal(actor.timerFlags & 1, 0); assert.equal(scene.players[0].health, 1);
  } finally { scene.rigidWorld.dispose(); }
});
