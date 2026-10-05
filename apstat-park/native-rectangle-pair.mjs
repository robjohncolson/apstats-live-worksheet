// Ordinary rectangle/mixed-shape branch of FUN_7ff72bc1e4a0.
// Inputs carry actor positions and scaled LOCAL bounds. Keep actor positions
// separate from bounds: float32 rounding depends on the original actor anchor.
// This is a pair response, not the native world solver. Registration order,
// map movement, recursive fixed bodies and contact lifecycle belong to it.
const f = Math.fround;
const EPSILON = 2 ** -23;
const GAP = f(.01);
const DIRECTIONS = [
  { x: 0, y: -1 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
];

export function resolveNativeRectanglePair(a, b) {
  a = { ...a, bounds: translatedBounds(a.localBounds, a.position) };
  b = { ...b, bounds: translatedBounds(b.localBounds, b.position) };
  const deltaA = displacement(a);
  const deltaB = displacement(b);
  const unchanged = { positionA: { ...a.position }, positionB: { ...b.position }, contactsA: [], contactsB: [] };
  if (!overlap(a.bounds, b.bounds)) return { ...unchanged, status: 'separate' };

  // bc1e050 excludes pairs already overlapping at their accepted positions.
  // Bounds are translated here; scale-change resolution is a separate pass.
  if (overlap(previousBounds(a), previousBounds(b))) {
    return { ...unchanged, status: 'previous-overlap' };
  }
  if (hasRecursivePriority(a) || hasRecursivePriority(b)) {
    return { ...unchanged, status: 'recursive-required' };
  }

  const horizontal = rollbackAxis(a.bounds, b.bounds, deltaA, deltaB, 'x');
  const vertical = rollbackAxis(a.bounds, b.bounds, deltaA, deltaB, 'y');
  if (horizontal.direction < 0 && vertical.direction < 0) {
    return { positionA: { ...a.previousPosition }, positionB: { ...b.previousPosition },
      contactsA: [], contactsB: [], status: 'rewound' };
  }

  const positionA = {
    x: candidate(a, deltaA, 'x', horizontal.a),
    y: candidate(a, deltaA, 'y', vertical.a),
  };
  const positionB = {
    x: candidate(b, deltaB, 'x', horizontal.b),
    y: candidate(b, deltaB, 'y', vertical.b),
  };
  separateAxis(positionA, positionB, a, b, deltaA, horizontal, 'x');
  separateAxis(positionA, positionB, a, b, deltaA, vertical, 'y');

  // bc13830 deduplicates by body ID. X is inserted first; a second Y contact
  // for this pair does not replace it. Reciprocal-UP suppression is world-level.
  const direction = horizontal.direction >= 0 ? horizontal.direction : vertical.direction;
  return { positionA, positionB, contactsA: [{ ...DIRECTIONS[direction] }],
    contactsB: [{ ...DIRECTIONS[direction ^ 1] }], status: 'resolved' };
}

function displacement(body) {
  return { x: f(body.position.x - body.previousPosition.x), y: f(body.position.y - body.previousPosition.y) };
}

function previousBounds(body) {
  return translatedBounds(body.localBounds, body.previousPosition);
}

function translatedBounds(bounds, position) {
  return { ...bounds, x: f(bounds.x + position.x), y: f(bounds.y + position.y) };
}

function overlap(a, b) {
  return f(a.x + a.width) > b.x && f(b.x + b.width) > a.x
    && f(a.y + a.height) > b.y && f(b.y + b.height) > a.y;
}

function hasRecursivePriority(body) {
  return ((body.flags ?? 1) & 2) !== 0 && ((body.flags ?? 1) & 8) === 0;
}

function rollbackAxis(a, b, deltaA, deltaB, axis) {
  const result = { a: 0, b: 0, direction: -1 };
  const da = deltaA[axis], db = deltaB[axis];
  if (da === 0 && db === 0) return result;
  const size = axis === 'x' ? 'width' : 'height';
  const endA = f(a[axis] + a[size]), endB = f(b[axis] + b[size]);
  const positive = f(b[axis] - db) >= f(endA - da);
  if (!positive && f(endB - db) > f(a[axis] - da)) return result;

  const penetration = positive ? f(endA - b[axis]) : f(endB - a[axis]);
  if (f(da * db) <= EPSILON) {
    result.a = result.b = f(penetration / (positive ? f(db - da) : f(da - db)));
  } else if (Math.abs(da) > Math.abs(db)) {
    result.a = f(penetration / (positive ? -da : da));
  } else {
    result.b = f(penetration / (positive ? db : -db));
  }
  result.a = Math.max(-1, Math.min(0, result.a));
  result.b = Math.max(-1, Math.min(0, result.b));
  result.direction = (axis === 'x' ? 2 : 0) + Number(positive);

  if (Math.abs(result.a) > EPSILON && Math.abs(result.b) > EPSILON) {
    const crossAxis = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    const crossA = f(f(deltaA[crossAxis] * result.a) + a[crossAxis]);
    const crossB = f(f(deltaB[crossAxis] * result.b) + b[crossAxis]);
    // Native uses strict < here, so perpendicular exact-edge contact survives.
    if (f(crossB + b[crossSize]) < crossA || f(crossA + a[crossSize]) < crossB) {
      return { a: 0, b: 0, direction: -1 };
    }
  }
  return result;
}

function candidate(body, delta, axis, fraction) {
  const value = f(f(delta[axis] * fraction) + body.position[axis]);
  if (Math.abs(fraction) > EPSILON && Math.abs(delta[axis]) > EPSILON
    && Math.abs(f(value - body.position[axis])) <= EPSILON) return body.previousPosition[axis];
  return value;
}

function separateAxis(positionA, positionB, a, b, deltaA, rollback, axis) {
  if (rollback.direction < 0) return;
  const positive = (rollback.direction & 1) !== 0;
  if (rollback.b < rollback.a || Math.abs(deltaA[axis]) <= EPSILON) {
    positionB[axis] = positive
      ? Math.min(b.previousPosition[axis], f(positionB[axis] + GAP))
      : Math.max(b.previousPosition[axis], f(positionB[axis] - GAP));
    return;
  }
  positionA[axis] = positive
    ? Math.max(a.previousPosition[axis], f(positionA[axis] - GAP))
    : Math.min(a.previousPosition[axis], f(positionA[axis] + GAP));
}
