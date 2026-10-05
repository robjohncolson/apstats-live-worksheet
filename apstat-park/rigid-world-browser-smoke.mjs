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
  console.log('RIGID WORLD BROWSER PASS: WASM loading, free fall, floor contact and revolute joint match desktop reference');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
