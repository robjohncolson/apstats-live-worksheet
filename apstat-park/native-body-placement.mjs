import { nativeBodiesOverlap } from './native-body-overlap.mjs';
import { nativeMapCellSolid } from './native-map-collision.mjs';
const f = Math.fround;

// bc303e0 -> bc28270: inclusive cell bounds, truncated toward zero after
// float32 division. Edge cells extend beyond the map; this is not a sweep.
export function nativeBodyOverlapsMap(map, body) {
  const left = f(body.localBounds.x + body.position.x);
  const top = f(body.localBounds.y + body.position.y);
  const right = f(left + body.localBounds.width);
  const bottom = f(top + body.localBounds.height);
  const minX = Math.trunc(f(left / map.chipSize)), maxX = Math.trunc(f(right / map.chipSize));
  const minY = Math.trunc(f(top / map.chipSize)), maxY = Math.trunc(f(bottom / map.chipSize));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (nativeMapCellSolid(map, x, y)) return true;
  }
  return false;
}

// bc1d3a0: query mask bit1 selects map and bit2 actor bodies. Matrix indexing
// is candidate-category first, unlike callers which initiate pair solving.
export function nativeBodyPlacementBlocked(world, body, mask = 0xffffffff) {
  if ((mask & 1) && (body.type & 1) && nativeBodyOverlapsMap(world.map, body)) return true;
  if (!(mask & 2) || !(body.type & 2)) return false;
  for (const other of world.bodies) {
    if (other === body || !(other.flags & 1) || !(other.type & 2)) continue;
    if ((other.category >>> 0) >= 32 || (body.category >>> 0) >= 32) continue;
    if (!world.collisionMatrix[other.category * 32 + body.category]) continue;
    if (nativeBodiesOverlap(other, body, { previous: true, ignoreEnabled: true })
      || nativeBodiesOverlap(other, body, { ignoreEnabled: true })) return true;
  }
  return false;
}
