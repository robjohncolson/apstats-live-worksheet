import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
for (const name of ['stage_magnet01', 'stage_magnet02']) {
  for (const count of [2, 8]) test(`${name} constructs original MagnetPlayer rows for party${count}`, () => {
    const stage = stages.find(stage => stage.name === name);
    const scene = createNativeGameScene({ stage, playerCount: count, createRigidWorld,
      randomInclusive: () => 0, playerInput: { held: () => false, pressed: () => false }, playSound() {},
      spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, { playerPresentation: presentation, randomFloat: () => .5 }) });
    try {
      scene.setActive(true);
      for (let i = 0; i < 10; i++) scene.step();
      assert.equal(scene.players.length, count);
      for (const owner of scene.players) {
        assert.ok(owner.name.startsWith('MagnetPlayer'));
        assert.equal(scene.findActor(owner.name), owner);
        const magnet = owner.carriedAttachments[0];
        assert.equal(magnet.owner, owner); assert.equal(magnet.body.world, scene.bodyWorld);
        assert.equal(magnet.managerPriority, 3); assert.equal(magnet.body.category, 2);
        assert.equal(owner.spriteUV.y, .0322265625);
      }
    } finally { scene.rigidWorld.dispose(); }
  });
}

test('missing RNG is rejected before partial Player creation', () => {
  const stage = stages.find(stage => stage.name === 'stage_magnet01');
  const scene = createNativeGameScene({ stage, playerCount: 2, createRigidWorld });
  try {
    assert.throws(() => spawnNativeStageActor(scene, stage.createTable[0], { playerPresentation: presentation }), /random-float adapter/);
    assert.equal(scene.players.length, 0);
  } finally { scene.rigidWorld.dispose(); }
});
