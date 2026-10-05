import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativePushBoxActor } from './native-push-box-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
import { tryNativePushBoxRelocation } from './native-push-box-commands.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(rows, originalStage = null, playerCount = 2) {
  const held = new Set();
  const stage = originalStage ?? { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
    table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } };
  const scene = createNativeGameScene({ stage, playerCount, createRigidWorld,
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, { playerPresentation: presentation }) });
  return { scene, held };
}

test('PushBox constructor retains native dimensions, inset body, percentage/offset and presentation data', () => {
  const box = createNativePushBoxActor({ spawn: row('PushBox', 192, 432, 30, 47, 384) });
  assert.deepEqual(box.body.rawBounds, { x: -22.5, y: -383, width: 45, height: 382 });
  assert.equal(box.body.category, 2); assert.equal(box.body.type, 3);
  assert.equal(box.managerPriority, 2); assert.equal(box.motionFlags, 12);
  assert.equal(box.requiredPercent, 30); assert.equal(box.requiredOffset, 0);
  assert.equal(box.counterVisible, 1); assert.equal(box.patch.tileWidth, 24);
  const adjusted = createNativePushBoxActor({ spawn: row('PushBox', 0, 0, -2, 96, 96) });
  assert.equal(adjusted.requiredPercent, 100); assert.equal(adjusted.requiredOffset, -2);
});

test('PushBox commands preserve collision and pending impulses through hide/freeze/reset operations', () => {
  const box = createNativePushBoxActor({ spawn: row('PushBox', 100, 200, 100, 48, 48) });
  const events = [];
  box.components.push({ consumeVelocity: velocity => events.push({ ...velocity }) });
  box.velocity = { x: -3, y: 2 };
  box.onCommand(2, { x: -7, y: -4 });
  assert.deepEqual(box.externalVelocity, { x: -7, y: -4 });
  box.onCommand(0xe, 0);
  assert.equal(box.patchFlags & 8, 0); assert.equal(box.body.flags & 1, 1);
  assert.equal(box.counterVisible, 0);
  assert.equal(box.onCommand(0x1e, 1), 1);
  assert.equal(box.boxFlags, 3); assert.deepEqual(events, [{ x: 0, y: 0 }]);
  box.onCommand(7, { x: 400, y: 500 });
  box.position = { x: 300, y: 400 };
  box.onCommand(8);
  assert.deepEqual(box.position, { x: 100, y: 200 });
  assert.deepEqual(box.pendingPosition, { x: 400, y: 500 }, 'reset does not consume pending relocation');
  box.onCommand(0x1e, 0);
  assert.equal(box.boxFlags, 1);
  box.onCommand(0, { x: -2, y: 3 });
  assert.equal(box.externalVelocity.x, 2, 'zero horizontal velocity takes positive launch direction');
  box.onCommand(0xe, 1); box.onCommand(0x2c);
  assert.equal(box.patchFlags & 8, 0); assert.equal(box.counterVisible, 0);
});

test('PushBox pending relocation retries occupied destinations and retains contacts after success', () => {
  const { scene } = fixture([row('PushBox', 100, 600, 100, 48, 48), row('Rect', 300, 600, 48, 48)]);
  try {
    scene.setActive(true);
    const box = scene.findActor('PushBox'), obstacle = scene.findActor('Rect');
    obstacle.body.flags |= 1;
    box.body.contacts.push({ bodyId: obstacle.body.id, state: 1, normal: { x: 1, y: 0 } });
    box.body.mapContacts.push({ x: 0, y: 1 });
    box.onCommand(7, { x: 320, y: 600 });
    const original = { ...box.position }, velocity = { ...box.velocity };
    assert.equal(tryNativePushBoxRelocation(box), false);
    assert.deepEqual(box.position, original); assert.deepEqual(box.velocity, velocity);
    obstacle.body.flags &= ~1;
    assert.equal(tryNativePushBoxRelocation(box), true);
    assert.deepEqual(box.position, { x: 320, y: 600 });
    assert.deepEqual(box.body.previousPosition, box.position);
    assert.deepEqual(box.velocity, { x: 0, y: 0 });
    assert.deepEqual(box.pendingPosition, { x: 0, y: 0 });
    assert.equal(box.body.contacts.length, 1); assert.equal(box.body.mapContacts.length, 1);
    assert.equal(tryNativePushBoxRelocation(box), false);
  } finally { scene.rigidWorld.dispose(); }
});

