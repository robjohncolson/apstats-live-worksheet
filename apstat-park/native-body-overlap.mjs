// bc119c0 (current) and bc11be0 (last accepted). Scaled localBounds are the
// output of bb4e260; circleRadius is the unscaled body+40 descriptor value.
const f = Math.fround;

export function nativeBodiesOverlap(a, b, { previous = false, offsetA = { x: 0, y: 0 },
  offsetB = { x: 0, y: 0 }, ignoreEnabled = false } = {}) {
  if (!ignoreEnabled && (!(a.flags & 1) || !(b.flags & 1))) return false;
  const key = previous ? 'previousPosition' : 'position';
  if (a.shape === 1 && b.shape === 1) {
    const ac = nativeCircleCenter(a, key), bc = nativeCircleCenter(b, key);
    const dx = f(f(ac.x + offsetA.x) - f(bc.x + offsetB.x));
    const dy = f(f(ac.y + offsetA.y) - f(bc.y + offsetB.y));
    const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
    // Native accepted-position query scales radii; its current-position query
    // does not. Preserve this asymmetry rather than replacing it with geometry
    // that merely looks more conventional.
    const radiusA = previous ? f(a.circleRadius * Math.max(a.scale?.x ?? 1, a.scale?.y ?? 1)) : a.circleRadius;
    const radiusB = previous ? f(b.circleRadius * Math.max(b.scale?.x ?? 1, b.scale?.y ?? 1)) : b.circleRadius;
    return distance < f(radiusA + radiusB);
  }
  const ax = f(f(a.localBounds.x + a[key].x) + offsetA.x);
  const ay = f(f(a.localBounds.y + a[key].y) + offsetA.y);
  const bx = f(f(b.localBounds.x + b[key].x) + offsetB.x);
  const by = f(f(b.localBounds.y + b[key].y) + offsetB.y);
  return f(ax + a.localBounds.width) > bx && f(bx + b.localBounds.width) > ax
    && f(ay + a.localBounds.height) > by && f(by + b.localBounds.height) > ay;
}

export function nativeCircleCenter(body, key = 'position') {
  // Raw native loads multiply the actor position by scale. They do not add
  // the descriptor center at +38 here. Unit-scale campaign bodies use actor XY.
  return { x: f((body.scale?.x ?? 1) * body[key].x), y: f((body.scale?.y ?? 1) * body[key].y) };
}
