import { solveNativeBodyPairs } from './native-body-world.mjs';
import { finalizeNativeActorContacts, dispatchNativeOverlapCallbacks } from './native-body-contacts.mjs';
import { moveNativeBodyOnMap, finalizeNativeMapContacts } from './native-map-collision.mjs';
import { applyNativeBodyScale, resolveNativeScaleChange } from './native-body-scale.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

// bc1da80. world.bodies must already have native registration order. This pass
// does not replace actor PRE/POST updates or native registration itself.
export function stepNativeBodyWorld(world) {
  const changedScale = [];
  for (const body of world.bodies) {
    body.flags &= ~8;
    body.passPosition = { ...body.position };
    if (different(body.scale, body.acceptedScale)) {
      body.requestedScale = { ...body.scale };
      applyNativeBodyScale(body, body.acceptedScale);
      if (changedScale.length < 32) changedScale.push(body);
    }
  }
  if (world.map) {
    for (const body of world.bodies) {
      if ((body.flags & 0x41) !== 0x41 || !(body.type & 1)) continue;
      const delta = subtract(body.position, body.previousPosition);
      body.position = { ...body.previousPosition };
      body.flags &= ~0x40;
      if (world.moveMap) world.moveMap(body, delta, true);
      else moveNativeBodyOnMap(world.map, body, delta);
    }
  }
  const pairWorld = world.moveMap ? world : { ...world,
    moveMap: (body, delta, slide = true) => moveNativeBodyOnMap(world.map, body, delta, slide) };
  solveNativeBodyPairs(pairWorld, { resetPriority: false });
  world.afterPairs?.();
  for (const body of changedScale) resolveNativeScaleChange(world, body);
  for (const body of world.bodies) finalizeNativeBody(world, body);
  dispatchNativeOverlapCallbacks(world);
}

// bc146c0. Report solver corrections before contact callbacks. Actor movement
// was snapshotted on entry to the pass, so the position callback receives only
// this pass's correction, not the actor's full per-frame movement.
export function finalizeNativeBody(world, body) {
  body.previousPosition = { ...body.position };
  body.flags &= ~0x40;
  if (different(body.scale, body.requestedScale)) body.onScaleResolved?.(body.scale.x, body.scale.y);
  body.acceptedScale = { ...body.scale };
  body.requestedScale = { ...body.scale };
  const delta = subtract(body.position, body.passPosition);
  const distanceSquared = f(f(delta.x * delta.x) + f(delta.y * delta.y));
  if (Math.abs(distanceSquared) > EPSILON) {
    body.onPositionResolved?.(body.position, delta);
    body.passPosition = { ...body.position };
  }
  finalizeNativeActorContacts(world, body);
  finalizeNativeMapContacts(body);
}

function different(a, b) {
  return Math.abs(f(a.x - b.x)) > EPSILON || Math.abs(f(a.y - b.y)) > EPSILON;
}

function subtract(a, b) { return { x: f(a.x - b.x), y: f(a.y - b.y) }; }
