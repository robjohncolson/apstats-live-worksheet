import { createNativeRigidBody, createNativeRigidPolyline } from './native-rigid-body.mjs';
import { createNativeRigidBodyComponent } from './native-rigid-components.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { unregisterNativeActorBodies } from './native-actor-bodies.mjs';
const f = Math.fround;
function integerParameter(value) {
  const number = f(value);
  if (!Number.isFinite(number) || number < -2147483648 || number >= 2147483648) return -2147483648;
  return Math.trunc(number) | 0; // native float -> signed int -> float
}

// bb56400/bb77970 share bb56520's rectangle-to-edge-list setup. Bounds use
// positive Y directly; unlike the rigid polygon wrapper there is no Y flip.
export function createNativePhysicsArea({ position = { x: 0, y: 0 },
  x = 0, y = 0, width = 0, height = 0, area = true } = {}) {
  x = integerParameter(x); y = integerParameter(y);
  width = integerParameter(width); height = integerParameter(height);
  const right = f(x + width), bottom = f(y + height);
  const body = createNativeRigidBody({ shape: createNativeRigidPolyline({ density: 1, friction: 1,
    points: [{ x, y }, { x, y: bottom }, { x: right, y: bottom }, { x: right, y }, { x, y }] }) });
  body.discriminator = area ? 1 : 0;
  const actor = {
    body, scene: null, flags: 0, bodies: [], components: [],
    position: { x: f(position.x), y: f(position.y) },
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
  };
  actor.components.push(createNativeRigidBodyComponent(actor, body));
  return actor;
}
