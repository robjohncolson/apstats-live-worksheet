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
