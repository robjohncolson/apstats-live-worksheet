// Local-only smoke (teacher 2026-10-07: "the box is stuck to the cat's head like crazy glue"): in the real
// browser engine, 1-3, a box rests on a cat's head, the cat walks away, and the box stays put in x and
// falls (recovered patch 'push-box-head-carry', native rule). Needs Playwright: PARK_PLAYWRIGHT_MODULE
// may point to an installed playwright-core index.mjs and PARK_BROWSER to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-head-box');
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
    // native-player-body: standing on the 432 floor = rect.y 432 - 46 (the 34-tall cat used 400, 2 inside the floor).
    place(cat, 1300, 432 - cat.rect.height); place(other, 900, 432 - other.rect.height);
    box.applyRect({ ...box.rect, x: cat.rect.x + cat.rect.width / 2 - box.rect.width / 2, y: cat.rect.y - box.rect.height });
    box.falling = false; box.velocityY = 0; box.wasSupported = true;
    for (let tick = 0; tick < 2; tick++) game.step([0, 0]);
    game.render();
    window.smoke = { game, cat, box };
    return { box: { ...box.rect }, cat: { ...cat.rect } };
  });
  await page.screenshot({ path: path.join(output, '1-3-box-on-head.png') });
  const walking = await page.evaluate(() => {
    const { game, cat, box } = window.smoke;
    const xs = [];
    for (let tick = 0; tick < 24; tick++) { game.step([2, 0]); xs.push(box.rect.x); }
    game.render();
    return { boxXs: [...new Set(xs)], cat: { ...cat.rect }, box: { ...box.rect }, falling: box.falling };
  });
  await page.screenshot({ path: path.join(output, '1-3-cat-walked-away.png') });
  const landed = await page.evaluate(() => {
    const { game, box } = window.smoke;
    for (let tick = 0; tick < 90; tick++) game.step([0, 0]);
    game.render();
    return { box: { ...box.rect }, falling: box.falling };
  });
  await page.screenshot({ path: path.join(output, '1-3-box-fell.png') });
  assert.equal(start.box.y + start.box.height, start.cat.y, 'the box rested on the head');
  assert.deepEqual(walking.boxXs, [start.box.x], 'the box never moved with the walking cat');
  assert.ok(walking.cat.x > start.box.x + start.box.width, 'the cat walked out from under it');
  assert.equal(landed.box.x, start.box.x);
  assert.equal(landed.falling, false);
  assert.ok(Math.abs(landed.box.y + landed.box.height - 432) < 1, 'the box fell to the floor: ' + JSON.stringify(landed.box));
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'head-box.json'), JSON.stringify({ start, walking, landed }, null, 2));
  console.log('CAMPAIGN HEAD BOX PASS: 1-3 box rests on the head, stays in x as the cat walks away, and falls to the floor');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
