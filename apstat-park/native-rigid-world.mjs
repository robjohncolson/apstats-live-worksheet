import createBox2D from './recovered/box2d.mjs';

// Pinned float32 Box2D backend. All inputs/outputs use meters, radians and
// seconds; game-specific pixel bridges and contact listeners are separate work.
export async function createNativeRigidWorld({ gravity = { x: 0, y: 0 }, moduleOptions = {} } = {}) {
  const api = await createBox2D(moduleOptions);
  let world = api._pico_world_create(gravity.x, gravity.y);
  const bodies = new Map();
  function requireWorld() {
    if (!world) throw new Error('Rigid world has been disposed');
  }
  function handle(body) {
    requireWorld();
    const pointer = bodies.get(body);
    if (!pointer) throw new Error('Body is not live in this rigid world');
    return pointer;
  }
  return {
    step(dt, velocityIterations = 10, positionIterations = 10) {
      requireWorld();
      api._pico_world_step(world, dt, velocityIterations, positionIterations);
    },
    createBody({ type = 0, x = 0, y = 0, angle = 0, linearDamping = 0,
      angularDamping = 0, gravityScale = 1, allowSleep = true, awake = true,
      fixedRotation = false, bullet = false, active = true } = {}) {
      requireWorld();
      const flags = Number(allowSleep) | (Number(awake) << 1) | (Number(fixedRotation) << 2)
        | (Number(bullet) << 3) | (Number(active) << 4);
      const pointer = api._pico_body_create(world, type, x, y, angle, linearDamping, angularDamping, gravityScale, flags);
      const body = {
        addBox({ halfWidth, halfHeight, x = 0, y = 0, angle = 0, density = 0, friction = .2, restitution = 0, sensor = false }) {
          api._pico_fixture_box(handle(body), halfWidth, halfHeight, x, y, angle, density, friction, restitution, Number(sensor));
          return body;
        },
        addCircle({ radius, x = 0, y = 0, density = 0, friction = .2, restitution = 0, sensor = false }) {
          api._pico_fixture_circle(handle(body), radius, x, y, density, friction, restitution, Number(sensor));
          return body;
        },
        setVelocity(x, y, angular = 0) { api._pico_body_velocity(handle(body), x, y, angular); },
        setTransform(x, y, angle = 0) { api._pico_body_transform(handle(body), x, y, angle); },
        read() {
          const pointer = handle(body);
          const values = Array.from({ length: 8 }, (_, field) => api._pico_body_read(pointer, field));
          return { x: values[0], y: values[1], angle: values[2], vx: values[3], vy: values[4],
            angularVelocity: values[5], mass: values[6], awake: Boolean(values[7]) };
        },
        destroy() { api._pico_body_destroy(world, handle(body)); bodies.delete(body); },
      };
      bodies.set(body, pointer);
      return body;
    },
    createRevoluteJoint(a, b, { x, y, lower = 0, upper = 0, limit = false, speed = 0, torque = 0, motor = false }) {
      api._pico_joint_revolute(world, handle(a), handle(b), x, y, lower, upper, Number(limit), speed, torque, Number(motor));
    },
    dispose() {
      if (!world) return;
      api._pico_world_destroy(world);
      world = 0;
      bodies.clear();
    },
  };
}
