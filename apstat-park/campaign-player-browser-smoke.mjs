// Native goal unlock, input edge, key delivery and multiplayer completion contracts.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><body>Sensor audit</body>'); return; }
  const file = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', extname(file) === '.mjs' ? 'text/javascript' : 'image/png');
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
    const { createCampaignEngine, decodeInput } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    game.load(0, 2, 55);
    const normal = game.runtime.players[0];
    normal.reset(300, 300);
    const body = { ...normal.rect };
    game.runtime.tileMap.map.table.fill('MC_NON');
    for (let tick = 0; tick < 20; tick++) normal.update(1 / 60, decodeInput(2), game.runtime.tileMap);
    const walkDistance = normal.rect.x - body.x;
    const before = normal.rect.x;
    normal.update(1 / 60, decodeInput(3), game.runtime.tileMap);
    const opposingInputDistance = normal.rect.x - before;
    normal.reset(300, 300);
    game.runtime.player = normal;
    game.runtime.applyScaleSwitchPlayerDelta({ params: { scaleDelta: 1 } });
    const grown = { charge: normal.charge, visualScale: normal.view.scale.x,
      width: normal.rect.width, height: normal.rect.height,
      artX: normal.view.x + 16 * normal.view.scale.x,
      artY: normal.view.y + 47 * normal.view.scale.y };
    normal.reset(300, 300);
    const reset = { charge: normal.charge, visualScale: normal.view.scale.x, rect: { ...normal.rect } };
    game.load(13, 2, 55);
    const plane = game.runtime.players[0];
    plane.reset(300, 300);
    game.runtime.tileMap.map.table.fill('MC_NON');
    const start = { ...plane.rect };
    for (let tick = 0; tick < 10; tick++) plane.update(1 / 60, decodeInput(2 | 4), game.runtime.tileMap);
    const flight = { mode: plane.mode, x: plane.rect.x - start.x, y: plane.rect.y - start.y };
    const y = plane.rect.y;
    plane.update(1 / 60, decodeInput(16 | 32), game.runtime.tileMap);
    const jumpFlight = plane.rect.y - y;
    game.dispose(); return { body, walkDistance, opposingInputDistance, flight, jumpFlight, grown, reset };
  });
  assert.deepEqual(result.grown, { charge: 2, visualScale: 2, width: Math.fround(32 * Math.fround(1.88)),
    height: Math.fround(46 * Math.fround(1.88)), artX: 300, artY: 300 });
  assert.deepEqual(result.reset, { charge: 1, visualScale: 1, rect: { x: 284, y: 253, width: 32, height: 46 } });
  delete result.grown; delete result.reset;
  assert.deepEqual(result, { body: { x: 284, y: 253, width: 32, height: 46 }, walkDistance: 60,
    opposingInputDistance: 3, flight: { mode: 'plane', x: 45, y: -45 }, jumpFlight: 0 });
  console.log('NATIVE PLAYER BASICS PASS: body anchor, per-frame walk/flight units, direction priority and plane controls');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
