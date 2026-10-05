import { applyNativeBodyScale } from './native-body-scale.mjs';
import { carryNativeScrollNeighbors } from './native-player-boundary.mjs';
const f = Math.fround;

// bb679c0 followed by bb6fd20 command21. Growth carries Player contacts UP,
// RIGHT, LEFT in that order, before the world's normal scale-clearance pass.
export function resizeNativePlayer(actor, amount) {
  amount = f(amount);
  const body = actor.bodies[0]?.body;
  if (!body) return 0;
  const old = actor.scale.y, oldBounds = { ...body.localBounds };
  const size = Math.max(f(.4), Math.min(3.5, f(old + amount)));
  actor.scale = { x: actor.scale.x < 0 ? f(-size) : size, y: size };
  const collisionSize = size > 1 ? f(f(f(size - 1) * f(.88)) + 1) : size;
  applyNativeBodyScale(body, { x: collisionSize, y: collisionSize });
  if (!(amount > 0 && f(size - old) > 0)) return 0;
  const width = f(f(body.localBounds.width - oldBounds.width) * .5);
  const height = f(body.localBounds.height - oldBounds.height);
  if (height > 0) carryNativeScrollNeighbors(actor, { x: 0, y: f(-height) }, 0);
  if (width > 0) {
    carryNativeScrollNeighbors(actor, { x: width, y: 0 }, 3);
    carryNativeScrollNeighbors(actor, { x: f(-width), y: 0 }, 2);
  }
  return 0;
}
