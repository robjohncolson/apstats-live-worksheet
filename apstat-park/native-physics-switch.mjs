import { rayCastNativeRigidWorld } from './native-rigid-raycast.mjs';
import { nativeActorDisplayPosition, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb74f1f selects Switch mode 2, style 0 with default flags. This local
// PhysicsSwitch variant has no custom body and never clears its press latch.
// Other Switch modes/configuration flags have separate contact semantics.
export function createNativePhysicsSwitch({ name = 'PhysicsSwitch', position = { x: 0, y: 0 } } = {}) {
  const actor = {
    name: name.slice(0, 31), scene: null, flags: 0, bodies: [], components: [],
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    pressed: false, previousPressed: false,
    spriteBounds: { x: -16, y: -32, width: 32, height: 32 },
    spriteUV: { x: .15625, y: .4375, width: .015625, height: .015625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
    beforeMotion() {
      // bb5eef0 publishes the previous latch before performing this frame's
      // ray. bb5ebb0 strips through "Switch" and sends command 9, payload 0.
      actor.spriteUV.x = actor.pressed ? .171875 : .15625;
      if (actor.pressed && !actor.previousPressed) {
        const prefix = actor.name.indexOf('Switch');
        if (prefix >= 0) actor.scene.sendCommand(actor.name.slice(prefix + 6), 9, 0);
        actor.scene.playSound?.('switch');
      }
      actor.previousPressed = actor.pressed;
      const start = nativeActorDisplayPosition(actor);
      const end = { x: start.x, y: f(start.y - 16) };
      if (rayCastNativeRigidWorld(actor.scene.rigidWorld, start, end)) actor.pressed = true;
    },
  };
  placeNativeActorBodies(actor, position);
  return actor;
}
