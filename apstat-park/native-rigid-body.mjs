const f = Math.fround;
const PIXEL_TO_METER = f(.01); // bc7d45c

// bbe6400/bbe6520. Native type 1 maps to dynamic; all other values map to
// static. This wrapper is for actual rigid actors, not custom-body Players.
export function createNativeRigidBody({ type = 0, shape = null, position = { x: 0, y: 0 },
  velocity = { x: 0, y: 0 }, angle = 0, angularVelocity = 0,
  angularDamping = 0, gravityScale = 1 } = {}) {
  let world = null, body = null;
  let storedDamping = f(angularDamping);
  const initialPosition = { x: f(position.x), y: f(position.y) };
  const initialVelocity = { x: f(velocity.x), y: f(velocity.y) };
  const wrapper = {
    get body() { return body; },
    get world() { return world; },
    // bb56320 writes these staged fields before attaching the scene component.
    setAttachmentTransform(position, nextAngle = 0) {
      initialPosition.x = f(position.x);
      initialPosition.y = f(position.y);
      angle = f(nextAngle);
    },
    attach(nextWorld) {
      if (!nextWorld || !shape || world) return false;
      body = nextWorld.createBody({ type: type === 1 ? 2 : 0,
        x: f(initialPosition.x * PIXEL_TO_METER), y: f(initialPosition.y * PIXEL_TO_METER),
        angle: f(angle), angularDamping: storedDamping, gravityScale: f(gravityScale) });
      body.userData = wrapper; // JS identity corresponding to native body+b0
      body.setLinearVelocity(f(initialVelocity.x * PIXEL_TO_METER), f(initialVelocity.y * PIXEL_TO_METER));
      body.setAngularVelocity(f(angularVelocity));
      world = nextWorld;
      shape.attach(wrapper); // native shape virtual +8 sees attached world/body
      return true;
    },
    // bbe6740/bbe67e0 change the live body only, not constructor snapshots.
    setVelocity(value) {
      body?.setLinearVelocity(f(f(value.x) * PIXEL_TO_METER), f(f(value.y) * PIXEL_TO_METER));
    },
    setAngularVelocity(value) { body?.setAngularVelocity(f(value)); },
    // bbe6850 persists damping even before attachment or after detachment.
    setAngularDamping(value) { storedDamping = f(value); body?.setAngularDamping(storedDamping); },
    setActive(value) { body?.setActive(value); }, // bbe6960, live only
    isActive() { return body ? body.read().active : false; },
    isAwake() { return body ? body.read().awake : false; },
    getPosition() { // bbe68a0 divides, rather than multiplying by exact 100.
      if (!body) return { x: 0, y: 0 };
      const state = body.read();
      return { x: f(state.x / PIXEL_TO_METER), y: f(state.y / PIXEL_TO_METER) };
    },
    getAngle() { return body ? body.read().angle : 0; }, // bbe6920
    detach() {
      if (!world) return;
      // Joint-wrapper notifications are supplied when those wrappers exist.
      for (const joint of [...(wrapper.joints ?? [])]) joint.onBodyRemoved();
      body.destroy();
      body = null;
      world = null;
    },
  };
  return wrapper;
}

// bbe5a00/bbe5ad0: material fields start at zero, not Box2D's .2 friction
// default. Radius converts to meters, but descriptor center is copied as-is.
export function createNativeRigidCircle({ radius = 0, x = 0, y = 0,
  density = 0, friction = 0, restitution = 0, sensor = false } = {}) {
  return {
    attach(wrapper) {
      if (!wrapper?.body) return;
      wrapper.body.addCircle({ radius: f(f(radius) * PIXEL_TO_METER), x: f(x), y: f(y),
        density: f(density), friction: f(friction), restitution: f(restitution), sensor });
    },
  };
}

// bbe5c70/bbe5d30. Hull construction and vertex-only conversion happen in
// the pinned backend so Box2D's float32 hull/centroid calculation is retained.
export function createNativeRigidRectangle({ x = 0, y = 0, width, height,
  density = 0, friction = 0, restitution = 0, sensor = false } = {}) {
  return {
    attach(wrapper) {
      if (!wrapper?.body) return;
      wrapper.body.addNativeRectangle({ x, y, width, height, density, friction, restitution, sensor });
    },
  };
}
