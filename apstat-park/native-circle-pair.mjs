import { nativeBodiesOverlap, nativeCircleCenter } from './native-body-overlap.mjs';

// bc1f1c0: circle-pair positional response. Mass/velocity response is an actor
// callback, not part of this solver. Preserve every scalar float32 operation.
const f = Math.fround;
const EPSILON = 2 ** -23;
const ZERO_MOTION = 2 ** -52;
const GAP = f(.001);

export function resolveNativeCirclePair(a, b) {
  const unchanged = { positionA: { ...a.position }, positionB: { ...b.position }, contactsA: [], contactsB: [] };
  if (!nativeBodiesOverlap(a, b)) return { ...unchanged, status: 'separate' };
  if (nativeBodiesOverlap(a, b, { previous: true })) return { ...unchanged, status: 'previous-overlap' };
  let deltaA = subtract(a.position, a.previousPosition);
  let deltaB = subtract(b.position, b.previousPosition);
  const directionA = normalized(deltaA), directionB = normalized(deltaB);
  const separation = subtract(nativeCircleCenter(a), nativeCircleCenter(b));
  const alongB = dot(separation, deltaB), alongA = dot(separation, deltaA);
  if (f(alongB * alongA) > EPSILON) {
    if (alongB > 0) deltaA = { x: 0, y: 0 };
    else deltaB = { x: 0, y: 0 };
  }
  const relative = subtract(deltaB, deltaA);
  const quadraticA = dot(relative, relative);
  const quadraticB = f(f(f(separation.x * 2) * relative.x) + f(f(separation.y * 2) * relative.y));
  const radius = f(a.circleRadius + b.circleRadius);
  const quadraticC = f(dot(separation, separation) - f(radius * radius));
  const discriminant = f(f(quadraticB * quadraticB) - f(f(quadraticA * 4) * quadraticC));
  let fraction = f(f(f(Math.sqrt(discriminant)) - quadraticB) / f(quadraticA + quadraticA));
  if (fraction >= 1) fraction = 1;
  const positionA = subtract(a.position, rollback(deltaA, directionA, fraction));
  const positionB = subtract(b.position, rollback(deltaB, directionB, fraction));
  const normal = normalized(subtract(positionB, positionA));
  return { positionA, positionB, contactsA: [normal], contactsB: [{ x: -normal.x, y: -normal.y }], status: 'resolved' };
}

function rollback(delta, direction, fraction) {
  if (Math.abs(delta.x) <= ZERO_MOTION && Math.abs(delta.y) <= ZERO_MOTION) return { x: 0, y: 0 };
  const result = { x: f(f(delta.x * fraction) + f(direction.x * GAP)),
    y: f(f(delta.y * fraction) + f(direction.y * GAP)) };
  return dot(delta, delta) <= dot(result, result) ? { ...delta } : result;
}

function normalized(vector) {
  const length = f(Math.sqrt(dot(vector, vector)));
  if (length === 0) return { ...vector };
  return { x: f(vector.x / length), y: f(vector.y / length) };
}

function subtract(a, b) {
  return { x: f(a.x - b.x), y: f(a.y - b.y) };
}

function dot(a, b) {
  return f(f(a.x * b.x) + f(a.y * b.y));
}
