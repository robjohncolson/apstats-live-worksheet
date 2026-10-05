import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeBridgeActor } from './native-bridge-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const row = (actorName, x, y, ...params) => ({ actorName, label: actorName === 'Switch' ? 'Bridge' : '',
  x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(rows, playerCount = 2) {
  const held = new Set();
  const scene = createNativeGameScene({ playerCount, createRigidWorld,
    stage: { createTable: rows, map: { width: 40, height: 24, chipSize: 32,
      table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: action => held.has(action), pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, held };
}

test('Bridge creates ordered solid segments with directional first art and party spread after body placement', () => {
  const { scene } = fixture([]);
  try {
    const bridge = createNativeBridgeActor({ spawn: row('Bridge', 500, 432, 20, -1, 0, 14, 20), partySize: 2 });
    scene.addActor(bridge);
    assert.equal(bridge.initialSpread, 8);
    assert.equal(bridge.segments.length, 20);
    assert.deepEqual(bridge.segments[0].position, { x: 340, y: 432 });
    assert.deepEqual(bridge.segments[0].body.position, { x: 500, y: 432 });
    assert.deepEqual(bridge.segments[0].targetOffset, { x: -380, y: 0 });
    assert.deepEqual(bridge.segments[19].targetOffset, { x: -0, y: 0 });
    assert.equal(bridge.segments[0].spriteUV.x, .21875);
    assert.deepEqual(bridge.segments[0].body.rawBounds, { x: 0, y: 0, width: 21, height: 20 });
    assert.equal(bridge.segments[0].body.flags & 16, 16);
    assert.equal(bridge.segments[0].body.responseFlags, 1);
    scene.setActive(true);
    assert.deepEqual(bridge.segments[0].body.position, bridge.segments[0].position);
  } finally { scene.rigidWorld.dispose(); }
});

test('Bridge command9 extends at2 pixels/frame with four-frame follower delay; command10 retracts at1', () => {
  const { scene } = fixture([row('Bridge', 100, 500, 3, 1, 0, 0, 10)]);
  try {
    scene.setActive(true);
    const bridge = scene.findActor('Bridge');
    scene.sendCommand('Bridge', 9);
    scene.step();
    assert.deepEqual(bridge.segments.map(s => s.position.x), [102, 100, 100]);
    for (let i = 0; i < 9; i++) scene.step();
    assert.deepEqual(bridge.segments.map(s => s.position.x), [120, 110, 100]);
    assert.deepEqual(bridge.segments.map(s => s.state), [3, 3, 3]);
    scene.sendCommand('Bridge', 10);
    scene.step();
    assert.deepEqual(bridge.segments.map(s => s.position.x), [119, 110, 100]);
    for (let i = 0; i < 25; i++) scene.step();
    assert.deepEqual(bridge.segments.map(s => s.position.x), [100, 100, 100]);
    assert.deepEqual(bridge.segments.map(s => s.state), [0, 0, 0]);
  } finally { scene.rigidWorld.dispose(); }
});

test('Gate starts spread with synchronized bodies and uses parameter3 for size, without party adjustment', () => {
  const { scene } = fixture([]);
  try {
    const gate = createNativeBridgeActor({ spawn: row('Gate', 200, 300, 3, .3, .4, 10, 99, 1), partySize: 2 });
    scene.addActor(gate);
    assert.equal(gate.mode, 1); assert.equal(gate.segmentSize, 10); assert.equal(gate.initialSpread, 0);
    assert.deepEqual(gate.direction, { x: Math.fround(.6), y: Math.fround(.8) });
    assert.deepEqual(gate.segments.map(s => s.position), [{ x: 212, y: 316 }, { x: 206, y: 308 }, { x: 200, y: 300 }]);
    assert.deepEqual(gate.segments[0].targetOffset, { x: -12, y: -16 });
    assert.equal(gate.segments[0].bridgeFlags, 2, 'Gate never enables leading-segment carry');
    for (const segment of gate.segments) {
      assert.deepEqual(segment.body.position, segment.position);
      assert.deepEqual(segment.body.previousPosition, segment.position);
      assert.deepEqual(segment.spawnPosition, segment.position);
    }
  } finally { scene.rigidWorld.dispose(); }
});

test('Gate command9 collapses at2 pixels/frame and command10 restores each own spawn at1', () => {
  const { scene } = fixture([row('Gate', 100, 500, 3, 0, -1, 10)]);
  try {
    scene.setActive(true);
    const gate = scene.findActor('Gate');
    assert.deepEqual(gate.segments.map(s => s.position.y), [480, 490, 500]);
    gate.onCommand(9); scene.step();
    assert.deepEqual(gate.segments.map(s => s.position.y), [482, 490, 500]);
    for (let i = 0; i < 14; i++) scene.step();
    assert.deepEqual(gate.segments.map(s => s.position.y), [500, 500, 500]);
    assert.ok(gate.segments.every(s => s.state === 3));
    gate.onCommand(10); scene.step();
    assert.deepEqual(gate.segments.map(s => s.position.y), [499, 500, 500]);
    for (let i = 0; i < 24; i++) scene.step();
    assert.deepEqual(gate.segments.map(s => s.position.y), [480, 490, 500]);
    assert.ok(gate.segments.every(s => s.state === 0));
  } finally { scene.rigidWorld.dispose(); }
});

test('native Player opens a named Gate by walking over Switch and then crosses its former barrier', () => {
  const gate = row('Gate', 500, 672, 4, 0, -1, 32); gate.label = '1';
  const button = row('Switch', 400, 672); button.label = 'Gate1';
  const { scene, held } = fixture([gate, button, row('Player', 320, 670)]);
  try {
    scene.setActive(true); held.add(6);
    for (let i = 0; i < 150; i++) scene.step();
    const actor = scene.findActor('Gate1');
    assert.ok(actor.segments.every(s => s.state === 3 && s.position.y === 672));
    assert.ok(scene.players[0].position.x > 600);
    assert.equal(scene.players[0].health, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('segment collision correction schedules a shared restore, then motion resumes', () => {
  const { scene } = fixture([row('Bridge', 100, 500, 3, 1, 0, 0, 10)]);
  try {
    scene.setActive(true);
    const bridge = scene.findActor('Bridge'), first = bridge.segments[0];
    bridge.onCommand(9); scene.step();
    first.body.onPositionResolved({ x: 99, y: 500 }, { x: -3, y: 0 });
    assert.ok(bridge.segments.every(s => s.bridgeFlags & 8));
    scene.step();
    assert.equal(first.position.x, 102);
    scene.step();
    assert.equal(first.position.x, 104);
  } finally { scene.rigidWorld.dispose(); }
});

test('bridge removal retires its child actors and unregisters every segment body', () => {
  const { scene } = fixture([row('Bridge', 100, 500, 3, 1, 0, 0, 10)]);
  try {
    scene.setActive(true);
    const bridge = scene.findActor('Bridge');
    assert.equal(scene.bodyWorld.bodies.length, 3);
    markNativeActorForRemoval(bridge); scene.step();
    assert.equal(scene.bodyWorld.bodies.length, 2, 'head removal ends the current scheduler traversal');
    scene.step();
    assert.equal(scene.bodyWorld.bodies.length, 0);
    assert.ok(bridge.segments.every(s => s.manager === null));
  } finally { scene.rigidWorld.dispose(); }
});

test('leading Bridge carry includes blocks and compensates motion opposing its push', () => {
  const { scene } = fixture([row('Bridge', 100, 500, 3, 1, 0, 0, 10, 1),
    row('PushBox', 200, 500, 100, 40, 40)]);
  try {
    scene.setActive(true);
    const bridge = scene.findActor('Bridge'), box = scene.findActor('PushBox');
    const initialX = box.position.x;
    const leader = bridge.segments[0];
    leader.body.contacts.push({ bodyId: box.body.id, normal: { x: 1, y: 0 } });
    box.velocity.x = -3;
    bridge.onCommand(9); leader.beforeMotion();
    assert.equal(leader.position.x, 102);
    assert.equal(box.position.x, initialX + 5, '2px carry plus 3px opposite motion compensation');
    assert.equal(box.body.position.x, initialX + 5);
    assert.deepEqual(box.postResetVector, { x: 5, y: 0 });
    box.body.flags |= 16;
    leader.beforeMotion();
    assert.equal(box.position.x, initialX + 5, 'fixed-body flag excludes the neighbor');
  } finally { scene.rigidWorld.dispose(); }
});

test('Player walking onto Switch extends actual Bridge segments through native named commands', () => {
  const { scene, held } = fixture([row('Player', 100, 672, 0), row('Switch', 200, 674),
    row('Bridge', 500, 500, 3, -1, 0, 0, 10)]);
  try {
    scene.setActive(true); held.add(6);
    for (let i = 0; i < 75; i++) scene.step();
    assert.deepEqual(scene.findActor('Bridge').segments.map(s => s.position.x), [480, 490, 500]);
  } finally { scene.rigidWorld.dispose(); }
});

test('KeyBridge begins extending when the actual Key is picked up and does not rearm on drop', () => {
  const { scene, held } = fixture([row('Player', 100, 672, 0), row('Key', 200, 650),
    row('KeyBridge', 500, 500, 3, -1, 0, 0, 10)]);
  try {
    scene.setActive(true); held.add(6);
    const bridge = scene.findActor('KeyBridge');
    assert.equal(bridge.waitForKey, true);
    for (let i = 0; i < 75; i++) scene.step();
    assert.equal(bridge.waitForKey, false);
    assert.deepEqual(bridge.segments.map(s => s.state), [3, 3, 3]);
    bridge.onCommand(10);
    for (let i = 0; i < 30; i++) scene.step();
    assert.deepEqual(bridge.segments.map(s => s.state), [0, 0, 0]);
  } finally { scene.rigidWorld.dispose(); }
});
