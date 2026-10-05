import { runNativeActorPre, runNativeActorPost } from './native-actor-manager.mjs';
import { stepNativeBodyWorld } from './native-body-pass.mjs';

export const NATIVE_FRAME_SECONDS = Math.fround(1 / 60); // bc7d790

// bc1b830's frame boundaries. Scene-specific input, STEP and presentation
// implementations remain explicit callbacks; this is not a complete GameScene.
export function stepNativeSceneFrame(scene) {
  const dt = NATIVE_FRAME_SECONDS;
  scene.previousViewPosition = { ...scene.viewPosition }; // +a0 <- +a8
  scene.beforeFrame?.(dt); // scene virtual +28, even when inactive
  if (!scene.inputOwner) scene.updateInputs?.(dt, scene.frame);
  if (scene.flags & 0x20) {
    if (scene.flags & 0x200) scene.prepareHistory?.();
    runNativeActorPre(scene.actorManager, dt);
  }
  scene.onStep(dt); // scene virtual +30, called regardless of active bit
  if (scene.flags & 0x20) {
    runNativeActorPost(scene.actorManager, dt);
    scene.afterActorPost?.(dt); // remaining presentation work in bc1b830
  }
  scene.frame = BigInt.asUintN(64, scene.frame + 1n);
  if (scene.highestFrame < scene.frame) scene.highestFrame = scene.frame;
}

// bb7bbe0 STEP ordering. The two physics systems are separate: Box2D +51950
// is stepped with 10 velocity AND 10 position iterations (raw bbe773d..7746),
// then the custom registered-body world +51948 runs. Required callbacks avoid
// accidentally treating absent rigid-body/camera/outcome code as native parity.
export function stepNativeGameScenePhysics(scene, dt) {
  if (!(scene.flags & 0x20)) return;
  if (typeof scene.rigidWorld?.step !== 'function') throw new Error('Native GameScene requires a rigid-body world step');
  if (typeof scene.updateCamera !== 'function' || typeof scene.updateOutcomes !== 'function') {
    throw new Error('Native GameScene requires camera and outcome processing');
  }
  scene.updateGameTimer?.(dt); // caller implements bb7bbe0's timer/ownership gates
  scene.rigidWorld.step(dt, 10, 10);
  stepNativeBodyWorld(scene.bodyWorld);
  scene.updateCamera(); // bb7c150, plus following visible-column update
  scene.updateOutcomes(); // clear/retry/player-order work at the tail of STEP
}
