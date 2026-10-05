import { createNativeBody, initializeNativeRectangleBody, initializeNativeCircleBody } from './native-body.mjs';
import { attachNativeBody, detachNativeBody, findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;

// bc1d9e0: replicated body IDs search from 0x7fff without advancing the normal
// registry counter. Removed IDs can be reused by a later replicated body.
export function nextNativeReplicatedBodyId(world) {
  let id = 0x7fff;
  while (findNativeBody(world, id)) id = (id + 1) >>> 0;
  return id;
}

function seedReplicatedBodyId(actor, body, world) {
  if (actor.replication?.assignBodyIds && !body.world && !body.id) {
    body.id = nextNativeReplicatedBodyId(world);
  }
}

// bc17170 appends at most five { body, followsActor } records. Actor builders
// check capacity BEFORE allocation; the lower-level attachment still performs
// its callbacks/registration even when the record array is already full.
export function addNativeActorBody(actor, body, followsActor) {
  body.actor = actor;
  body.category = 0;
  if (followsActor) {
    body.onPositionResolved = (position, delta) => resolveNativeActorPosition(actor, position, delta);
    body.onScaleResolved = (x, y) => actor.onScaleResolved?.(x, y);
  }
  if (actor.replication) body.flags |= 0x20;
  if (actor.bodyWorld) {
    seedReplicatedBodyId(actor, body, actor.bodyWorld);
    if (followsActor) {
      // Native uses the placement snapshot +130, not the current transform.
      body.position = { ...actor.spawnPosition };
      body.previousPosition = { ...actor.spawnPosition };
      body.flags &= ~0x40;
    }
    attachNativeBody(actor.bodyWorld, body);
  }
  if (actor.bodies.length < 5) actor.bodies.push({ body, followsActor: Boolean(followsActor) });
  return body;
}

export function createNativeActorRectangle(actor, bounds, type, followsActor) {
  if (actor.bodies.length === 5) return null;
  const body = initializeNativeRectangleBody(createNativeBody(), bounds, type);
  return addNativeActorBody(actor, body, followsActor);
}

export function createNativeActorCircle(actor, circle, type, followsActor) {
  if (actor.bodies.length === 5) return null;
  const body = initializeNativeCircleBody(createNativeBody(), circle, type);
  return addNativeActorBody(actor, body, followsActor);
}

// Body portion of bc165b0. The actor manager sets membership before calling
// this hook. Registration traverses actor body records in their creation order.
export function registerNativeActorBodies(actor, world) {
  for (const { body } of actor.bodies) {
    seedReplicatedBodyId(actor, body, world);
    attachNativeBody(world, body);
  }
}

// bc166f0 detaches bodies before notifying actor components.
export function unregisterNativeActorBodies(actor) {
  for (const { body } of actor.bodies) detachNativeBody(body);
  for (const component of actor.components ?? []) component.onRemoved?.();
}

// bc15b90. renderOffset is actor+138; cameraRelative is actor+90 bit 8.
// The two scene translation vectors are +a8 and +b0. This is a display
// position, not a scale: component +8 receives physics and display positions.
export function nativeActorDisplayPosition(actor) {
  const offset = actor.renderOffset ?? { x: 0, y: 0 };
  let x = f(actor.position.x + offset.x), y = f(actor.position.y + offset.y);
  if (actor.cameraRelative && actor.scene) {
    const { viewPosition, viewOffset } = actor.scene;
    x = f(-f(viewPosition.x + viewOffset.x) + x);
    y = f(-f(viewPosition.y + viewOffset.y) + y);
  }
  return { x, y };
}

// bc17d80 writes the transform, calls actor virtual +e0, computes display
// position after the hook, then calls component +8 with the original body
// position and the new display position. It does not resync sibling bodies.
export function resolveNativeActorPosition(actor, position, delta) {
  actor.position = { x: f(position.x), y: f(position.y) };
  actor.onPositionResolved?.(position, delta);
  const display = nativeActorDisplayPosition(actor);
  for (const component of actor.components ?? []) component.syncPositions?.(position, display);
}
