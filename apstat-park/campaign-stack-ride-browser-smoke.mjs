// Local-only smoke (teacher 2026-10-07, retail capture og-capture-2/notes.md): in the real browser engine,
// 1-3, a cat / cat / box stack. The bottom cat walks right then left: the top cat and the box ride it by its
// exact dx every tick (recovered patch 'stack-riding'); its jump press then rises 0 (the box hops).
// Needs Playwright: PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs and PARK_BROWSER
// to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-stack-ride');
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
const RIGHT = 2, LEFT = 1, JUMP = 48;

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
    const runtime = game.runtime, [bottom, top] = runtime.players, box = runtime.pushBoxes[0];
    const place = (player, x, y) => player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true);
    place(bottom, 1300, 432 - bottom.rect.height); place(top, 1300, bottom.rect.y - top.rect.height);
    for (let tick = 0; tick < 20; tick++) game.step([0, 0]);
    box.applyRect({ ...box.rect, x: top.rect.x + top.rect.width / 2 - box.rect.width / 2, y: top.rect.y - box.rect.height });
    box.falling = false; box.velocityY = 0; box.wasSupported = true;
    for (let tick = 0; tick < 5; tick++) game.step([0, 0]);
    game.render();
    window.smoke = { game, bottom, top, box };
    return { bottom: { ...bottom.rect }, top: { ...top.rect }, box: { ...box.rect } };
  });
  await page.screenshot({ path: path.join(output, '1-3-stack-0-rest.png') });
  const walk = async (bits, ticks) => page.evaluate(({ bits, ticks }) => {
    const { game, bottom, top, box } = window.smoke;
    const rows = [];
    for (let tick = 0; tick < ticks; tick++) {
      game.step([bits, 0]);
      rows.push({ bottomX: bottom.rect.x, topX: top.rect.x, boxX: box.rect.x, topY: top.rect.y, boxY: box.rect.y, boxFalling: box.falling });
    }
    game.render();
    return rows;
  }, { bits, ticks });
  const right = await walk(RIGHT, 24);
  await page.screenshot({ path: path.join(output, '1-3-stack-1-walked-right.png') });
  const left = await walk(LEFT, 24);
  await page.screenshot({ path: path.join(output, '1-3-stack-2-walked-left.png') });
  const jump = await walk(JUMP, 1).then(async (first) => first.concat(await walk(16, 30)));
  await page.screenshot({ path: path.join(output, '1-3-stack-3-after-jump.png') });

  const topOffset = start.top.x - start.bottom.x, boxOffset = start.box.x - start.bottom.x;
  for (const [i, row] of [...right, ...left].entries()) {
    assert.equal(row.topX - row.bottomX, topOffset, 'the top cat rides (tick ' + i + ')');
    assert.equal(row.boxX - row.bottomX, boxOffset, 'the box rides (tick ' + i + ')');
    assert.equal(row.topY, start.top.y, 'the top cat stays on the head (tick ' + i + ')');
    assert.equal(row.boxFalling, false, 'the box stays on the head (tick ' + i + ')');
  }
  // 24 ticks at the native 3 per tick = 72 (was 4.9 per tick, ~118).
  assert.ok(right.at(-1).bottomX - start.bottom.x > 60, 'the bottom cat walked right: ' + (right.at(-1).bottomX - start.bottom.x));
  for (const row of jump) assert.equal(row.topY, start.top.y, 'a jump press with a stack on the head: the cats stay');
  const hop = start.box.y - Math.min(...jump.map(row => row.boxY));
  assert.ok(Math.abs(hop - 22) <= 1, 'and the free top box hops 22: ' + hop);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'stack-ride.json'), JSON.stringify({ start, right, left, jump }, null, 2));
  console.log('CAMPAIGN STACK RIDE PASS: 1-3 top cat and box ride the walking bottom cat by its exact dx for '
    + (right.length + left.length) + ' ticks (walked ' + (right.at(-1).bottomX - start.bottom.x).toFixed(1)
    + ' right); jump press: cats stay, box hops ' + hop.toFixed(2));
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
