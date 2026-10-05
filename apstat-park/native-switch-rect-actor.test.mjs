import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeSwitchRectActor } from './native-switch-rect-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
function makeScene(stage, count = 1) {
  return createNativeGameScene({ playerCount: count, createRigidWorld, stage, randomInclusive: () => 0,
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
}
const map = { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 840 ? 2 : 1) };

test('SwitchRect waits for occupied space to clear and stays active until the last release', () => {
  const game = makeScene({ createTable: [row('Player', 220, 650), row('SwitchRect', 200, 672, 48, 96)], map });
  try {
    game.setActive(true); const actor = game.findActor('SwitchRect');
    assert.equal(actor.patchFlags & 8, 0); assert.equal(actor.body.flags & 1, 0);
    actor.onCommand(9); actor.onCommand(9); actor.beforeMotion();
    assert.equal(actor.activationCount, 2); assert.equal(actor.patchFlags & 8, 8);
    assert.equal(actor.body.flags & 1, 0, 'occupied platform remains non-solid');
    game.players[0].bodies[0].body.flags &= ~1;
    actor.beforeMotion(); assert.equal(actor.body.flags & 1, 1);
    actor.onCommand(10); assert.equal(actor.body.flags & 1, 1);
    actor.onCommand(10); assert.equal(actor.body.flags & 1, 0); assert.equal(actor.patchFlags & 8, 0);
    actor.onCommand(10); assert.equal(actor.activationCount, 0);
  } finally { game.rigidWorld.dispose(); }
});

test('actual Player presses named Switch to reveal the platform through scene commands', () => {
  const trigger = { ...row('Switch', 200, 664), label: 'SwitchRect1' };
  const platform = { ...row('SwitchRect', 400, 600, 96, 48), label: '1' };
  const game = makeScene({ createTable: [row('Player', 200, 640), trigger, platform], map });
  try {
    game.setActive(true); for (let i = 0; i < 20; i++) game.step();
    const actor = game.findActor('SwitchRect1');
    assert.equal(actor.activationCount, 1); assert.equal(actor.body.flags & 1, 1);
  } finally { game.rigidWorld.dispose(); }
});

test('negative widths shift the platform left and ignore ordinary Rect party parameters', () => {
  const actor = createNativeSwitchRectActor({ spawn: row('SwitchRect', 400, 300, -96, 48, 100, 100) });
  assert.equal(actor.position.x, 304);
  assert.deepEqual(actor.body.rawBounds, { x: 0, y: -48, width: 96, height: 48 });
  assert.equal(actor.beforeAlternateMotion, null);
});

const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const count of [2, 8]) test(`original jump07 initializes for ${count} players`, () => {
  const game = makeScene(stages.find(stage => stage.name === 'stage_jump07'), count);
  try {
    game.setActive(true); assert.equal(game.players.length, 2, 'source contains only two Player rows');
    assert.equal(game.creationSchedule.state.cursor, game.creationSchedule.state.entries.length);
    for (let i = 0; i < 30; i++) game.step();
    assert.ok(game.findActor('SwitchRect1')); assert.ok(game.players.every(player => player.health === 1));
  } finally { game.rigidWorld.dispose(); }
});
