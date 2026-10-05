import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeGameScene, nativeActorNameHash } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeKeyActor } from './native-key-actor.mjs';
import { createNativeGoalActor } from './native-goal-actor.mjs';
import { populateNativeSeesawActors } from './native-seesaw-stage.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const presentation = { setAnimation() {}, setScale() {}, resetSpriteBounds() {} };
const emptyMap = () => ({ width: 40, height: 24, chipSize: 32,
  table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) });
function fixture(options = {}) {
  const held = new Set(), pressed = new Set(), sounds = [];
  const scene = createNativeGameScene({ stage: { map: emptyMap(), ...options }, playerCount: 2,
    createRigidWorld, stageRetryEligible: true,
    playerInput: { held: action => held.has(action), pressed: action => pressed.has(action) },
    playSound: name => sounds.push(name), spawnDueActors() {} });
  return { scene, held, pressed, sounds };
}

test('GameScene constructor uses original collision matrix, camera defaults, map flags and rigid gravity', () => {
  const { scene } = fixture();
  try {
    assert.equal(scene.flags, 0x600, 'construction is inactive');
    assert.equal(scene.actorManager.buckets.length, 4);
    assert.equal(scene.scrollFlags, 0x500);
    assert.equal(scene.scrollLimit, 0);
    assert.equal(scene.cameraBlend, 1);
    assert.equal(scene.cameraMaxStep, 3);
    assert.equal(scene.maximumPlayerY, 2160);
    assert.equal(scene.mapFlags, 3);
    assert.deepEqual(scene.bodyWorld.map.customFlags, [3, 3, 3, 3, 1, 1, 1, 1, 1]);
    assert.equal(scene.bodyWorld.collisionMatrix.reduce((a, b) => a + b, 0), 39);
    for (const [a, b] of [[1, 1], [1, 8], [8, 1], [8, 10], [10, 8], [3, 0]]) {
      assert.equal(scene.bodyWorld.collisionMatrix[a * 32 + b], 1);
    }
    assert.equal(scene.bodyWorld.collisionMatrix[3 * 32 + 1], 0, 'not all actor classes collide');
    const body = scene.rigidWorld.createBody({ type: 2 }).addCircle({ radius: .1, density: 1 });
    scene.flags |= 0x20;
    scene.step();
    assert.equal(scene.frame, 1n);
    assert.equal(body.read().vy, Math.fround(Math.fround(980 * Math.fround(.01)) * Math.fround(1 / 60)));
  } finally { scene.rigidWorld.dispose(); }
});

test('Lua options preserve explicit autoScroll zero and scaled failure bounds', () => {
  const { scene } = fixture({ autoScroll: 0, scrollable: 1, scale: 1.5,
    failWindowScale: 2, failUpY: -50, isDarkness: 1, unreturnScroll: 1 });
  try {
    assert.equal(scene.scrollMode, 0);
    assert.equal(scene.maximumPlayerY, 960);
    assert.equal(scene.minimumPlayerY, -50);
    assert.equal(scene.mapFlags, 1);
    assert.equal(scene.scrollFlags & 0x210, 0x210);
  } finally { scene.rigidWorld.dispose(); }
  const second = createNativeGameScene({ stage: { map: emptyMap(), autoScroll: 1,
    autoScrollSpeed: 2, autoScrollSpeedOffset: .5, autoScrollEndOffset: 100 },
    playerCount: 5, createRigidWorld });
  try {
    assert.equal(second.scrollMode, 2);
    assert.equal(second.scrollSpeed, 3.5);
    assert.equal(second.mapOffset, 300);
  } finally { second.rigidWorld.dispose(); }
});

test('named commands use unique CRC32 entries, hash-ordered broadcasts and removal releases', () => {
  const { scene } = fixture();
  try {
    assert.equal(nativeActorNameHash('123456789'), 0xcbf43926);
    assert.equal(nativeActorNameHash('Goal\0ignored'), nativeActorNameHash('Goal'));
    const calls = [], releases = [];
    const actor = (name, id) => ({ name, onCommand: () => { calls.push(id); return id; },
      onReleased: () => releases.push(id) });
    const first = actor('Goal', 'first'), duplicate = actor('Goal', 'duplicate');
    scene.addActor(first); scene.addActor(duplicate);
    scene.addActor(actor('Key', 'key')); scene.addActor(actor('', 'unnamed'));
    assert.equal(scene.sendCommand('Goal', 9), 'first');
    assert.equal(first.references, 2);
    assert.equal(duplicate.references, 1);
    calls.length = 0;
    scene.sendCommand(null, 9);
    assert.deepEqual(calls, ['first', 'key']); // CRC32(Goal) < CRC32(Key)
    markNativeActorForRemoval(first);
    scene.flags |= 0x20; scene.step();
    assert.equal(scene.findActor('Goal'), null, 'duplicate never replaces a removed named entry');
    assert.deepEqual(releases, ['first']);
  } finally { scene.rigidWorld.dispose(); }
});

test('assembled scene completes walking to Key and Goal using only player inputs', () => {
  const { scene, held, pressed, sounds } = fixture();
  try {
    const player = createNativePlayer({ position: { x: 100, y: 672 }, presentation });
    player.name = 'Player1';
    scene.addPlayer(player);
    const key = createNativeKeyActor({ position: { x: 220, y: 642 } });
    const goal = createNativeGoalActor({ position: { x: 400, y: 674 } });
    scene.addActor(key); scene.addActor(goal);
    scene.setActive(true);
    for (let tick = 0; tick < 10; tick++) scene.step();
    held.add(6);
    for (let tick = 0; tick < 100; tick++) scene.step();
    held.clear();
    for (let tick = 0; tick < 60; tick++) scene.step();
    assert.equal(player.position.x, 400);
    assert.equal(goal.opened, true);
    assert.equal(key.state, 3);
    assert.equal(scene.flags & 4, 0);
    pressed.add(3);
    scene.step(); pressed.clear();
    assert.equal(player.fallState, 4);
    scene.step();
    assert.equal(player.controllerKind, 4);
    assert.equal(scene.goalCount, 1);
    assert.equal(scene.flags & 4, 4);
    assert.ok(sounds.includes('get'));
  } finally { scene.rigidWorld.dispose(); }
});

