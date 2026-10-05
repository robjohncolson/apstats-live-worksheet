import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeJumpStandActor } from './native-jump-stand-actor.mjs';
import { createNativeBody, initializeNativeRectangleBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function fixture() {
  const world = createNativeBodyRegistry();
  const stand = createNativeJumpStandActor({ spawn: row('JumpStandEx', 0, 0, 3, -18) });
  attachNativeBody(world, stand.body);
  const add = category => {
    const body = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width: 20, height: 20 }, 3);
    const commands = [];
    body.category = category; body.actor = { onCommand: (command, value) => commands.push([command, value]) };
    attachNativeBody(world, body);
    return { body, commands };
  };
  return { stand, add };
}
const contact = (a, b, normal = { x: 0, y: -1 }) => a.contacts.push({ bodyId: b.id, normal, state: 1 });

test('jump stands preserve native fractional impulses, body geometry and action keys', () => {
  const stand = createNativeJumpStandActor({ spawn: row('JumpStand', 10, 20, -14.3) });
  assert.deepEqual(stand.impulse, { x: 0, y: f(-14.3) });
  assert.equal(stand.flags, 12); assert.equal(stand.spriteFlags, 9);
  assert.equal(stand.body.category, 5); assert.equal(stand.body.type, 3);
  assert.deepEqual(stand.body.rawBounds, { x: -16, y: -34, width: 32, height: 34 });
  assert.deepEqual(stand.spriteBounds, { x: -16, y: -40, width: 32, height: 42 });
  assert.deepEqual(stand.spriteAction.keys.map(key => key.frame), [0, 4, 8, 12, 16, 20, 24]);
});

test('players get vertical launch plus command45; boxes keep the extended horizontal impulse', () => {
  const { stand, add } = fixture(), player = add(1), box = add(2);
  contact(stand.body, player.body); contact(stand.body, box.body);
  stand.beforeMotion();
  assert.deepEqual(player.commands, [[0, { x: 0, y: -18 }], [45, { x: 0, y: -18 }]]);
  assert.deepEqual(box.commands, [[0, { x: 3, y: -18 }]]);
  contact(player.body, box.body);
  player.commands.length = 0; stand.beforeMotion();
  assert.deepEqual(player.commands, [], 'a body above the player suppresses the spring');
});

test('native raw-contact ordering quirk and orphan early return are preserved', () => {
  const { stand, add } = fixture(), side = add(2), top = add(1);
  contact(stand.body, side.body, { x: 1, y: 0 }); contact(stand.body, top.body);
  stand.beforeMotion();
  assert.equal(side.commands.length, 1); assert.equal(top.commands.length, 0);
  stand.body.contacts[0].normal = { x: 0, y: -1 }; side.body.actor = null;
  stand.beforeMotion(); assert.equal(top.commands.length, 0, 'orphan stops the loop');
});

test('native Player lands on a spring and launches without pressing jump', () => {
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('JumpStandEx', 400, 640, 3, -18), row('Player', 400, 550)],
      map: { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 40 * 20 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    scene.setActive(true);
    let launched = false, minimumY = 550;
    for (let i = 0; i < 50; i++) {
      scene.step();
      const player = scene.players[0];
      if (player.velocity.y < -15) launched = true;
      minimumY = Math.min(minimumY, player.position.y);
      assert.equal(player.position.x, 400, 'horizontal Ex impulse is suppressed for players');
    }
    assert.ok(launched); assert.ok(minimumY < 420);
    assert.equal(scene.findActor('JumpStandEx').position.y, 640);
  } finally { scene.rigidWorld.dispose(); }
});
