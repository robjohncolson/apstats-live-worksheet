import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeGameScene } from './native-game-scene.mjs';
import { spawnNativePlayerRow } from './native-player-spawn.mjs';
import { populateNativeSeesawActors } from './native-seesaw-stage.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const original = stages.find(stage => stage.name === 'stage_seesaw01');
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
const inputs = { held: () => false, pressed: () => false };

test('original Player rows honor party limit, facing and priority through creation scheduler', () => {
  const scene = createNativeGameScene({ stage: original, playerCount: 2, createRigidWorld,
    playerInput: inputs, playSound() {}, spawnActor: (scene, spawn) => {
      if (spawn.actorName === 'Player') return spawnNativePlayerRow(scene, spawn, { presentation });
      populateNativeSeesawActors(scene, [spawn]);
    } });
  try {
    scene.setActive(true);
    assert.deepEqual(scene.players.map(player => player.name), ['Player1', 'Player2']);
    assert.deepEqual(scene.players.map(player => player.playerIndex), [0, 1]);
    assert.deepEqual(scene.players.map(player => player.scale.x), [1, -1]);
    assert.equal(scene.players.every(player => player.managerPriority === 1), true);
    assert.equal(scene.creationSchedule.state.entries.filter(entry => entry.spawn.actorName === 'Player' && entry.created).length, 8,
      'scheduler consumes all ungated Player rows even when factory limit rejects extra players');
    assert.equal(scene.findActor('Player3'), null);
    assert.ok(scene.findActor('SeesawParent'));
    for (let tick = 0; tick < 120; tick++) scene.step();
    assert.equal(scene.players.every(player => player.controllerKind === 2), true);
    assert.equal(scene.flags & 6, 0);
  } finally { scene.rigidWorld.dispose(); }
});

test('unlimited Player rows cycle input slots; shuffled mapping uses inclusive ascending swaps', () => {
  const bounds = [];
  const stage = { ...original, limitPlayer: 0, enableShufflePlayer: 1,
    createTable: original.createTable.filter(row => row.actorName === 'Player') };
  const scene = createNativeGameScene({ stage, playerCount: 3, createRigidWorld, playerInput: inputs,
    randomInclusive: upper => { bounds.push(upper); return 0; },
    spawnActor: (scene, spawn) => spawnNativePlayerRow(scene, spawn, { presentation }) });
  try {
    assert.deepEqual(bounds, [1, 2]);
    assert.deepEqual(scene.playerSlots, [2, 0, 1]);
    scene.setActive(true);
    assert.equal(scene.players.length, 8);
    assert.deepEqual(scene.players.map(player => player.playerIndex), [2, 0, 1, 2, 0, 1, 2, 0]);
  } finally { scene.rigidWorld.dispose(); }
});

test('Player row configuration only accepts a numeric first parameter and cannot silently stand in for another form', () => {
  const scene = createNativeGameScene({ stage: original, playerCount: 2, createRigidWorld });
  try {
    const row = original.createTable[1];
    const stringFacing = { ...row, raw: [...row.raw.slice(0, 6), '1'] };
    const actor = spawnNativePlayerRow(scene, stringFacing, { presentation });
    assert.equal(actor.scale.x, 1);
    assert.throws(() => spawnNativePlayerRow(scene, { ...row, actorName: 'MagnetPlayer' }, { presentation }), /another actor type/);
  } finally { scene.rigidWorld.dispose(); }
  assert.throws(() => createNativeGameScene({ stage: { ...original, enableShufflePlayer: 1 },
    playerCount: 2, createRigidWorld }), /random source/);
});
