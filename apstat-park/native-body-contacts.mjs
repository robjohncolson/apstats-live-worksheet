import { nativeBodiesOverlap } from './native-body-overlap.mjs';
import { refreshNativePlayerUpContacts } from './native-body-support.mjs';
import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;

// Actor-contact lifecycle from bc13c60, after positional finalization.
// Map-contact lifecycle (bc14040) is separate. The Player half-width upward
// probe uses original body-scale/pivot data; a caller can override the handler.
export function finalizeNativeActorContacts(world, body) {
  if (body.flags & 4) {
    if (world.refreshUpContacts) world.refreshUpContacts(body);
    else refreshNativePlayerUpContacts(world, body);
  }
  const contacts = body.contacts ??= [];
  for (let index = 0; index < contacts.length;) {
    const contact = contacts[index];
    const other = findNativeBody(world, contact.bodyId);
    if (!other) {
      // Missing registry entry is discarded without a synthetic END callback.
      contacts.splice(index, 1);
      continue;
    }
    const offset = { x: f(contact.normal.x * .5), y: f(contact.normal.y * .5) };
    if (!overlaps(body, other, offset)) {
      if (contact.state === 1) body.onContactEnd?.(other, contact.normal, 1);
      contacts.splice(index, 1);
      continue;
    }
    if (contact.state === 0) {
      contact.state = 1;
      body.onContactBegin?.(other, contact.normal, 1);
    }
    // BEGIN can disable a body. Native still dispatches this accepted STAY.
    body.onContactStay?.(other, contact.normal, 1);
    index++;
  }
}

// Final continuous-overlap scan of bc1da80. No type/moved-bit requirement:
// sensors participate even when they are not physical pair-solver bodies.
export function dispatchNativeOverlapCallbacks(world) {
  for (let i = 0; i < world.bodies.length - 1; i++) {
    const a = world.bodies[i];
    if (!(a.flags & 1)) continue;
    for (let j = i + 1; j < world.bodies.length; j++) {
      const b = world.bodies[j];
      if (!(b.flags & 1) || (!a.onOverlap && !b.onOverlap)) continue;
      if (a.category < 0 || a.category >= 32 || b.category < 0 || b.category >= 32) continue;
      if (!world.collisionMatrix[a.category * 32 + b.category]) continue;
      if (!overlaps(a, b)) continue;
      a.onOverlap?.(b);
      // B is checked after A's callback. Its enabled bit is NOT checked again.
      b.onOverlap?.(a);
    }
  }
}

function overlaps(a, b, offset = { x: 0, y: 0 }) {
  return nativeBodiesOverlap(a, b, { offsetA: offset });
}
