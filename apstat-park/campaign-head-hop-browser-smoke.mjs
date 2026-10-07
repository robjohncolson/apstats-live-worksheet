// Local-only smoke (teacher 2026-10-07, retail capture og-capture/notes.md): in the real browser engine,
// 1-3, a cat with a box on its head presses jump. The cat does not rise and the box hops 22 native units
// and lands back exactly (recovered patch 'head-stack-jump-impulse'). Needs Playwright: PARK_PLAYWRIGHT_MODULE
// may point to an installed playwright-core index.mjs and PARK_BROWSER to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-head-hop');
mkdirSync(output, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body style="margin:0;background:#f7f5ee"><div id="stage"></div></body></html>');
    return;
  }
  const file = path.resolve(app, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(app + path.sep)) { response.writeHead(403); response.end(); return; }
  response.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); }); stream.pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });

try {
  const page = await browser.newPage({ viewport: { width: 760, height: 780 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');
  const start = await page.evaluate(async () => {
    const { createCampaignEngine, campaignStages } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    document.getElementById('stage').append(game.canvas);
    game.load(campaignStages.findIndex(stage => stage.source === 'stage_jump02'), 2, 100);
    const runtime = game.runtime, [cat, other] = runtime.players, box = runtime.pushBoxes[0];
    const place = (player, x, y) => player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true);
    place(cat, 1300, 432 - cat.rect.height); place(other, 900, 432 - other.rect.height);
    for (let tick = 0; tick < 20; tick++) game.step([0, 0]);
    box.applyRect({ ...box.rect, x: cat.rect.x + cat.rect.width / 2 - box.rect.width / 2, y: cat.rect.y - box.rect.height });
    box.falling = false; box.velocityY = 0; box.wasSupported = true;
    for (let tick = 0; tick < 5; tick++) game.step([0, 0]);
    game.render();
    window.smoke = { game, cat, box, rest: { catY: cat.rect.y, boxY: box.rect.y } };
    return window.smoke.rest;
  });
  await page.screenshot({ path: path.join(output, '1-3-hop-0-rest.png') });
  // Press jump (16 | 32 = held + pressed) and keep holding: the hop is edge-triggered.
  const apex = await page.evaluate(() => {
    const { game, cat, box, rest } = window.smoke;
    const catYs = [];
    let best = { rise: 0, tick: -1 };
    for (let tick = 0; tick < 9; tick++) {
      game.step([tick === 0 ? 48 : 16, 0]);
      catYs.push(cat.rect.y);
      if (rest.boxY - box.rect.y > best.rise) best = { rise: rest.boxY - box.rect.y, tick };
    }
    game.render();
    return { catYs, best, nowRise: rest.boxY - box.rect.y };
  });
  await page.screenshot({ path: path.join(output, '1-3-hop-1-apex.png') });
  const landed = await page.evaluate(() => {
    const { game, cat, box, rest } = window.smoke;
    const catYs = [];
    let airborne = 0;
    for (let tick = 0; tick < 50; tick++) { game.step([16, 0]); catYs.push(cat.rect.y); if (box.rect.y < rest.boxY - 1e-3) airborne++; }
    game.render();
    return { catYs, boxOffset: box.rect.y - rest.boxY, falling: box.falling, airborneAfterApex: airborne };
  });
  await page.screenshot({ path: path.join(output, '1-3-hop-2-landed.png') });
  for (const y of [...apex.catYs, ...landed.catYs]) assert.equal(y, start.catY, 'the cat never rises');
  assert.ok(Math.abs(apex.best.rise - 22) <= 1, 'the box hops 22 native units: ' + apex.best.rise);
  assert.ok(Math.abs(landed.boxOffset) < 1e-4, 'it lands back exactly: ' + landed.boxOffset);
  assert.equal(landed.falling, false);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'head-hop.json'), JSON.stringify({ start, apex, landed }, null, 2));
  console.log('CAMPAIGN HEAD HOP PASS: 1-3 cat stays, box hops ' + apex.best.rise.toFixed(2) + ' native units and lands back exactly');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
