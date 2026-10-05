import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyNativePlayerSlot, NATIVE_PLAYER_COLORS } from './native-player-slot.mjs';
import { createNativeCollisionChangePlayerActor } from './native-collision-change-player-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function sensor(party = 4, rearm = 0) {
  const actor = createNativeCollisionChangePlayerActor({ spawn: row('CollisionChangePlayer', 100, 200, 24.5, 96, rearm) });
  const sounds = [], packets = [];
  const scene = { flags: 0, networkMode: 0, playerCount: party,
    playerSlots: Array.from({ length: party }, (_, i) => i),
    playSound: sound => sounds.push(sound), sendNativeControlPacket: packet => packets.push(packet) };
  scene.players = [0, 1].map(playerIndex => ({ playerIndex, scene, carriedAttachments: [] }));
  actor.scene = scene;
  return { actor, scene, sounds, packets };
}

test('control sensor is a top-left float rectangle and rotates all characters by actual character count', () => {
  const { actor, scene, sounds } = sensor();
  assert.deepEqual(actor.body.rawBounds, { x: 0, y: 0, width: 24.5, height: 96 });
  assert.equal(actor.body.type, 0); assert.equal(actor.body.category, 4);
  actor.body.onOverlap({ category: 3 }); assert.equal(actor.triggered, false);
  actor.body.onOverlap({ category: 1 });
  assert.deepEqual(scene.players.map(p => p.playerIndex), [2, 3]);
  assert.deepEqual(scene.players.map(p => p.spriteColor), [NATIVE_PLAYER_COLORS[2], NATIVE_PLAYER_COLORS[3]]);
  for (let i = 0; i < 10; i++) { actor.beforeMotion(); actor.body.onOverlap({ category: 1 }); }
  assert.deepEqual(scene.players.map(p => p.playerIndex), [2, 3]); assert.deepEqual(sounds, ['generate']);
});

test('repeatable sensor requires an empty overlap frame; non-player overlaps also hold its latch', () => {
  const { actor, scene } = sensor(4, 1);
  actor.body.onOverlap({ category: 1 }); actor.beforeMotion();
  actor.body.onOverlap({ category: 3 }); actor.beforeMotion();
  assert.equal(actor.triggered, true);
  actor.beforeMotion(); assert.equal(actor.triggered, false);
  actor.body.onOverlap({ category: 1 });
  assert.deepEqual(scene.players.map(p => p.playerIndex), [0, 1]);
  assert.equal(sensor(4, .9).actor.rearm, false, 'option uses integer truncation');
});

test('shuffled mapping is searched by current slot, including missing-slot and out-of-map fallback', () => {
  const { actor, scene } = sensor(5);
  scene.playerSlots = [4, 2, 0, 3, 1];
  scene.players[0].playerIndex = 2; scene.players[1].playerIndex = 99;
  actor.body.onOverlap({ category: 1 });
  assert.deepEqual(scene.players.map(p => p.playerIndex), [3, 0]);
  const sparse = sensor(8); sparse.scene.playerSlots = [5, 7];
  sparse.actor.body.onOverlap({ category: 1 });
  assert.deepEqual(sparse.scene.players.map(p => p.playerIndex), [0, 0]);
});

test('network client does not latch; host emits control event and skips disconnected slots', () => {
  const client = sensor(); client.scene.flags = 0x100; client.scene.networkMode = 1;
  client.actor.body.onOverlap({ category: 1 });
  assert.equal(client.actor.triggered, false); assert.equal(client.actor.overlapSeen, false);
  assert.deepEqual(client.sounds, []);
  const host = sensor(5); host.scene.flags = 0x100; host.scene.networkMode = 2;
  host.scene.playerSlots = [4, 2, 0, 3, 1];
  host.scene.players[0].playerIndex = 4; host.scene.players[1].playerIndex = 2;
  const probes = []; host.scene.isNativePlayerConnected = slot => { probes.push(slot); return slot === 4; };
  host.actor.body.onOverlap({ category: 1 });
  assert.deepEqual(host.scene.players.map(p => p.playerIndex), [0, 4]);
  assert.deepEqual(probes, [3, 4]);
  assert.deepEqual(host.packets, [{ transport: 'host', target: 0xff, channel: 1, kind: 2, command: 3, value: 0 }]);
});

test('two-person party stays silent and still notifies carried objects when slots do not change', () => {
  const { actor, scene, sounds } = sensor(2), notifications = [];
  scene.players[0].carriedAttachments = [
    { onCommand: (...args) => notifications.push(args) }, null,
    { onCommand() { assert.fail('native setter only visits first two attachment slots'); } },
  ];
  actor.body.onOverlap({ category: 1 });
  assert.deepEqual(scene.players.map(p => p.playerIndex), [0, 1]); assert.deepEqual(sounds, []);
  assert.deepEqual(notifications, [[0x2e, null]]);
});

test('player-slot setter keeps native custom color map, appearance override, and slot10 exclusions', () => {
  const { scene } = sensor(), player = scene.players[0];
  scene.playerColorIndices = [7, 6, 5, 4];
  applyNativePlayerSlot(player, 2);
  assert.equal(player.spriteColor, NATIVE_PLAYER_COLORS[5]); assert.equal(player.sharedInputOwner, 2);
  player.appearanceMode = 1; applyNativePlayerSlot(player, 1);
  assert.equal(player.spriteColor, 0xffbfffdf);
  applyNativePlayerSlot(player, 10);
  assert.equal(player.playerIndex, 10); assert.equal(player.sharedInputOwner, 1);
  assert.equal(player.spriteColor, 0xffbfffdf);
});

test('actual Player crossing a zone changes which held input moves it, without teleporting', () => {
  const heldSlots = new Set([0]);
  const second = row('Player', 300, 640); second.label = '2';
  const scene = createNativeGameScene({ playerCount: 4, createRigidWorld,
    stage: { createTable: [row('Player', 100, 640), second, row('CollisionChangePlayer', 150, 580, 20, 96)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: (action, slot) => action === 6 && heldSlots.has(slot), pressed: () => false },
    playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true);
    for (let i = 0; i < 25; i++) scene.step();
    const player = scene.players[0];
    assert.deepEqual(scene.players.map(p => p.playerIndex), [2, 3]);
    const stopped = player.position.x;
    assert.ok(stopped > 130 && stopped < 180);
    for (let i = 0; i < 10; i++) scene.step();
    assert.equal(player.position.x, stopped, 'old input slot no longer moves this character');
    heldSlots.clear(); heldSlots.add(2);
    for (let i = 0; i < 10; i++) scene.step();
    assert.ok(player.position.x > stopped + 20); assert.equal(player.health, 1);
    assert.equal(player.spawnPosition.x, 100);
  } finally { scene.rigidWorld.dispose(); }
});
