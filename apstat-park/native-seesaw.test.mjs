import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeSeesaw } from './native-seesaw.mjs';
import { createNativeActorManager, queueNativeActor, removeNativeActor } from './native-actor-manager.mjs';
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

test('all three native seesaw shapes attach at actor position with matching ground anchors and material mass', async () => {
  for (const type of [0, 1, 2]) {
    const scene = await makeScene();
    try {
      const actor = createNativeSeesaw({ type, position: { x: 1200, y: -400 } });
      queueNativeActor(scene.actorManager, actor, 0, scene);
      assert.deepEqual(actor.body.getPosition(), { x: 1200, y: -400 });
      assert.deepEqual(actor.pivot.joint.read().anchorA, { x: 12, y: -4 });
      assert.deepEqual(actor.pivot.joint.read().anchorB, { x: 0, y: 0 });
      assert.ok(Math.abs(actor.body.body.read().mass - (type === 0 ? 1.2 : .9)) < 1e-6);
      assert.equal(actor.pivot.joint.read().upper, f(.1745329201221466));
      stepNativeSceneFrame(scene);
      assert.deepEqual(actor.position, { x: 1200, y: -400 });
      assert.equal(actor.body.body.read().vy, 0, 'seesaw gravity scale is zero');
      assert.equal(actor.body.owner, actor);
    } finally { scene.rigidWorld.dispose(); }
  }
});

test('native scene PRE drives parent target and POST reads coupled planks back into actor/render state', async () => {
  const scene = await makeScene();
  try {
    const parent = createNativeSeesaw({ parent: true, position: { x: 600, y: -300 } });
    const child = createNativeSeesaw({ type: 1, position: { x: 1200, y: -300 } });
    child.connectParent(parent);
    queueNativeActor(scene.actorManager, parent, 0, scene);
    queueNativeActor(scene.actorManager, child, 0, scene);
    parent.setTargetAngle(.1);
    for (let i = 0; i < 120; i++) stepNativeSceneFrame(scene);
    assert.ok(Math.abs(parent.body.getAngle() - .1) < 1e-5);
    assert.ok(Math.abs(child.body.getAngle() - parent.body.getAngle()) < 1e-5);
    assert.equal(child.spriteAngle, Math.trunc(f(child.body.getAngle() * f(10430.3779296875))));
    assert.deepEqual(child.position, child.body.getPosition());
    assert.ok(Math.abs(parent.position.x - 600) < .001);
    assert.ok(Math.abs(child.position.x - 1200) < .001);
    removeNativeActor(child);
    assert.equal(child.gear.isAttached(), false);
    assert.equal(child.pivot.isAttached(), false);
    assert.equal(parent.pivot.isAttached(), true);
    stepNativeSceneFrame(scene);
  } finally { scene.rigidWorld.dispose(); }
});

test('body component consumes native velocity input and reattachment takes the new actor placement', async () => {
  const scene = await makeScene();
  try {
    const actor = createNativeSeesaw();
    queueNativeActor(scene.actorManager, actor, 0, scene);
    const velocity = { x: 123, y: -456 };
    actor.components[0].consumeVelocity(velocity);
    assert.deepEqual(velocity, { x: 0, y: 0 });
    assert.equal(actor.body.body.read().vx, f(123 * f(.01)));
    stepNativeSceneFrame(scene);
    removeNativeActor(actor);
    actor.position = { x: 800, y: -200 };
    queueNativeActor(scene.actorManager, actor, 0, scene);
    assert.deepEqual(actor.body.getPosition(), actor.position);
    assert.deepEqual(actor.pivot.joint.read().anchorA, { x: 8, y: -2 });
  } finally { scene.rigidWorld.dispose(); }
});
