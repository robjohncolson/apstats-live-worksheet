// Local-only smoke (teacher 2026-10-07): literal Rects use the native left-bottom anchor (recovered patch
// 'rect-left-bottom-anchor'), checked and screenshot in the real browser engine for 1-1, 1-3 and 2-2.
// Needs Playwright: PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs and
// PARK_BROWSER to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-rect-anchor');
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
  await page.evaluate(async () => {
    const { createCampaignEngine, campaignStages } = await import('/apstat-park/campaign-engine.mjs');
    window.smoke = { game: await createCampaignEngine(), campaignStages };
    document.getElementById('stage').append(window.smoke.game.canvas);
  });
  const results = {};
  for (const [label, source] of [['1-1', 'stage_jump01'], ['1-3', 'stage_jump02'], ['2-2', 'stage_fall01']]) {
    results[label] = await page.evaluate((source) => {
      const { game, campaignStages } = window.smoke;
      game.load(campaignStages.findIndex(stage => stage.source === source), 2, 100);
      for (let tick = 0; tick < 60; tick++) game.step([0, 0]);
      game.render();
      return game.runtime.staticRects.filter(block => block.spawn.actorName === 'Rect')
        .map(({ spawn, rect }) => ({ raw: spawn.raw.slice(4, 8), rect: { ...rect } }));
    }, source);
    await page.screenshot({ path: path.join(output, 'rects-' + label + '.png') });
  }
  // 1-3: the square is 320..368 (64-unit gap above the floor at 432); every 1-3 / 2-2 Rect's bottom is its Lua y.
  const square = results['1-3'].find(r => r.raw[0] === 1056 && r.raw[1] === 368);
  assert.deepEqual(square.rect, { x: 1056, y: 320, width: 48, height: 48 });
  for (const label of ['1-3', '2-2']) for (const { raw, rect } of results[label]) {
    assert.equal(rect.y + rect.height, raw[1], label + ' bottom = Lua y for ' + JSON.stringify(raw));
    assert.equal(rect.x, raw[2] < 0 ? raw[0] + raw[2] : raw[0], label + ' signed-width x for ' + JSON.stringify(raw));
  }
  // 1-1: the measured override (left/bottom, 25-unit skirt) is unchanged.
  for (const { raw, rect } of results['1-1']) {
    assert.deepEqual(rect, { x: raw[0], y: raw[1] - raw[3], width: raw[2], height: raw[3] - 25 });
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'rects.json'), JSON.stringify(results, null, 2));
  console.log('CAMPAIGN RECT ANCHOR PASS: 1-3 square at 320..368; 1-3 and 2-2 Rect bottoms on their Lua y; 1-1 override unchanged');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