test('UP collision sends command0 to the struck actor and its stack, once, then stops upward velocity', () => {
  const { scene } = fixture([row('PushBox', 100, 600, 100, 48, 48)]);
  try {
    scene.setActive(true);
    const box = scene.findActor('PushBox'), events = [];
    const lower = createNativePushBoxActor({ spawn: row('PushBox', 100, 500, 100, 48, 48) });
    const upper = createNativePushBoxActor({ spawn: row('PushBox', 100, 400, 100, 48, 48) });
    scene.addActor(lower); scene.addActor(upper); scene.step();
    lower.motionFlags |= 16;
    lower.body.contacts.push({ bodyId: upper.body.id, normal: { x: 0, y: -1 } });
    lower.onCommand = (command, vector) => events.push(['lower', command, vector.y]);
    upper.onCommand = (command, vector) => events.push(['upper', command, vector.y]);
    box.velocity.y = -6;
    box.body.onContactBegin(lower.body, { x: 0, y: -1 });
    assert.deepEqual(events, [['lower', 0, -3], ['upper', 0, -6]]);
    assert.equal(box.velocity.y, 0);
    box.body.onContactBegin(lower.body, { x: 0, y: -1 });
    assert.equal(events.length, 2);
  } finally { scene.rigidWorld.dispose(); }
});

for (const playerCount of [2, 8]) test(`original stage_push02 moves its first native block with ${playerCount} players through input`, () => {
  const stage = stages.find(stage => stage.name === 'stage_push02');
  const { scene, held } = fixture(null, stage, playerCount);
  try {
    scene.setActive(true);
    const boxes = scene.bodyWorld.bodies.map(body => body.actor).filter(actor => actor.isNativePushBox);
    assert.equal(scene.players.length, playerCount);
    assert.equal(boxes.length, 3);
    assert.deepEqual(boxes.map(box => box.requiredPercent), [30, 100, 50]);
    const first = boxes[0], initialX = first.position.x;
    held.add(5);
    for (let i = 0; i < 150; i++) scene.step();
    assert.ok(first.position.x < initialX - 10, `first block moved from ${initialX} to ${first.position.x}`);
    assert.ok(scene.players.every(player => player.controllerKind !== 1 && player.controllerKind !== 3));
    assert.equal(first.counterPresentation().text, '0');
  } finally { scene.rigidWorld.dispose(); }
});

test('PushBox post-motion flag changes are replica-only and its counter uses replicated pusher count', () => {
  const { scene } = fixture([row('Player', 400, 600, 0), row('PushBox', 100, 600, 100, 48, 48)]);
  try {
    scene.setActive(true);
    const box = scene.findActor('PushBox');
    box.body.mapContacts = [{ x: 0, y: 1 }];
    box.flags = 0x10; box.velocity = { x: 0, y: 0 };
    box.afterMotion();
    assert.equal(box.flags & 0x10, 0x10, 'local actor keeps its flag');
    box.replication = {}; scene.networkMode = 1;
    box.afterMotion();
    assert.equal(box.flags & 0x10, 0);
    box.boxFlags = 2; box.afterMotion();
    assert.equal(box.flags & 0x10, 0x10, 'frozen replica requests continued history');
    box.boxFlags = 0; box.pusherCount = 1;
    box.body.contacts.push({ bodyId: scene.players[0].body.id, normal: { x: 1, y: 0 } });
    scene.players[0].flags |= 8;
    box.afterMotion();
    assert.equal(box.flags & 0x10, 0x10);
    box.replicatedPusherCount = 0;
    assert.equal(box.counterPresentation().text, '1');
    box.replicatedPusherCount = 3;
    assert.equal(box.counterPresentation().text, '0');
    scene.actorManager.flags |= 8;
    scene.players[0].flags = 0;
    box.afterMotion();
    assert.equal(box.flags & 0x10, 0x10, 'manager alternate pass skips flag updates');
  } finally { scene.rigidWorld.dispose(); }
});
