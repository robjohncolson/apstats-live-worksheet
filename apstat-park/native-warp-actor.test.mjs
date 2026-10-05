import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeWarpActor } from './native-warp-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function sensor(name = 'Warp', destination = [500, 200], offset = [10, -20], count = 3) {
  const warp = createNativeWarpActor({ spawn: row(name, 0, 0, 100, 50, ...destination, ...offset) });
  const commands = [], broadcasts = [];
  const players = Array.from({ length: count }, (_, index) => ({ position: { x: 80 + index, y: 90 },
    onCommand: (command, value) => commands.push([index, command, value]) }));
  warp.scene = { players, sendCommand: (...args) => broadcasts.push(args) };
  return { warp, players, commands, broadcasts };
}

test('Warp constructor uses integer Lua parameters and a top-left sensor anchor', () => {
  const warp = createNativeWarpActor({ spawn: row('Warp', 768, 576, 240.9, 96.5, 720.8, -48.9, 0, -50) });
  assert.deepEqual(warp.body.rawBounds, { x: 0, y: 0, width: 240, height: 96 });
  assert.equal(warp.body.type, 0); assert.equal(warp.body.category, 2);
  assert.deepEqual(warp.position, { x: 768, y: 576 });
  assert.deepEqual(warp.destination, { x: 720, y: -48 });
});

test('individual Warp cycles offsets 0,1,...,N,1 without resetting between frames', () => {
  const { warp, players, commands } = sensor();
  for (let i = 0; i < 6; i++) warp.body.onOverlap({ category: 1, actor: players[0] });
  assert.deepEqual(commands.map(([, , p]) => p.x), [500, 510, 520, 530, 510, 520]);
  assert.deepEqual(commands.map(([, , p]) => p.y), [200, 180, 160, 140, 180, 160]);
});

test('Warp preserves player coordinates only for the native zero destination cases', () => {
  for (const [destination, expected] of [[[0, 0], { x: 80, y: 90 }],
    [[0, 200], { x: 80, y: 200 }], [[500, 0], { x: 500, y: 0 }]]) {
    const { warp, players, commands } = sensor('Warp', destination, [0, 0]);
    warp.body.onOverlap({ category: 1, actor: players[0] });
    assert.deepEqual(commands[0][2], expected);
    warp.body.onOverlap({ category: 2, actor: players[0] });
    assert.deepEqual(commands[1][2], { x: destination[0], y: destination[1] }, 'blocks use raw destination');
  }
});

test('WarpAll accumulates team offsets while category2 warps remain individual', () => {
  const { warp, players, commands } = sensor('WarpAll', [500, 200], [10, -20], 4);
  warp.body.onOverlap({ category: 1, actor: players[2] });
  assert.deepEqual(commands, [[0, 7, { x: 500, y: 200 }], [1, 7, { x: 510, y: 180 }],
    [2, 7, { x: 530, y: 140 }], [3, 7, { x: 560, y: 80 }]]);
  commands.length = 0;
  warp.body.onOverlap({ category: 2, actor: players[2] });
  assert.deepEqual(commands, [[2, 7, { x: 500, y: 200 }]]);
});

test('initial-position variants send command8; all-reset broadcasts to named actors, not just players', () => {
  const local = sensor('WarpInitPos');
  local.warp.body.onOverlap({ category: 2, actor: local.players[0] });
  assert.deepEqual(local.commands, [[0, 8, undefined]]);
  const all = sensor('WarpAllInitPos');
  all.warp.body.onOverlap({ category: 1, actor: all.players[0] });
  assert.deepEqual(all.broadcasts, [[null, 8, null]]);
  assert.deepEqual(all.commands, []);
});

test('Warp ignores unsupported categories and client replicas, but not merely a client scene', () => {
  const { warp, players, commands } = sensor();
  for (const category of [0, 3, 6, 8, 10]) warp.body.onOverlap({ category, actor: players[0] });
  warp.replication = {}; warp.scene.networkMode = 1;
  warp.body.onOverlap({ category: 1, actor: players[0] });
  assert.equal(commands.length, 0);
  warp.replication = null;
  warp.body.onOverlap({ category: 1, actor: players[0] });
  assert.equal(commands.length, 1);
});

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
for (const reset of [false, true]) test(`assembled ${reset ? 'reset' : 'destination'} warp relocates a moving native Player`, () => {
  const held = new Set([6]);
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 100, 672, 0), row(reset ? 'WarpInitPos' : 'Warp', 180, 570, 60, 100, 500, 500, 0, 0)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    notifyPlayerRelocation() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, { playerPresentation: presentation }) });
  try {
    scene.setActive(true);
    const player = scene.players[0];
    let arrived = false, movedAway = false;
    for (let i = 0; i < 60; i++) {
      scene.step();
      if (player.position.x > 130) movedAway = true;
      const target = reset ? player.spawnPosition : { x: 500, y: 500 };
      if (movedAway && player.position.x === target.x && player.position.y === target.y) { arrived = true; break; }
    }
    assert.equal(arrived, true);
    assert.equal(player.controllerKind, 2);
    assert.deepEqual(player.velocity, { x: 0, y: 0 });
  } finally { scene.rigidWorld.dispose(); }
});
