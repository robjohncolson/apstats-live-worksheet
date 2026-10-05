import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativePhysicsBall } from './native-physics-ball.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));

async function fixture({ discriminator = 1, wall = false } = {}) {
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    rigidWorld: await createNativeRigidWorld({ gravity: wall ? { x: 10, y: 0 } : { x: 0, y: 10 }, moduleOptions: { wasmBinary } }),
    updateCamera() {}, updateOutcomes() {} };
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  const boundary = scene.rigidWorld.createBody(wall ? { x: 1 } : { y: 1 });
  boundary.addBox(wall ? { halfWidth: .1, halfHeight: 10 } : { halfWidth: 10, halfHeight: .1 });
  boundary.userData = { discriminator }; // fixture isolates the native wrapper discriminator gate
  const ball = createNativePhysicsBall();
  queueNativeActor(scene.actorManager, ball, 0, scene);
  return { scene, ball, boundary };
}

test('real vertical-local-normal contact starts 30 subsequent PRE ticks of fade, sleep and deferred removal', async () => {
  const { scene, ball, boundary } = await fixture();
  try {
    let observedTouch = false;
    for (let i = 0; i < 120 && !ball.countdown; i++) {
      observedTouch ||= ball.body.body.readContacts().some(contact => contact.body === boundary && contact.pointCount > 0 && contact.touching);
      stepNativeSceneFrame(scene);
    }
    assert.equal(ball.countdown, 30);
    assert.equal(ball.alphaByte, 255);
    assert.equal(ball.renderScale.x, 1, 'arming does not run the first fade update');
    assert.equal(observedTouch, true, 'PRE receives the contact produced by the preceding physics step');
    const handle = ball.body.body;
    stepNativeSceneFrame(scene);
    assert.equal(ball.countdown, 29);
    assert.equal(ball.renderScale.x, Math.fround(1.0499999523162842));
    for (let i = 0; i < 10; i++) stepNativeSceneFrame(scene);
    assert.equal(ball.countdown, 19);
    assert.equal(ball.alphaByte, 0);
    assert.equal(ball.renderScale.x, Math.fround(Math.pow(1.0499999523162842, 11)));
    for (let i = 0; i < 5; i++) stepNativeSceneFrame(scene);
    assert.equal(ball.countdown, 14);
    assert.equal(handle.read().awake, false);
    assert.equal(handle.read().vy, 0);
    for (let i = 0; i < 13; i++) stepNativeSceneFrame(scene);
    assert.equal(ball.countdown, 1);
    assert.ok(ball.manager);
    stepNativeSceneFrame(scene);
    assert.equal(ball.countdown, 0);
    assert.equal(ball.manager, null);
    assert.equal(ball.body.body, null);
    assert.throws(() => handle.readContacts(), /not live/);
  } finally { scene.rigidWorld.dispose(); }
});

test('ordinary floor discriminator and PhysicsArea side normals do not expire the ball', async () => {
  for (const options of [{ discriminator: 0 }, { discriminator: 1, wall: true }]) {
    const { scene, ball } = await fixture(options);
    try {
      for (let i = 0; i < 180; i++) stepNativeSceneFrame(scene);
      assert.equal(ball.countdown, 0);
      assert.ok(ball.body.body.readContacts().some(contact => contact.touching));
      assert.equal(ball.alphaByte, 255);
    } finally { scene.rigidWorld.dispose(); }
  }
});

test('PhysicsBall uses recovered radius, density, angular damping and rigid pose readback', async () => {
  const { scene, ball } = await fixture({ discriminator: 0 });
  try {
    assert.ok(Math.abs(ball.body.body.read().mass - Math.PI * .12 ** 2 * .1) < 1e-7);
    assert.equal(ball.body.body.read().angularDamping, .5);
    ball.body.setAngularVelocity(2);
    stepNativeSceneFrame(scene);
    assert.deepEqual(ball.position, ball.body.getPosition());
    assert.equal(ball.spriteAngle, Math.trunc(Math.fround(ball.body.getAngle() * Math.fround(10430.3779296875))));
  } finally { scene.rigidWorld.dispose(); }
});
