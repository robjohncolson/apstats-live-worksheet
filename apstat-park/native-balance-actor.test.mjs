import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeBalance } from './native-balance-actor.mjs';
import { createNativeSeesaw } from './native-seesaw.mjs';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));

async function makeScene() {
  const targets = new Map();
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    playerCount: 2, actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    rigidWorld: await createNativeRigidWorld({ moduleOptions: { wasmBinary } }),
    updateCamera() {}, updateOutcomes() {}, sendCommand(name, command, value) { targets.get(name)?.onCommand(command, value); } };
  scene.bodyWorld.collisionMatrix[1] = scene.bodyWorld.collisionMatrix[32] = true;
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  return { scene, targets };
}

// A falling category-1 test actor, not a reconstruction of the Player controller.
function makeRider(position) {
  const actor = { flags: 0, bodies: [], components: [], position: { ...position },
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 1 }, renderOffset: { x: 0, y: 0 } };
  actor.body = createNativeActorRectangle(actor, { x: -8, y: -16, width: 16, height: 16 }, 2, true);
  actor.body.category = 1;
  actor.onPositionResolved = (_, delta) => { if (delta.y) actor.velocity.y = 0; };
  actor.onAdded = scene => { actor.scene = scene; runNativeCommonActorAdded(actor, scene); };
  actor.onPre = dt => runNativeCommonActorPre(actor, dt);
  actor.onPost = dt => runNativeCommonActorPost(actor, dt);
  placeNativeActorBodies(actor, position);
  return actor;
}

test('Balance queues two following-body platforms at span endpoints and corrections update their height offsets', async () => {
  const { scene } = await makeScene();
  try {
    const balance = createNativeBalance({ span: 900, position: { x: 640, y: 604 } });
    queueNativeActor(scene.actorManager, balance, 0, scene);
    assert.deepEqual(balance.left.position, { x: 190, y: 604 });
    assert.deepEqual(balance.right.position, { x: 1090, y: 604 });
    assert.equal(scene.bodyWorld.bodies.length, 2);
    assert.deepEqual(balance.left.body.rawBounds, { x: -97, y: -7, width: 194, height: 14 });
    assert.deepEqual(balance.left.body.previousPosition, balance.left.position);
    balance.left.body.onPositionResolved({ x: 190, y: 590 }, { x: 0, y: -14 });
    assert.equal(balance.left.currentOffset, -14);
    stepNativeSceneFrame(scene);
    assert.equal(scene.actorManager.pending, null);
  } finally { scene.rigidWorld.dispose(); }
});

test('actual custom-body contacts drive Balance platforms and command-coupled rigid seesaws in one native scene', async () => {
  const { scene, targets } = await makeScene();
  try {
    const parent = createNativeSeesaw({ parent: true, position: { x: 640, y: 358 } });
    const child = createNativeSeesaw({ type: 2, position: { x: 640, y: 258 } });
    child.connectParent(parent);
    targets.set('SeesawParent', parent);
    queueNativeActor(scene.actorManager, parent, 0, scene);
    queueNativeActor(scene.actorManager, child, 0, scene);
    const balance = createNativeBalance({ name: 'BalanceSeesawParent', span: 900, position: { x: 640, y: 604 } });
    queueNativeActor(scene.actorManager, balance, 0, scene);
    const rider = makeRider({ x: 1090, y: 590 });
    queueNativeActor(scene.actorManager, rider, 0, scene);
    for (let i = 0; i < 240; i++) stepNativeSceneFrame(scene);
    assert.equal(balance.right.supportCount, 1);
    assert.equal(balance.left.supportCount, 0);
    assert.ok(balance.right.currentOffset > 50);
    assert.ok(balance.left.currentOffset < -50);
    assert.ok(parent.body.getAngle() > .11 && parent.body.getAngle() < .13);
    assert.ok(Math.abs(child.body.getAngle() - parent.body.getAngle()) < 1e-5);
    assert.ok(Math.abs(rider.position.y - (balance.right.position.y - 7)) < .1);
  } finally { scene.rigidWorld.dispose(); }
});
