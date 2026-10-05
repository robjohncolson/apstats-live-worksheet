import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><body>Rigid world audit</body>'); return; }
  const file = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm' : 'text/javascript');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const { runRigidWorldFixtures } = await import('/apstat-park/native-rigid-world.fixtures.mjs');
    return runRigidWorldFixtures();
  });
  const reference = JSON.parse(await readFile(new URL('./recovered/box2d-reference.json', import.meta.url), 'utf8'));
  for (const [name, fields] of Object.entries(reference)) {
    for (const [field, value] of Object.entries(fields)) assert.ok(Math.abs(result[name][field] - value) < 2e-5, `${name}.${field}`);
  }
  console.log(JSON.stringify(result));
  const rectangle = await page.evaluate(async () => {
    const { createNativeRigidWorld } = await import('/apstat-park/native-rigid-world.mjs');
    const { createNativeRigidBody, createNativeRigidRectangle } = await import('/apstat-park/native-rigid-body.mjs');
    const world = await createNativeRigidWorld({ gravity: { x: 0, y: 10 } });
    try {
      world.createBody({ y: 5 }).addBox({ halfWidth: 10, halfHeight: .5 });
      const wrapper = createNativeRigidBody({ type: 1,
        shape: createNativeRigidRectangle({ x: -50, y: 0, width: 100, height: 100, density: 1 }) });
      wrapper.attach(world);
      for (let i = 0; i < 240; i++) world.step(Math.fround(1 / 60));
      return { polygon: wrapper.body.readPolygonFixture(), state: wrapper.body.read() };
    } finally { world.dispose(); }
  });
  assert.ok(Math.abs(rectangle.polygon.centroid.y + 50) < 1e-5);
  assert.ok(rectangle.state.y > 4.47 && rectangle.state.y < 4.5);
  assert.equal(rectangle.state.vy, 0);
  assert.equal(rectangle.state.awake, false);
  console.log('NATIVE RECTANGLE BROWSER PASS: cached centroid retained and inverted bounds land on floor');
  const gearResult = await page.evaluate(async () => {
    const { createNativeRigidWorld } = await import('/apstat-park/native-rigid-world.mjs');
    const { createNativeRigidBody, createNativeRigidCircle } = await import('/apstat-park/native-rigid-body.mjs');
    const { createNativeRevoluteJoint, createNativeGearJoint } = await import('/apstat-park/native-rigid-joint.mjs');
    const world = await createNativeRigidWorld();
    try {
      const bodies = [.25, -.5].map(angle => {
        const body = createNativeRigidBody({ type: 1, angle,
          shape: createNativeRigidCircle({ radius: 20, density: 1 }) });
        body.attach(world);
        return body;
      });
      const pivots = bodies.map(body => {
        const pivot = createNativeRevoluteJoint();
        pivot.setBodies(null, body); pivot.attach(world);
        return pivot;
      });
      const gear = createNativeGearJoint();
      gear.setConnections(...bodies, ...pivots); gear.setRatio(-1); gear.attach(world);
      bodies[0].setAngularVelocity(3);
      for (let i = 0; i < 120; i++) world.step(Math.fround(1 / 60));
      const angles = bodies.map(body => body.getAngle());
      bodies[0].detach();
      world.step(Math.fround(1 / 60));
      return { angles, gearAttached: gear.isAttached(), secondPivotAttached: pivots[1].isAttached() };
    } finally { world.dispose(); }
  });
  assert.ok(gearResult.angles.every(angle => angle > 1));
  assert.ok(Math.abs(gearResult.angles[0] - gearResult.angles[1] - .75) < 1e-5);
  assert.equal(gearResult.gearAttached, false);
  assert.equal(gearResult.secondPivotAttached, true);
  console.log('NATIVE GEAR BROWSER PASS: seesaw ratio coupling and body-removal lifecycle');
  const rayResult = await page.evaluate(async () => {
    const { createNativeRigidWorld } = await import('/apstat-park/native-rigid-world.mjs');
    const { createNativeRigidBody, createNativeRigidCircle } = await import('/apstat-park/native-rigid-body.mjs');
    const { rayCastNativeRigidWorld } = await import('/apstat-park/native-rigid-raycast.mjs');
    const world = await createNativeRigidWorld();
    try {
      const body = createNativeRigidBody({ position: { x: 0, y: -10 },
        shape: createNativeRigidCircle({ radius: 3, sensor: true }) });
      body.attach(world); body.setActive(false);
      const hit = rayCastNativeRigidWorld(world, { x: 0, y: 0 }, { x: 0, y: -16 });
      return { y: hit?.position.y, ownerMatches: hit?.body === body };
    } finally { world.dispose(); }
  });
  assert.ok(Math.abs(rayResult.y + 7) < 1e-5);
  assert.equal(rayResult.ownerMatches, true);
  console.log('NATIVE RAY BROWSER PASS: pixel query includes inactive sensor and returns wrapper identity');
  const ballResult = await page.evaluate(async () => {
    const { createNativeRigidWorld } = await import('/apstat-park/native-rigid-world.mjs');
    const { createNativePhysicsBall } = await import('/apstat-park/native-physics-ball.mjs');
    const { createNativePhysicsArea } = await import('/apstat-park/native-physics-area.mjs');
    const world = await createNativeRigidWorld({ gravity: { x: 0, y: 10 } });
    try {
      const area = createNativePhysicsArea({ width: 200, height: 100 });
      area.onAdded({ rigidWorld: world });
      const ball = createNativePhysicsBall({ position: { x: 100, y: 40 } });
      ball.onAdded({ rigidWorld: world });
      for (let i = 0; i < 120 && !ball.countdown; i++) {
        ball.beforeMotion(); world.step(Math.fround(1 / 60)); ball.afterMotion();
      }
      const armed = ball.countdown;
      for (let i = 0; i < 30; i++) { ball.beforeMotion(); world.step(Math.fround(1 / 60)); }
      return { armed, countdown: ball.countdown, removed: Boolean(ball.flags & 32), alpha: ball.alphaByte };
    } finally { world.dispose(); }
  });
  assert.deepEqual(ballResult, { armed: 30, countdown: 0, removed: true, alpha: 0 });
  console.log('PHYSICS AREA/BALL BROWSER PASS: independent boundary edges arm native fade/removal sequence');
  const switchResult = await page.evaluate(async () => {
    const { createNativeRigidWorld } = await import('/apstat-park/native-rigid-world.mjs');
    const { createNativePhysicsSwitch } = await import('/apstat-park/native-physics-switch.mjs');
    const world = await createNativeRigidWorld();
    try {
      const commands = [], sounds = [];
      const sensor = createNativePhysicsSwitch({ name: 'PhysicsSwitchKey', position: { x: 100, y: 100 } });
      sensor.onAdded({ rigidWorld: world, sendCommand: (...args) => commands.push(args), playSound: name => sounds.push(name) });
      const body = world.createBody({ x: 1, y: .9 }).addCircle({ radius: .03, sensor: true });
      body.setActive(false);
      sensor.beforeMotion();
      const first = { pressed: sensor.pressed, commandCount: commands.length };
      body.destroy();
      sensor.beforeMotion(); sensor.beforeMotion();
      return { first, pressed: sensor.pressed, commands, sounds, uvX: sensor.spriteUV.x };
    } finally { world.dispose(); }
  });
  assert.deepEqual(switchResult, { first: { pressed: true, commandCount: 0 }, pressed: true,
    commands: [['Key', 9, 0]], sounds: ['switch'], uvX: .171875 });
  console.log('PHYSICS SWITCH BROWSER PASS: delayed command and permanent latch after rigid hit disappears');
  console.log('RIGID WORLD BROWSER PASS: WASM loading, free fall, floor contact and revolute joint match desktop reference');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
