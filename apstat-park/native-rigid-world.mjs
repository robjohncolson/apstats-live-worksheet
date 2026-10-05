import createBox2D from './recovered/box2d.mjs';

// Pinned float32 Box2D backend. All inputs/outputs use meters, radians and
// seconds; game-specific pixel bridges and contact listeners are separate work.
export async function createNativeRigidWorld({ gravity = { x: 0, y: 0 }, moduleOptions = {} } = {}) {
  const api = await createBox2D(moduleOptions);
  let world = api._pico_world_create(gravity.x, gravity.y);
  const bodies = new Map();
  const joints = new Map();
  let ground = null;
  function requireWorld() {
    if (!world) throw new Error('Rigid world has been disposed');
  }
  function handle(body) {
    requireWorld();
    const pointer = bodies.get(body);
    if (!pointer) throw new Error('Body is not live in this rigid world');
    return pointer;
  }
  function registerJoint(pointer, a, b, kind = 'revolute', dependencies = []) {
    function requireJoint() {
      requireWorld();
      if (!joints.has(joint)) throw new Error('Joint is not live in this rigid world');
    }
    const joint = {
      read() {
        requireJoint();
        if (kind === 'gear') return { ratio: api._pico_gear_ratio(pointer) };
        const read = field => api._pico_revolute_read(pointer, field);
        return { anchorA: { x: read(0), y: read(1) }, anchorB: { x: read(2), y: read(3) },
          referenceAngle: read(4), angle: read(5), lower: read(6), upper: read(7),
          limit: Boolean(read(8)), collideConnected: Boolean(read(9)) };
      },
      destroy() {
        requireJoint();
        for (const entry of joints.values()) {
          if (entry.dependencies.includes(joint)) throw new Error('Detach the dependent gear before its underlying joint');
        }
        api._pico_joint_destroy(world, pointer);
        joints.delete(joint);
      },
    };
    joints.set(joint, { pointer, a, b, kind, dependencies });
    return joint;
  }
  const result = {
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
        // Native pixel rectangle path; preserves the recovered cached centroid.
        addNativeRectangle({ x, y, width, height, density = 0, friction = 0, restitution = 0, sensor = false }) {
          api._pico_fixture_native_rectangle(handle(body), x, y, width, height, density, friction, restitution, Number(sensor));
          return body;
        },
        readPolygonFixture(index = 0) {
          if (!Number.isInteger(index) || index < 0) throw new Error('Invalid fixture index');
          const pointer = handle(body);
          const read = (field, vertex = 0) => api._pico_polygon_read(pointer, index, field, vertex);
          const count = read(0);
          if (count < 0) return null;
          return { radius: read(1), centroid: { x: read(2), y: read(3) },
            vertices: Array.from({ length: count }, (_, i) => ({ x: read(4, i), y: read(5, i) })),
            normals: Array.from({ length: count }, (_, i) => ({ x: read(6, i), y: read(7, i) })) };
        },
        setVelocity(x, y, angular = 0) { api._pico_body_velocity(handle(body), x, y, angular); },
        setLinearVelocity(x, y) { api._pico_body_linear_velocity(handle(body), x, y); },
        setAngularVelocity(angular) { api._pico_body_angular_velocity(handle(body), angular); },
        setAngularDamping(damping) { api._pico_body_angular_damping(handle(body), damping); },
        setActive(active) { api._pico_body_active(handle(body), Number(Boolean(active))); },
        setTransform(x, y, angle = 0) { api._pico_body_transform(handle(body), x, y, angle); },
        read() {
          const pointer = handle(body);
          const values = Array.from({ length: 10 }, (_, field) => api._pico_body_read(pointer, field));
          return { x: values[0], y: values[1], angle: values[2], vx: values[3], vy: values[4],
            angularVelocity: values[5], mass: values[6], awake: Boolean(values[7]),
            active: Boolean(values[8]), angularDamping: values[9] };
        },
        destroy() {
          api._pico_body_destroy(world, handle(body));
          bodies.delete(body);
          for (const [joint, entry] of joints) {
            if (entry.a === body || entry.b === body) joints.delete(joint);
          }
          if (ground === body) ground = null;
        },
      };
      bodies.set(body, pointer);
      return body;
    },
    createRevoluteJoint(a, b, { x, y, lower = 0, upper = 0, limit = false, speed = 0, torque = 0, motor = false }) {
      const pointer = api._pico_joint_revolute(world, handle(a), handle(b), x, y, lower, upper, Number(limit), speed, torque, Number(motor));
      return registerJoint(pointer, a, b);
    },
    createLocalRevoluteJoint(a, b, { anchorA, anchorB, lower = 0, upper = 0, limit = false, collideConnected = false }) {
      handle(b);
      if (!a) { ground ??= result.createBody(); a = ground; }
      const pointer = api._pico_joint_local_revolute(world, handle(a), handle(b),
        anchorA.x, anchorA.y, anchorB.x, anchorB.y, lower, upper, Number(limit), Number(collideConnected));
      return registerJoint(pointer, a, b);
    },
    createGearJoint(a, b, first, second, { ratio = 1, collideConnected = false } = {}) {
      const bodyA = handle(a), bodyB = handle(b);
      const one = joints.get(first), two = joints.get(second);
      if (!one || !two || one.kind !== 'revolute' || two.kind !== 'revolute') {
        throw new Error('Gear requires two live revolute joints from this world');
      }
      if (first === second || one.b !== a || two.b !== b) {
        throw new Error('Gear bodies must match the distinct joints second bodies');
      }
      const pointer = api._pico_joint_gear(world, bodyA, bodyB, one.pointer, two.pointer, ratio, Number(collideConnected));
      return registerJoint(pointer, a, b, 'gear', [first, second]);
    },
    dispose() {
      if (!world) return;
      api._pico_world_destroy(world);
      world = 0;
      bodies.clear();
      joints.clear();
      ground = null;
    },
  };
  return result;
}
