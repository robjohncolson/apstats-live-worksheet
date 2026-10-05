const f = Math.fround;
const toMeters = value => ({ x: f(f(value.x) * f(.01)), y: f(f(value.y) * f(.01)) });

// bbe6d30..bbe7010: local-anchor revolute definition, zero reference angle.
// Definition setters affect the next attachment, not an already live joint.
export function createNativeRevoluteJoint() {
  let a = null, b = null, world = null, joint = null;
  let anchorA = { x: 0, y: 0 }, anchorB = { x: 0, y: 0 };
  let lower = 0, upper = 0, limit = false;
  const linkedBodies = [];
  function unlink() {
    for (const body of linkedBodies) {
      const index = body.joints.indexOf(wrapper);
      if (index >= 0) body.joints.splice(index, 1);
    }
    linkedBodies.length = 0;
  }
  const wrapper = {
    flags: 0,
    get joint() { return joint; },
    get world() { return world; },
    isAttached() { return Boolean(world && joint); },
    setBodies(first, second) { if (second) { a = first; b = second; } }, // bbe6e20
    setAnchors(first, second) { anchorA = toMeters(first); anchorB = toMeters(second); },
    setLimits(min, max) { lower = f(min); upper = f(max); limit = true; },
    attach(nextWorld) {
      if (wrapper.isAttached() || !b) return false;
      if (!nextWorld || b.world !== nextWorld || (a && a.world !== nextWorld)) {
        throw new Error('Native joint bodies must be attached to the supplied world');
      }
      joint = nextWorld.createLocalRevoluteJoint(a?.body ?? null, b.body,
        { anchorA, anchorB, lower, upper, limit, collideConnected: Boolean(wrapper.flags & 1) });
      world = nextWorld;
      joint.userData = wrapper;
      for (const body of [a, b]) {
        if (!body || linkedBodies.includes(body)) continue;
        body.joints ??= [];
        body.joints.unshift(wrapper); // native body joint-edge list prepends
        linkedBodies.push(body);
      }
      return true;
    },
    detach() {
      if (!wrapper.isAttached()) return;
      joint.destroy();
      wrapper.onBodyRemoved();
    },
    onBodyRemoved() { // bbe6c10: DestroyBody owns destruction; only clear live links
      unlink();
      joint = null;
      world = null;
    },
  };
  return wrapper;
}
