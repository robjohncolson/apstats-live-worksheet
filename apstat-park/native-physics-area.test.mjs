import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativePhysicsArea } from './native-physics-area.mjs';
import { createNativePhysicsBall } from './native-physics-ball.mjs';
import { rayCastNativeRigidWorld } from './native-rigid-raycast.mjs';
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

test('PhysicsArea truncates rectangle params, creates four independent edges, and preserves native fixture order', async () => {
  const scene = await makeScene();
  try {
    const area = createNativePhysicsArea({ position: { x: 100, y: 200 }, x: 10.9, y: 20.9, width: 80.9, height: 60.9 });
    queueNativeActor(scene.actorManager, area, 0, scene);
    const expected = [[[90, 20], [10, 20]], [[90, 80], [90, 20]], [[10, 80], [90, 80]], [[10, 20], [10, 80]]];
    for (let i = 0; i < 4; i++) {
      const edge = area.body.body.readEdgeFixture(i);
      const [start, end] = expected[i].map(([x, y]) => ({ x: f(x * f(.01)), y: f(y * f(.01)) }));
      assert.deepEqual(edge, { start, end, hasPrevious: false, hasNext: false });
    }
    assert.equal(area.body.body.readEdgeFixture(4), null);
    assert.equal(area.body.body.read().mass, 0);
    assert.equal(area.body.discriminator, 1);
    const start = { x: 150, y: 250 };
    for (const [end, axis, coordinate] of [[{ x: 100, y: 250 }, 'x', 110], [{ x: 200, y: 250 }, 'x', 190],
      [{ x: 150, y: 200 }, 'y', 220], [{ x: 150, y: 300 }, 'y', 280]]) {
      const hit = rayCastNativeRigidWorld(scene.rigidWorld, start, end);
      assert.equal(hit.body, area.body);
      assert.ok(Math.abs(hit.position[axis] - coordinate) < 1e-4);
    }
  } finally { scene.rigidWorld.dispose(); }
});

test('actual PhysicsArea bottom edges arm ball expiry while PhysicsRect edges retain the ball', async () => {
  for (const areaType of [true, false]) {
    const scene = await makeScene();
    try {
      const area = createNativePhysicsArea({ width: 200, height: 100, area: areaType });
      queueNativeActor(scene.actorManager, area, 0, scene);
      const ball = createNativePhysicsBall({ position: { x: 100, y: 40 } });
      queueNativeActor(scene.actorManager, ball, 0, scene);
      let armed = false;
      for (let i = 0; i < 180; i++) { stepNativeSceneFrame(scene); armed ||= ball.countdown === 30; }
      assert.equal(armed, areaType);
      if (areaType) assert.equal(ball.manager, null);
      else {
        assert.ok(ball.manager);
        assert.ok(ball.position.y > 87 && ball.position.y < 89);
      }
    } finally { scene.rigidWorld.dispose(); }
  }
});
