import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeBalance } from './native-balance-actor.mjs';
import { createNativeWalkController } from './native-walk-controller.mjs';
import { nativePlayerJumpVelocity } from './native-player-jump.mjs';
import { isNativePlayerAirborne, recordNativePlayerCorrection, applyNativePlayerCorrectionVelocity } from './native-player-motion.mjs';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeActorRectangle } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
import { nativePlayerMovementBoundary, applyNativePlayerScrollBoundary,
  checkNativePlayerFallBounds } from './native-player-boundary.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));

async function makeScene() {
  const targets = new Map();
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    playerCount: 2, players: [], viewOffset: { x: 0, y: 0 }, viewScale: 1,
    scrollFlags: 0, scrollLimit: -1, maximumPlayerY: 720, minimumPlayerY: 0,
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    rigidWorld: await createNativeRigidWorld({ moduleOptions: { wasmBinary } }),
    updateCamera() {}, updateOutcomes() {}, sendCommand(name, command, value) { targets.get(name)?.onCommand(command, value); } };
  scene.bodyWorld.collisionMatrix[1] = scene.bodyWorld.collisionMatrix[32] = true;
  scene.scrollMode = 0;
  scene.clipPlayerMovement = (actor, value) => nativePlayerMovementBoundary(scene, actor, value);
  scene.applyPlayerScrollBoundary = (actor, velocity) => applyNativePlayerScrollBoundary(scene, actor, velocity);
  scene.checkPlayerFallBounds = (actor, state) => checkNativePlayerFallBounds(scene, actor, state);
  // This fixture has no named relocation target actor.
  scene.notifyPlayerRelocation = () => {};
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  return { scene, targets };
}

// Actor shell exercises the recovered controller and native solver. Rendering,
// damage/forms and full Player ownership/input modes are not supplied here.
function makeWalker(scene, position) {
  const controller = createNativeWalkController();
  const held = new Set(), pressed = new Set();
  const actor = { flags: 0, playerFlags: 8, bodies: [], components: [], scene,
    position: { ...position }, velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 },
    externalVelocity: { x: 0, y: 0 }, collisionCorrection: { x: 0, y: 0 },
    renderOffset: { x: 0, y: 0 }, gravityDirection: { x: 0, y: 1 },
    inputEnabled: true, inputMode: 0, animation: 0, jumpLimit: 0, speedScale: 1,
    controllerKind: 2, spriteFlags: 8, cameraRelative: true,
    input: { held: key => held.has(key), pressed: key => pressed.has(key) },
    getWalkSpeed() { return Math.fround(3 * actor.speedScale); },
    getJumpVelocity: () => nativePlayerJumpVelocity(),
    setAnimation(value) { actor.animation = value; }, faceDirection() {}, playSound() {},
    onAdded() { runNativeCommonActorAdded(actor, scene); },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    beforeMotion(dt) { controller.pre(actor, dt); actor.collisionCorrection = { x: 0, y: 0 }; },
    afterMotion() { applyNativePlayerCorrectionVelocity(actor); controller.post(actor); },
    onPositionResolved(_position, delta) { recordNativePlayerCorrection(actor, delta); },
    onCommand(command, value) { return controller.receive(actor, command, value); },
  };
  actor.body = createNativeActorRectangle(actor, { x: -16, y: -47, width: 32, height: 46 }, 2, true);
  actor.body.category = 1;
  placeNativeActorBodies(actor, position);
  scene.players.push(actor);
  queueNativeActor(scene.actorManager, actor, 0, scene);
  return { actor, controller, held, pressed };
}

test('integrated walking controller lands on Balance, loads it, jumps, and lands again through native contacts', async () => {
  const { scene } = await makeScene();
  try {
    const balance = createNativeBalance({ position: { x: 640, y: 604 } });
    queueNativeActor(scene.actorManager, balance, 0, scene);
    const { actor, controller, held, pressed } = makeWalker(scene, { x: 1090, y: 570 });
    for (let i = 0; i < 150; i++) stepNativeSceneFrame(scene);
    assert.equal(isNativePlayerAirborne(actor), false);
    assert.equal(balance.right.supportCount, 1);
    assert.ok(balance.right.currentOffset > 40);
    const startY = actor.position.y;
    held.add(2); pressed.add(2);
    stepNativeSceneFrame(scene); pressed.clear();
    assert.equal(controller.state.holdTicks, 1);
    for (let i = 0; i < 12; i++) stepNativeSceneFrame(scene);
    assert.ok(actor.position.y < startY - 40);
    assert.equal(isNativePlayerAirborne(actor), true);
    held.clear();
    for (let i = 0; i < 160; i++) stepNativeSceneFrame(scene);
    assert.equal(isNativePlayerAirborne(actor), false);
    assert.equal(balance.right.supportCount, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('controller commands preserve hold immunity, forced bounce, freeze clearing and speed cap', async () => {
  const { scene } = await makeScene();
  try {
    const { actor, controller } = makeWalker(scene, { x: 100, y: 100 });
    controller.state.holdTicks = 4;
    actor.onCommand(1, { x: 7, y: -9 });
    assert.equal(controller.state.flags, 0);
    controller.state.holdTicks = 0;
    actor.onCommand(1, { x: 7, y: -9 });
    stepNativeSceneFrame(scene);
    assert.deepEqual(actor.velocity, { x: 7, y: -9 });
    assert.equal(actor.onCommand(0x1e, 1), 1);
    assert.deepEqual(actor.velocity, { x: 0, y: 0 });
    stepNativeSceneFrame(scene);
    assert.equal(controller.state.holdTicks, 0);
    assert.equal(controller.state.jumpCount, 0);
    actor.onCommand(0x22, 10);
    assert.equal(actor.speedScale, 2);
    actor.onCommand(0x22, -1);
    assert.equal(actor.speedScale, -2, 'native cap has no lower clamp');
    actor.onCommand(8);
    assert.deepEqual(controller.state.pendingPosition, actor.spawnPosition);
    assert.notDeepEqual(actor.position, actor.spawnPosition, 'test actor has moved before reset');
  } finally { scene.rigidWorld.dispose(); }
});
