import { nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { findNativeBody } from './native-body-registry.mjs';
import { syncNativeActorBodies } from './native-actor-motion.mjs';

const f = Math.fround;
const EPSILON = 2 ** -23;
const MAX_FLOAT = f(3.4028234663852886e38);

// bb7cd20: only category-1 UP neighbors extend the moving stack. Native
// recursion stops at depth 64; it does not globally deduplicate descendants.
export function nativeStackMovementExtreme(body, movement, depth = 0) {
  let extreme = nativeActorDisplayPosition(body.actor).x;
  const neighbors = body.world ? body.contacts.filter(({ normal }) =>
    Math.abs(f(normal.x)) <= EPSILON && Math.abs(f(normal.y + 1)) <= EPSILON)
    .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean) : [];
  if (neighbors.length > 16) throw new Error('Native stack boundary pointer capacity exceeded');
  for (const neighbor of neighbors) {
    if (neighbor.category !== 1) continue;
    if (depth > 63) return extreme;
    const x = nativeActorDisplayPosition(neighbor.actor).x;
    const recursive = nativeStackMovementExtreme(neighbor, movement, depth + 1);
    extreme = movement <= 0 ? Math.min(extreme, x, recursive) : Math.max(extreme, x, recursive);
  }
  return extreme;
}

// bb7ca90 with display-position mode and null velocity outputs. Walking
// players whose sprite bit8 is clear are omitted; other controller kinds stay.
// scene.cameraAnchor represents the additional actor pointer at +6b2a8.
export function nativePlayerDisplayRange(scene) {
  let min = MAX_FLOAT, max = -MAX_FLOAT;
  for (const player of scene.players) {
    if (player.controllerKind === 2 && !(player.spriteFlags & 8)) continue;
    const x = nativeActorDisplayPosition(player).x;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  if (scene.cameraAnchor) {
    const x = nativeActorDisplayPosition(scene.cameraAnchor).x;
    min = Math.min(min, x);
    max = Math.max(max, x);
  }
  return { min, max };
}

// bb7b700. The negative-motion branch is intentionally asymmetric. Keep
// native single-precision intermediates, including negative available space.
export function nativePlayerMovementBoundary(scene, actor, movement) {
  movement = f(movement);
  if (Math.abs(movement) <= EPSILON) return 0;
  const extreme = nativeStackMovementExtreme(actor.bodies[0].body, movement);
  const width = f(1280 / scene.viewScale);
  const next = f(extreme + movement);
  const viewLeft = f(scene.viewOffset.x + scene.viewPosition.x);
  const fixed = (scene.scrollMode & 0xfffffffd) === 0 || scene.players.length === 1 ||
    (scene.scrollLimit >= 0 && scene.scrollLimit < f(viewLeft + movement));
  if (fixed) {
    if (next < 0) return f(-extreme);
    if (next > width) return f(width - extreme);
    return movement;
  }
  const { min, max } = nativePlayerDisplayRange(scene);
  const available = f(f(width - 32) - f(max - min));
  if (movement >= 0) return max < next && available <= movement ? available : movement;
  if (next >= min) return movement;
  return Math.max(f(-available), f(next - min));
}

// bb7b610. This is distance per frame, not dt-scaled velocity. The native
// unsigned map-width product can wrap; an already overscrolled map returns
// a negative correction rather than silently clamping it to zero.
export function nativeAutoScrollSpeed(scene) {
  if (scene.scrollMode !== 2 || ((scene.flags & 0x100) && scene.networkMode === 1)) return 0;
  if (scene.players.some(player => player.controllerKind === 3)) return 0;
  const width = f(1280 / scene.viewScale);
  const right = f(f(scene.viewOffset.x + scene.viewPosition.x) + width);
  let mapRight = f(f(Math.imul(scene.mapWidth, scene.chipSize) >>> 0) + scene.mapOffset);
  if (scene.scrollFlags & 8) mapRight = f(right + width);
  return Math.min(f(scene.scrollSpeed), f(mapRight - right));
}

// bb6f0e0 tail, bb67800 and bc11800. Pending relocation suppresses death
// even for replicated actors. stageRetryEligible is the result of the native
// stage-registry lookup bb7b8a0, not an assumption that every scene can retry.
export function checkNativePlayerFallBounds(scene, actor, state) {
  const y = actor.position.y;
  if (!(y > scene.maximumPlayerY || (scene.minimumPlayerY < 0 && y < scene.minimumPlayerY))) return;
  const pending = state.pendingPosition;
  const lengthSquared = f(f(pending.x * pending.x) + f(pending.y * pending.y));
  if (Math.abs(lengthSquared) > EPSILON) {
    actor.velocity = { x: 0, y: 0 };
    for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
    actor.acceleration = { x: 0, y: 0 };
    return;
  }
  if (actor.networkOwner && scene.networkMode === 1) return;
  actor.onCommand(4);
  actor.fallState = 1;
  if (scene.stageRetryEligible) scene.flags |= 2;
}

// bb34f30 -> bc17330/bc16780, direction3 and options [1,0,1,0,0,0,2].
// Unlike Balance's UP carry, this follows RIGHT contacts and only category1.
export function carryNativeScrollNeighbors(actor, movement) {
  const direction = { x: 1, y: 0 };
  const delta = { x: f(movement.x), y: f(movement.y) };
  const visited = new Set();
  function carryFrom(carrier) {
    const body = carrier.bodies[0]?.body;
    if (!body?.world) return;
    const neighbors = body.contacts.filter(({ normal }) =>
      Math.abs(f(normal.x - 1)) <= EPSILON && Math.abs(f(normal.y)) <= EPSILON)
      .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean);
    if (neighbors.length > 16) throw new Error('Native scroll carry contact capacity exceeded');
    for (const neighbor of neighbors) {
      if ((neighbor.flags & 16) || (neighbor.category & 31) !== 1) continue;
      const rider = neighbor.actor;
      if (!rider) throw new Error('Native scroll carry requires an owning actor');
      if (visited.has(rider)) continue;
      if (visited.size === 100) throw new Error('Native scroll carry pointer capacity exceeded');
      visited.add(rider);
      rider.position = { x: f(rider.position.x + delta.x), y: f(rider.position.y + delta.y) };
      syncNativeActorBodies(rider);
      rider.postResetVector = { ...delta };
      rider.onCarried?.({ ...delta }, direction, visited);
      carryFrom(rider);
    }
  }
  carryFrom(actor);
}

// bb6f0e0 scroll branch, before grounded/gravity handling. Death checks the
// original display X and corrected velocity; bb67710 returns fixed width64.
export function applyNativePlayerScrollBoundary(scene, actor, velocity) {
  if (scene.scrollMode !== 2 && !(scene.scrollFlags & 0x1000)) return;
  const x = nativeActorDisplayPosition(actor).x;
  const amount = f(f(x + velocity.x) - nativeAutoScrollSpeed(scene));
  if (amount < 0) {
    velocity.x = f(velocity.x - amount);
    carryNativeScrollNeighbors(actor, { x: f(-x), y: 0 });
  }
  if (f(f(32 + x) - velocity.x) < 0 && actor.canReceiveDamage()) actor.onCommand(4);
}
