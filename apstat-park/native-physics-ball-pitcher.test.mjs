import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativePhysicsArea } from './native-physics-area.mjs';
import { createNativePhysicsBallPitcher } from './native-physics-ball-pitcher.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const f = Math.fround;
async function makeScene() {
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    rigidWorld: await createNativeRigidWorld({ gravity: { x: 0, y: 10 }, moduleOptions: { wasmBinary } }),
    updateCamera() {}, updateOutcomes() {} };
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  return scene;
}

function pitcher(scene, partySize) {
  const actor = createNativePhysicsBallPitcher({ partySize,
    spawn: { x: 100, y: 20, raw: [0, 0, 'PhysicsBallPitcher', '', 100, 20, 180, 30, 30, 30, 30, 30, 30, 30] } });
  queueNativeActor(scene.actorManager, actor, 0, scene);
  return actor;
}

test('launcher queues one ball with actor velocity but no initial rigid velocity', async () => {
  for (const partySize of [1, 2, 8]) {
    const scene = await makeScene();
    try {
      const owner = pitcher(scene, partySize);
      assert.equal(owner.body.category, 4);
      assert.equal(owner.bodies[0].followsActor, true);
      stepNativeSceneFrame(scene);
      assert.equal(owner.controller.state.child, null);
      stepNativeSceneFrame(scene);
      const ball = owner.controller.state.child.actor;
      assert.equal(ball.velocity.y, partySize === 1 ? 5 : f(f(30) * f(.1)));
      assert.equal(ball.components.length, 1);
      assert.equal(ball.stepStartPosition, undefined, 'spawned during PRE; own PRE starts next frame');
      assert.equal(ball.body.body.read().vx, 0, 'constructor component list is empty during launch');
      assert.ok(Math.abs(ball.body.body.read().vy - f(10 * f(1 / 60))) < 1e-6);
      stepNativeSceneFrame(scene);
      assert.ok(Math.abs(ball.position.x - 100) < 1e-4);
      assert.ok(ball.position.y < 41, 'POST uses the rigid trajectory, not actor launch speed');
      for (let i = 0; i < 60; i++) stepNativeSceneFrame(scene);
      assert.equal(owner.controller.state.child.actor, ball);
    } finally { scene.rigidWorld.dispose(); }
  }
});

test('area expiry removes the child before the owner clears and replaces it on separate frames', async () => {
  const scene = await makeScene();
  try {
    const area = createNativePhysicsArea({ width: 200, height: 100 });
    queueNativeActor(scene.actorManager, area, 0, scene);
    const owner = pitcher(scene, 2);
    stepNativeSceneFrame(scene); stepNativeSceneFrame(scene);
    const first = owner.controller.state.child.actor;
    for (let i = 0; i < 180 && first.manager; i++) stepNativeSceneFrame(scene);
    assert.equal(first.manager, null);
    assert.equal(first.body.body, null);
    assert.equal(owner.controller.state.child.actor, first);
    stepNativeSceneFrame(scene);
    assert.equal(owner.controller.state.child, null);
    stepNativeSceneFrame(scene);
    const second = owner.controller.state.child.actor;
    assert.notEqual(second, first);
    assert.ok(second.manager);
    assert.equal(second.countdown, 0);
  } finally { scene.rigidWorld.dispose(); }
});
