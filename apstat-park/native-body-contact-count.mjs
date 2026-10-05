import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

// bc132c0 with bb934a0's float32 vector comparison. Native retains at most
// 16 visited pointers; counts beyond that capacity can include duplicates.
export function countNativeContactBodies(body, direction, mask, recursive = true) {
  const visited = [];
  const stack = [{ body, index: 0 }];
  let count = 0, operations = 0;
  while (stack.length) {
    if (++operations > 10000) throw new Error('Native contact count exceeded traversal limit');
    const frame = stack[stack.length - 1];
    const contact = frame.body.contacts[frame.index++];
    if (!contact) { stack.pop(); continue; }
    const other = frame.body.world && findNativeBody(frame.body.world, contact.bodyId);
    if (!other || !((mask >>> (other.category & 31)) & 1)) continue;
    if (!(Math.abs(f(contact.normal.x - direction.x)) <= EPSILON
      && Math.abs(f(contact.normal.y - direction.y)) <= EPSILON)) continue;
    if (visited.includes(other)) continue;
    count++;
    if (visited.length < 16) visited.push(other);
    if (recursive) stack.push({ body: other, index: 0 });
  }
  return count;
}
