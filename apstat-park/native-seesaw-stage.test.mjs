import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { populateNativeSeesawActors } from './native-seesaw-stage.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const f = Math.fround;
const createWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
const stage = stages.find(stage => stage.name === 'stage_seesaw01');
function makeScene() {
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    playerCount: 2, rigidWorld: createWorld({ gravity: { x: 0, y: 10 } }),
    updateCamera() {}, updateOutcomes() {} };
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  return scene;
}

test('loaded backend creates independent synchronous worlds and survives repeated stage replacement', () => {
  const keep = createWorld();
  try {
    const stable = keep.createBody({ type: 2 }).addCircle({ radius: .1, density: 1 });
    stable.setLinearVelocity(1, 0);
    for (let i = 0; i < 20; i++) {
      const world = createWorld({ gravity: { x: 0, y: 10 } });
      const body = world.createBody({ type: 2 }).addCircle({ radius: .1, density: 1 });
      assert.throws(() => world.createRevoluteJoint(stable, body, { x: 0, y: 0 }), /not live/);
      world.step(f(1 / 60));
      assert.ok(body.read().vy > 0);
      world.dispose();
      assert.throws(() => body.read(), /disposed/);
      keep.step(f(1 / 60));
    }
    assert.ok(Math.abs(stable.read().x - 20 / 60) < 1e-6);
    assert.equal(stable.read().vy, 0);
  } finally { keep.dispose(); }
});

test('original stage rows build bound seesaws, Balance, area, switch and a live one-child launcher', () => {
  const snapshots = [];
  for (let reset = 0; reset < 2; reset++) {
    const scene = makeScene();
    try {
      let entries = [];
      scene.sendCommand = (name, command, value) => {
        for (const { actor } of entries) if (actor.name === name) actor.onCommand?.(command, value);
      };
      entries = populateNativeSeesawActors(scene, stage.createTable);
      assert.deepEqual(entries.map(entry => entry.spawn.actorName),
        ['PhysicsSwitch', 'PhysicsArea', 'SeesawParent', 'Seesaw', 'Seesaw', 'Balance', 'PhysicsBallPitcher']);
      const parent = entries[2].actor;
      assert.equal(parent.type, 1);
      assert.deepEqual(entries[3].actor.gear.joint.read(), { ratio: -1 });
      assert.deepEqual(entries[4].actor.gear.joint.read(), { ratio: -1 });
      const balance = entries[5].actor;
      assert.deepEqual(balance.left.position, { x: 190, y: 604 });
      assert.deepEqual(balance.right.position, { x: 1090, y: 604 });
      for (let tick = 0; tick < 240; tick++) stepNativeSceneFrame(scene);
      const ball = entries[6].actor.controller.state.child.actor;
      assert.ok(ball.manager);
      assert.equal(ball.velocity.y, 3);
      assert.ok(Number.isFinite(ball.position.y));
      snapshots.push({ ball: ball.body.body.read(), parent: parent.body.body.read(), frame: scene.frame });
    } finally { scene.rigidWorld.dispose(); }
  }
  assert.deepEqual(snapshots[1], snapshots[0], 'stage reset reproduces the same native mechanism trajectory');
});

test('a seesaw cannot bind to a parent that has not yet been created', () => {
  const scene = makeScene();
  try {
    const rows = stage.createTable.filter(row => ['Seesaw', 'SeesawParent'].includes(row.actorName));
    const entries = populateNativeSeesawActors(scene, [rows[1], rows[0], rows[2]]);
    assert.equal(entries[0].actor.gear.isAttached(), false);
    assert.equal(entries[2].actor.gear.isAttached(), true);
  } finally { scene.rigidWorld.dispose(); }
});
