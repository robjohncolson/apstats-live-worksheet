// Local-only smoke (teacher 2026-10-07): a push box that falls past the kill line returns to its
// spawn x and drops back onto its origin, in the real browser engine (recovered patch
// 'push-box-sky-respawn'). Needs Playwright: PARK_PLAYWRIGHT_MODULE may point to an installed
// playwright-core index.mjs and PARK_BROWSER to a Chromium/Edge/Chrome executable.
// 1-3 (stage_jump02) is the stage with boxes on cats' heads over a bottomless pit; in 1-2
// (stage_push02) every column has ground, so a pushed-off pillar lands and stays (checked too).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-box-respawn');
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
  // Load the engine, settle 1-3, carry its first box over the bottomless pit and let it go.
  await page.evaluate(async () => {
    const { createCampaignEngine, campaignStages } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    document.getElementById('stage').append(game.canvas);
    const index = campaignStages.findIndex(stage => stage.source === 'stage_jump02');
    game.load(index, 2, 100);
    for (let tick = 0; tick < 120; tick++) game.step([0, 0]);
    const box = game.runtime.pushBoxes[0];
    window.smoke = { game, box, rest: { x: box.rect.x, y: box.rect.y }, spawn: { ...box.spawnRect },
      killLine: game.runtime.scrollCameraConfig.failWindow, lowest: -Infinity, back: null };
    box.applyRect({ ...box.rect, x: 100 });
    game.render();
  });
  await page.screenshot({ path: path.join(output, '1-3-box-over-pit.png') });
  const fall = await page.evaluate(() => {
    const { game, box, spawn } = window.smoke;
    for (let tick = 0; tick < 600 && !window.smoke.back; tick++) {
      game.step([0, 0]);
      if (box.rect.x === spawn.x) window.smoke.back = { ...box.rect, falling: box.falling, tick };
      else window.smoke.lowest = Math.max(window.smoke.lowest, box.rect.y);
    }
    game.render();
    const { lowest, back, killLine } = window.smoke;
    return { lowest, back, killLine, mapHeight: game.runtime.tileMap.pixelHeight };
  });
  await page.screenshot({ path: path.join(output, '1-3-box-returned.png') });
  const landed = await page.evaluate(() => {
    const { game, box, rest } = window.smoke;
    for (let tick = 0; tick < 240; tick++) game.step([0, 0]);
    game.render();
    return { x: box.rect.x, y: box.rect.y, falling: box.falling, rest };
  });
  await page.screenshot({ path: path.join(output, '1-3-box-landed.png') });
  // 1-2: the pillar dropped into the floored pit lands there and is not returned.
  const push02 = await page.evaluate(() => {
    const { game } = window.smoke;
    return import('/apstat-park/campaign-engine.mjs').then(({ campaignStages }) => {
      game.load(campaignStages.findIndex(stage => stage.source === 'stage_push02'), 2, 100);
      const pillar = game.runtime.pushBoxes[1];
      pillar.applyRect({ ...pillar.rect, x: 960 }); pillar.falling = true;
      for (let tick = 0; tick < 300; tick++) game.step([0, 0]);
      game.render();
      return { x: pillar.rect.x, y: pillar.rect.y, falling: pillar.falling, spawnX: pillar.spawnRect.x };
    });
  });
  await page.screenshot({ path: path.join(output, '1-2-pillar-in-pit.png') });

  assert.ok(fall.lowest > fall.mapHeight, '1-3 box fell below the map toward the kill line: ' + JSON.stringify(fall));
  assert.ok(fall.back, '1-3 box came back');
  assert.equal(fall.back.falling, true, 'it returns falling from rest');
  assert.equal(landed.x, landed.rest.x, 'it lands at its origin x');
  assert.ok(Math.abs(landed.y - landed.rest.y) < 1e-6, 'it lands where it rests from its spawn: ' + JSON.stringify(landed));
  assert.equal(landed.falling, false);
  assert.equal(push02.x, 960, '1-2 pillar stays in the floored pit');
  assert.equal(push02.falling, false);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'box-respawn.json'), JSON.stringify({ fall, landed, push02 }, null, 2));
  console.log('CAMPAIGN BOX RESPAWN PASS: 1-3 box past the kill line returns to its spawn x and lands at its origin; 1-2 pillar stays in its pit');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
