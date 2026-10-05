import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const same = (a, b) => Math.abs(f(a.x - b.x)) <= EPSILON && Math.abs(f(a.y - b.y)) <= EPSILON;

// bc13690 with null flag-output pointer: matching stored contact is enough,
// even if its other body has left the registry. Map normals are the fallback.
export function hasNativeDirectionalContact(body, direction, includeMap = true) {
  if (!body) return false;
  if (body.contacts.some(contact => same(contact.normal, direction))) return true;
  return includeMap && body.mapContacts.some(normal => same(normal, direction));
}

// bc13690's non-null output variant ORs contacted bodies' field +10. Missing
// registry IDs still count as contact; they simply contribute no response bits.
export function nativeDirectionalContactResponse(body, direction, includeMap = true) {
  let hit = false, responseFlags = 0;
  if (!body) return { hit, responseFlags };
  for (const contact of body.contacts) {
    if (!same(contact.normal, direction)) continue;
    hit = true;
    const other = body.world && findNativeBody(body.world, contact.bodyId);
    if (other) responseFlags |= other.responseFlags ?? 0;
  }
  if (!hit && includeMap) hit = body.mapContacts.some(normal => same(normal, direction));
  return { hit, responseFlags: responseFlags >>> 0 };
}
