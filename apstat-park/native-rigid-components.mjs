const f = Math.fround;

// bb56320/bb56390/bb563c0. Actor components attach to scene+51950.
export function createNativeRigidBodyComponent(owner, body) {
  return {
    onAdded(scene, position, angle) {
      body.owner = owner;
      body.setAttachmentTransform(position, angle);
      body.attach(scene.rigidWorld);
    },
    onRemoved() { body.detach(); },
    consumeVelocity(value) {
      body.setVelocity(value);
      value.x = 0;
      value.y = 0;
    },
  };
}

// bb5dd40: anchor A = actor position + component+98 offset; anchor B = zero.
export function createNativePivotComponent(pivot, offset = { x: 0, y: 0 }) {
  return {
    onAdded(scene, position) {
      pivot.setAnchors({ x: f(f(position.x) + f(offset.x)), y: f(f(position.y) + f(offset.y)) }, { x: 0, y: 0 });
      pivot.attach(scene.rigidWorld);
    },
    onRemoved() { pivot.detach(); },
  };
}

// bb5dd00/bb5ddd0: gear's bodies and pivots are configured by bb5d9e0.
export function createNativeGearComponent(gear) {
  return {
    onAdded(scene) { gear.attach(scene.rigidWorld); },
    onRemoved() { gear.detach(); },
  };
}
