const f = Math.fround;
const SCALE = f(.01);

// bbe7770: scale the query to meters, but interpolate the hit point in the
// original pixel coordinates. Return the native body wrapper identity.
export function rayCastNativeRigidWorld(world, start, end) {
  const a = { x: f(start.x), y: f(start.y) }, b = { x: f(end.x), y: f(end.y) };
  const hit = world.rayCast({ x: f(a.x * SCALE), y: f(a.y * SCALE) },
    { x: f(b.x * SCALE), y: f(b.y * SCALE) });
  if (!hit) return null;
  return { position: { x: f(a.x + f(f(b.x - a.x) * hit.fraction)),
    y: f(a.y + f(f(b.y - a.y) * hit.fraction)) }, normal: hit.normal,
    body: hit.body.userData ?? null };
}
