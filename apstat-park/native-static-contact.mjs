import { resolveNativeRectanglePair } from './native-rectangle-pair.mjs';

// Bridge for the shipped stationary Thunder auxiliary. This does not replace
// the world pass or pretend that every preview gate is an ordinary native body.
export function resolveNativeStaticPlayerContact(previousRect, currentRect, velocity, supports) {
  const f = Math.fround;
  let rect = { ...currentRect };
  const outVelocity = { ...velocity };
  let grounded = false;
  let blocked = false;
  const localBounds = { x: f(-rect.width / 2), y: f(-rect.height - 1), width: rect.width, height: rect.height };
  const previousPosition = { x: f(previousRect.x + previousRect.width / 2),
    y: f(previousRect.y + previousRect.height + 1) };
  for (const support of supports) {
    const anchor = { x: f(support.x + support.width / 2), y: f(support.y + support.height / 2) };
    const result = resolveNativeRectanglePair({ localBounds, previousPosition,
      position: { x: f(rect.x + rect.width / 2), y: f(rect.y + rect.height + 1) } },
    { position: anchor, previousPosition: anchor,
      localBounds: { x: f(-support.width / 2), y: f(-support.height / 2), width: support.width, height: support.height } });
    if (result.status !== 'resolved' && result.status !== 'rewound') continue;
    rect = { ...rect, x: f(result.positionA.x + localBounds.x), y: f(result.positionA.y + localBounds.y) };
    blocked = true;
    for (const normal of result.contactsA) {
      if (normal.x) outVelocity.x = 0;
      if (normal.y) outVelocity.y = 0;
      if (normal.y > 0) grounded = true;
    }
  }
  return { rect, velocity: outVelocity, grounded, blocked };
}