test('original seesaw rows share assembled scene map, named dispatch, players and rigid world', () => {
  const stage = stages.find(stage => stage.name === 'stage_seesaw01');
  const snapshots = [];
  for (let reset = 0; reset < 2; reset++) {
    const { scene } = fixture(stage);
    try {
      for (const row of stage.createTable.filter(row => row.actorName === 'Player').slice(0, 2)) {
        const actor = createNativePlayer({ playerIndex: scene.players.length,
          position: { x: row.x, y: row.y }, presentation });
        actor.name = 'Player' + row.label;
        scene.addPlayer(actor);
      }
      populateNativeSeesawActors(scene, stage.createTable);
      assert.equal(scene.findActor('Key').body.flags & 1, 0);
      scene.sendCommand('Key', 9);
      assert.equal(scene.findActor('Key').body.flags & 1, 1);
      scene.flags |= 0x20;
      for (let tick = 0; tick < 120; tick++) scene.step();
      assert.equal(scene.players.every(player => player.controllerKind === 2), true);
      assert.equal(scene.flags & 6, 0);
      snapshots.push(scene.players.map(player => ({ ...player.position })));
    } finally { scene.rigidWorld.dispose(); }
  }
  assert.deepEqual(snapshots[1], snapshots[0]);
});

test('activation schedules rows, runs PRE at zero dt, centers once, then broadcasts initial darkness', () => {
  const { scene } = fixture({ scrollable: 1, isDarkness: 1 });
  const events = [];
  try {
    scene.spawnDueActors = x => {
      events.push(['spawn', x]);
      const actor = { name: 'Player1', controllerKind: 2, spriteFlags: 8,
        position: { x: 1500, y: 100 }, onPre: dt => {
          events.push(['pre', dt]); actor.position.x += 10;
        }, onCommand: command => events.push(['command', command, scene.viewPosition.x]) };
      scene.addPlayer(actor);
    };
    scene.setActive(true);
    assert.deepEqual(events, [['spawn', 0], ['pre', 0], ['command', 0x2c, 870]]);
    assert.equal(scene.scrollFlags & 4, 4);
    scene.setActive(true);
    assert.equal(events.length, 3, 'already-active call does nothing');
    scene.setActive(false);
    assert.equal(scene.flags & 0x20, 0);
    scene.spawnDueActors = x => events.push(['spawn', x]);
    scene.setActive(true);
    assert.equal(scene.viewPosition.x, 870, 'reactivation preserves initial centering latch');
    assert.deepEqual(events.slice(3), [['spawn', 870], ['pre', 0], ['command', 0x2c, 870]]);
  } finally { scene.rigidWorld.dispose(); }
});

test('incremental stage creation deduplicates Key and binds a previously registered seesaw parent', () => {
  const { scene } = fixture();
  try {
    const rows = stages.find(stage => stage.name === 'stage_seesaw01').createTable;
    const keyRow = rows.find(row => row.actorName === 'Key');
    assert.equal(populateNativeSeesawActors(scene, [keyRow]).length, 1);
    assert.equal(populateNativeSeesawActors(scene, [keyRow]).length, 0);
    const parentRow = rows.find(row => row.actorName === 'SeesawParent');
    const childRow = rows.find(row => row.actorName === 'Seesaw');
    populateNativeSeesawActors(scene, [parentRow]);
    const [child] = populateNativeSeesawActors(scene, [childRow]);
    assert.equal(child.actor.gear.isAttached(), true);
  } finally { scene.rigidWorld.dispose(); }
});

test('scene creates delayed native actors before their first PRE using camera X, independent of view offset', () => {
  const makeRow = (trigger, actorName, x, y) => ({ raw: [trigger, 0, actorName, '', x, y], actorName, label: '', x, y });
  const events = [];
  const map = { width: 80, height: 24, chipSize: 32, table: Array(80 * 24).fill(1) };
  const scene = createNativeGameScene({ stage: { map, autoScroll: 1, autoScrollSpeed: 2,
    createTable: [makeRow(0, 'Goal', 400, 674), makeRow(4, 'Key', 220, 642)] },
    playerCount: 2, createRigidWorld, spawnActor: (scene, spawn) => {
      events.push([spawn.actorName, scene.frame]);
      populateNativeSeesawActors(scene, [spawn]);
    } });
  try {
    scene.viewOffset.x = 100;
    scene.setActive(true);
    assert.deepEqual(events, [['Goal', 0n]]);
    scene.step(); // initial scripted-scroll target0 is cleared before auto-scroll starts
    scene.step(); scene.step();
    assert.equal(scene.viewPosition.x, 4);
    assert.equal(scene.findActor('Key'), null);
    scene.step();
    assert.deepEqual(events, [['Goal', 0n], ['Key', 3n]]);
    const key = scene.findActor('Key');
    assert.deepEqual(key.stepStartPosition, { x: 220, y: 642 }, 'new actor runs PRE in its creation frame');
    assert.equal(scene.creationSchedule.state.cursor, 2);
  } finally { scene.rigidWorld.dispose(); }
});
