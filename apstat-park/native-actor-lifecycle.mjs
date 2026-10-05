import { advanceNativeActorMotion, syncNativeActorBodies } from './native-actor-motion.mjs';
import { nativeActorDisplayPosition, registerNativeActorBodies } from './native-actor-bodies.mjs';
const f = Math.fround;

function syncNativeActorComponents(actor) {
  const position = { ...actor.position };
  const display = nativeActorDisplayPosition(actor);
  for (const component of actor.components ?? []) component.syncPositions?.(position, display);
}

// bc16120, actor virtual +10. beforeMotion is the actor-specific +c8 hook.
export function runNativeCommonActorPre(actor, dt) {
  actor.renderOffset = { x: 0, y: 0 }; // +138
  actor.stepStartPosition = { ...actor.position }; // XY of transform +100
  actor.previousVelocity = { ...actor.velocity }; // +110
  actor.beforeMotion?.(dt);
  advanceNativeActorMotion(actor);
  syncNativeActorComponents(actor);
}

// bc162a0, actor virtual +18. Alternate motion is limited by +3a4; its
// successful branch increments +3a0 twice and deliberately keeps renderOffset.
export function runNativeCommonActorAlternatePre(actor, dt) {
  const previous = actor.alternateTicks ?? 0;
  const next = (previous + 1) >>> 0;
  actor.alternateTicks = next;
  if (!(actor.flags & 4) || !(actor.motionFlags & 0x20) || (actor.alternateLimit ?? 0) < next) {
    actor.beforeAlternateMotion?.(dt); // actor-specific virtual +d0
    return;
  }
  actor.alternateTicks = (previous + 2) >>> 0;
  actor.stepStartPosition = { ...actor.position };
  actor.previousVelocity = { ...actor.velocity };
  actor.beforeAlternateMotion?.(dt);
  advanceNativeActorMotion(actor);
  syncNativeActorComponents(actor);
}

// bc16460, actor virtual +20. afterMotion is +d8. Displacement includes
// collision correction and actor-specific POST motion, not just PRE velocity.
export function runNativeCommonActorPost(actor, dt) {
  actor.afterMotion?.(dt);
  syncNativeActorBodies(actor);
  actor.frameDisplacement = { x: f(actor.position.x - actor.stepStartPosition.x),
    y: f(actor.position.y - actor.stepStartPosition.y) }; // +f8
  syncNativeActorComponents(actor);
  actor.postResetVector = { x: 0, y: 0 }; // native scratch vector +120
  if (!(actor.manager.flags & 8)) actor.alternateTicks = 0;
}

// bc165b0's GameScene branch: body registration precedes component +18.
// Membership/placement are established by the scene before this on-added hook.
export function runNativeCommonActorAdded(actor, scene) {
  registerNativeActorBodies(actor, scene.bodyWorld);
  for (const component of actor.components ?? []) component.onAdded?.(scene, { ...actor.position }, 0);
}
