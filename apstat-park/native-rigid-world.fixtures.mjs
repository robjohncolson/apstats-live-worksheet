import { createNativeRigidWorld } from './native-rigid-world.mjs';

// Mirrors the independent desktop reference scenarios, not campaign routes.
export async function runRigidWorldFixtures(moduleOptions = {}) {
  const results = {};
  for (const name of ['fall', 'floor', 'joint']) {
    const world = await createNativeRigidWorld({ gravity: { x: 0, y: 10 }, moduleOptions });
    try {
      let body;
      if (name === 'floor') world.createBody({ y: 5 }).addBox({ halfWidth: 10, halfHeight: .5 });
      if (name === 'joint') {
        const anchor = world.createBody();
        body = world.createBody({ type: 2, x: 1 }).addBox({ halfWidth: 1, halfHeight: .1, density: 1 });
        world.createRevoluteJoint(anchor, body, { x: 0, y: 0 });
      } else body = world.createBody({ type: 2 }).addCircle({ radius: .5, density: 1 });
      const frames = { fall: 60, floor: 240, joint: 120 }[name];
      for (let tick = 0; tick < frames; tick++) world.step(Math.fround(1 / 60), 10, 10);
      results[name] = body.read();
    } finally { world.dispose(); }
  }
  return results;
}
