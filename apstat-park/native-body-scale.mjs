import { nativeBodiesOverlap } from './native-body-overlap.mjs';
import { scaledNativeBounds } from './native-body-support.mjs';
import { moveNativeBodyOnMap } from './native-map-collision.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const GAP = f(.01);
const SCALE_GAP = f(.02); // DAT_7ff72bcbbb28, distinct from positional separation.
const SCALE_TOLERANCE = f(.001);

// bc12760: move one rectangle against another. Unlike the general pair solver,
// this probe does not reject a contact axis using perpendicular swept overlap.
export function moveNativeBodyAgainstBody(body, other, delta) {
  if (body.shape !== 0 || other.shape !== 0) return { accepted: false, movement: { x: 0, y: 0 } };
  const start = { ...body.position };
  const target = { x: f(start.x + delta.x), y: f(start.y + delta.y) };
  setPosition(body, target);
  if (!nativeBodiesOverlap(body, other)) return { accepted: true, movement: { ...delta } };
  const a = bounds(body), b = bounds(other);
  const result = { ...target };
  for (const axis of ['x', 'y']) {
    const motion = delta[axis];
    if (!motion) continue;
    const size = axis === 'x' ? 'width' : 'height';
    const endA = f(a[axis] + a[size]), endB = f(b[axis] + b[size]);
    let fraction = 0, side = 0;
    if (b[axis] >= f(endA - motion)) {
      fraction = f(f(endA - b[axis]) / -motion); side = 1;
    } else if (endB <= f(a[axis] - motion)) {
      fraction = f(f(endB - a[axis]) / motion); side = -1;
    }
    if (!side) continue;
    fraction = Math.max(-1, Math.min(0, fraction));
    let value = f(target[axis] + f(motion * fraction));
    if (Math.abs(fraction) > EPSILON && Math.abs(motion) > EPSILON
      && Math.abs(f(value - target[axis])) <= EPSILON) value = start[axis];
    if (Math.abs(motion) > EPSILON) value = side > 0
      ? Math.max(start[axis], f(value - GAP)) : Math.min(start[axis], f(value + GAP));
    result[axis] = value;
  }
  setPosition(body, result);
  return { accepted: true, movement: subtract(result, start) };
}

// bc1f7b0. Caller has restored acceptedScale and stored the requested scale.
export function resolveNativeScaleChange(world, body) {
  const desired = body.requestedScale, old = { ...body.scale };
  if (old.x > desired.x && old.y > desired.y) {
    applyNativeBodyScale(body, desired);
    return;
  }
  const change = subtract(desired, old);
  if (Math.abs(change.x) <= SCALE_TOLERANCE && Math.abs(change.y) <= SCALE_TOLERANCE) return;
  if (body.shape !== 0) return;
  const origin = { ...body.position }, oldBounds = bounds(body);
  applyNativeBodyScale(body, desired);
  if (!(body.type & 2)) return;
  const desiredBounds = bounds(body);
  applyNativeBodyScale(body, body.acceptedScale);
  const scaleDelta = subtract(desired, body.scale);
  const before = corners(oldBounds), after = corners(desiredBounds);
  const movements = before.map((point, index) => subtract(after[index], point));
  let fraction = 1;
  for (const delta of movements) {
    let actual;
    if (world.moveMap) actual = world.moveMap(body, delta, false);
    else if (world.map || !(body.type & 1)) actual = moveNativeBodyOnMap(world.map, body, delta, false);
    else throw new Error('Native scale change requires map movement');
    setPosition(body, origin);
    fraction = restrictFraction(fraction, delta, actual);
  }
  for (const other of world.bodies) {
    if (other === body || !(other.flags & 1) || !(other.type & 2)) continue;
    // Native exits this whole scale-resolution routine for a non-rectangle
    // candidate before checking its category or distance.
    if (other.shape !== 0) return;
    if (body.category < 0 || body.category >= 32 || other.category < 0 || other.category >= 32) continue;
    if (!world.collisionMatrix[body.category * 32 + other.category]) continue;
    if (nativeBodiesOverlap(body, other)) continue;
    // The binary repeats the same overlap query here; neither query mutates.
    for (const delta of movements) {
      const result = moveNativeBodyAgainstBody(body, other, delta);
      setPosition(body, origin);
      fraction = restrictFraction(fraction, delta, result.movement);
    }
  }
  const scale = { x: f(body.scale.x + f(scaleDelta.x * fraction)),
    y: f(body.scale.y + f(scaleDelta.y * fraction)) };
  if (Math.abs(f(fraction - 1)) > EPSILON) {
    for (const axis of ['x', 'y']) scale[axis] = scaleDelta[axis] > 0
      ? Math.max(body.acceptedScale[axis], f(scale[axis] - SCALE_GAP))
      : Math.min(body.acceptedScale[axis], f(scale[axis] + SCALE_GAP));
  }
  applyNativeBodyScale(body, scale);
}

export function applyNativeBodyScale(body, scale) {
  if (!body.rawBounds) throw new Error('Native scale change requires raw body bounds');
  body.scale = { ...scale };
  body.localBounds = scaledNativeBounds(body.rawBounds, body.scale, body.pivot);
}

function restrictFraction(fraction, requested, actual) {
  for (const axis of ['x', 'y']) {
    if (Math.abs(requested[axis]) > SCALE_TOLERANCE) {
      fraction = Math.max(0, Math.min(fraction, f(actual[axis] / requested[axis])));
    }
  }
  return fraction;
}

function corners(rect) {
  const right = f(rect.x + rect.width), bottom = f(rect.y + rect.height);
  return [{ x: rect.x, y: rect.y }, { x: rect.x, y: bottom }, { x: right, y: rect.y }, { x: right, y: bottom }];
}

function bounds(body) {
  return { ...body.localBounds, x: f(body.localBounds.x + body.position.x), y: f(body.localBounds.y + body.position.y) };
}

function subtract(a, b) { return { x: f(a.x - b.x), y: f(a.y - b.y) }; }

function setPosition(body, position) {
  body.position = { ...position };
  const delta = subtract(position, body.previousPosition);
  body.flags = Math.abs(delta.x) > EPSILON || Math.abs(delta.y) > EPSILON ? body.flags | 0x40 : body.flags & ~0x40;
}
