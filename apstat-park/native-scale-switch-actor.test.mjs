import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeScaleSwitchActor } from './native-scale-switch-actor.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { resizeNativePlayer } from './native-player-resize.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };

test('player resize preserves facing, clamps sprite size and uses compressed collision growth', () => {
  const player = createNativePlayer({ position: { x: 100, y: 100 }, presentation });
  player.scale.x = -1; resizeNativePlayer(player, 1);
  assert.deepEqual(player.scale, { x: -2, y: 2 });
  assert.equal(player.bodies[0].body.scale.y, Math.fround(1 + Math.fround(.88)));
  resizeNativePlayer(player, 100); assert.equal(player.scale.y, 3.5);
  resizeNativePlayer(player, -100); assert.equal(player.scale.y, Math.fround(.4));
  assert.equal(player.bodies[0].body.scale.y, Math.fround(.4));
  const main = { ...player.scale }, events = [];
  player.components.push({ setScale: (x, y) => events.push([x, y]) });
  player.onScaleResolved(1.44, .8);
  assert.deepEqual(player.scale, main); assert.equal(events[0][1], .8);
});

test('ScaleSwitch continuously affects only last contacting Player and clears its contact each PRE', () => {
  const actor = createNativeScaleSwitchActor({ spawn: row('ScaleSwitch', 100, 200, -.02) });
  actor.scene = { sendCommand() {}, playSound() {}, viewPosition: { x: 0, y: 0 }, viewOffset: { x: 0, y: 0 } };
  const events = [], player = { onCommand: (...args) => events.push(args) };
  actor.body.onOverlap({ type: 3, category: 1, actor: player }); actor.beforeMotion();
  actor.beforeMotion(); assert.deepEqual(events, [[0x21, Math.fround(-.02)]]);
  actor.body.onOverlap({ type: 3, category: 2, actor: player }); actor.beforeMotion();
  assert.equal(events.length, 1); assert.equal(actor.readScaleLabel().text, '-');
});

const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
function makeScene(stage, count = 1) {
  return createNativeGameScene({ playerCount: count, createRigidWorld, stage,
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, { playerPresentation: presentation }) });
}
test('actual scale-switch contact grows Player across multiple frames and stops after separation', () => {
  const game = makeScene({ createTable: [row('Player', 200, 640), row('ScaleSwitch', 200, 664, .02)],
    map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 840 ? 2 : 1) } });
  try {
    game.setActive(true); for (let i = 0; i < 30; i++) game.step();
    assert.ok(game.players[0].scale.y > 1.2); assert.ok(game.scrollFlags & 0x800);
    const trigger = game.findActor('ScaleSwitch'); trigger.body.flags &= ~1;
    game.step(); game.step(); const size = game.players[0].scale.y;
    for (let i = 0; i < 10; i++) game.step();
    assert.equal(game.players[0].scale.y, size);
  } finally { game.rigidWorld.dispose(); }
});
test('growth carries the stack above and players on each side before collision resolution', () => {
  const rows = [row('Player', 400, 600), row('Player', 400, 550), row('Player', 432, 600), row('Player', 368, 600)];
  rows.forEach((spawn, i) => { spawn.label = String(i); });
  const game = makeScene({ createTable: rows, map: { width: 40, height: 24, chipSize: 32, table: Array(960).fill(1) } }, 4);
  try {
    game.setActive(true);
    const [main, up, right, left] = game.players, body = main.bodies[0].body;
    body.contacts = [up, right, left].map((actor, i) => ({ bodyId: actor.bodies[0].body.id,
      normal: [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }][i], state: 1 }));
    const before = [up, right, left].map(actor => ({ ...actor.position }));
    const bounds = { ...body.localBounds };
    resizeNativePlayer(main, 1);
    const width = Math.fround(Math.fround(body.localBounds.width - bounds.width) * .5);
    const height = Math.fround(body.localBounds.height - bounds.height);
    assert.equal(up.position.y, Math.fround(before[0].y - height));
    assert.equal(right.position.x, Math.fround(before[1].x + width));
    assert.equal(left.position.x, Math.fround(before[2].x - width));
  } finally { game.rigidWorld.dispose(); }
});
for (const count of [2, 8]) test(`original big_and_small initializes for ${count} players`, () => {
  const game = makeScene(stages.find(stage => stage.name === 'stage_big_and_small'), count);
  try {
    game.setActive(true); assert.equal(game.players.length, count);
    assert.equal(game.creationSchedule.state.cursor, game.creationSchedule.state.entries.length);
    for (let i = 0; i < 30; i++) game.step();
    assert.ok(game.players.every(player => player.health === 1));
  } finally { game.rigidWorld.dispose(); }
});
