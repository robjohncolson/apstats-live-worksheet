import { hasNativeDirectionalContact } from './native-body-query.mjs';
const f = Math.fround;
// bcbbb40 is a stored double, rather than a recomputed PI expression.
const coneSine = f(Math.sin(0.6981316804885864));
const distanceSquared = (a, b) => {
  const x = f(a.x - b.x), y = f(a.y - b.y);
  return f(f(x * x) + f(y * y));
};

// bb5a180. Preserve overlap order and duplicates; capacity truncates silently.
// PushBox's RTTI c62a10f is independent of its body's collision category.
export function collectNativeMagnetCandidate(magnet, body) {
  const target = body.actor;
  if (!target) return;
  if (!(body.category === 1 && target !== magnet.owner) && !target.isNativePushBox) return;
  const x = f(target.position.x - magnet.owner.position.x);
  const y = f(target.position.y - magnet.owner.position.y);
  const length = f(Math.sqrt(f(f(x * x) + f(y * y))));
  const normalizedY = length ? f(y / length) : y;
  if (Math.abs(normalizedY) < coneSine && magnet.candidates.length < 8) magnet.candidates.push(target);
}

// bb59530 acquisition branch. Strict comparisons give a stable distance sort.
// A refusal must advance to the next candidate, not prevent all grabbing.
export function selectNativeMagnetTarget(magnet) {
  const origin = magnet.owner.position;
  magnet.candidates.sort((a, b) => distanceSquared(a.position, origin) - distanceSquared(b.position, origin));
  for (const target of magnet.candidates) {
    if (!target.onCommand?.(0x1e, 1)) continue;
    magnet.target = target;
    if (magnet.scene.players.includes(target)) target.playerFlags &= ~8;
    return target;
  }
  return null;
}

// bb59530 retention branch, after bb5a2d0 supplies the desired held position.
// Frame displacement does not depend on dt. Latching changes both gains and
// adds owner velocity. Release and POST separation checks clear the latch.
export function nativeMagnetPullDisplacement(magnet, goalPosition) {
  const target = magnet.target;
  const latched = Boolean(magnet.magnetFlags & 1);
  const movement = latched ? { x: f(magnet.owner.velocity.x), y: f(magnet.owner.velocity.y) } : { x: 0, y: 0 };
  const delta = { x: f(goalPosition.x - f(target.position.x + movement.x)),
    y: f(goalPosition.y - f(target.position.y + movement.y)) };
  let settled = true;
  for (const axis of ['x', 'y']) {
    const threshold = axis === 'x' ? 1 : 2;
    const gain = f(axis === 'x' ? (latched ? .06 : .03) : (latched ? .16 : .08));
    let correction = delta[axis];
    if (Math.abs(correction) > threshold) {
      correction = f(Math.sign(correction) * Math.max(2, f(Math.abs(correction) * gain)));
      settled = false;
    }
    movement[axis] = f(movement[axis] + correction);
  }
  if (!latched && settled) magnet.magnetFlags |= 1;
  const body = target.bodies[0]?.body;
  if (hasNativeDirectionalContact(body, { x: movement.x > 0 ? 1 : -1, y: 0 })) movement.x = 0;
  if (movement.y < 0 && hasNativeDirectionalContact(body, { x: 0, y: -1 })) movement.y = 0;
  return movement;
}
