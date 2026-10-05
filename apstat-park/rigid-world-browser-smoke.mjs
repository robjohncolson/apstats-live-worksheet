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
  console.log('RIGID WORLD BROWSER PASS: WASM loading, free fall, floor contact and revolute joint match desktop reference');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
