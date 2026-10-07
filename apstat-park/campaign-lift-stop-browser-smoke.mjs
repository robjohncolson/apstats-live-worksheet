// Local-only smoke (teacher 2026-10-07, retail capture og-capture-2/notes.md run L4): in the real browser engine,
// 1-4, a cat stands on the floor under the UpDownLift. The lift comes down, stops on its head, holds ~68 ticks
// (the time its sine path spends below the head) and rises again; the cat never moves, is never inside the lift
// and is never hurt (recovered patch 'descending-lift-stops-on-bodies'). Needs Playwright: PARK_PLAYWRIGHT_MODULE
// may point to an installed playwright-core index.mjs and PARK_BROWSER to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-lift-stop');
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
    game.load(campaignStages.findIndex(stage => stage.source === 'stage_weight01'), 2, 100);
    const runtime = game.runtime, [other, cat] = runtime.players;
    const lift = runtime.weightedLifts.find(entry => entry.spawn.actorName === 'UpDownLift');
    const place = (player, x, y) => player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true);
    place(other, 820, 432 - other.rect.height); place(cat, 900, 432 - cat.rect.height);
    game.render();
    window.smoke = { game, cat, lift };
    return { cat: { ...cat.rect } };
  });
  await page.screenshot({ path: path.join(output, '1-4-lift-0-start.png') });
  const run = async (ticks, untilContact) => page.evaluate(({ ticks, untilContact }) => {
    const { game, cat, lift } = window.smoke;
    const rows = [];
    for (let tick = 0; tick < ticks; tick++) {
      game.step([0, 0]);
      rows.push({ catX: cat.rect.x, catY: cat.rect.y, liftY: lift.rect.y, liftBottom: lift.rect.y + lift.rect.height,
        liftX: lift.rect.x, liftW: lift.rect.width, hurt: cat.deathTimer > 0 });
      if (untilContact && lift.rect.y + lift.rect.height === cat.rect.y) break;
    }
    game.render();
    return rows;
  }, { ticks, untilContact });
  const approach = await run(400, true);
  await page.screenshot({ path: path.join(output, '1-4-lift-1-on-head.png') });
  const hold = await run(40, false);
  await page.screenshot({ path: path.join(output, '1-4-lift-2-holding.png') });
  const after = await run(80, false);
  await page.screenshot({ path: path.join(output, '1-4-lift-3-risen.png') });
  const rows = [...approach, ...hold, ...after];
  const inside = r => r.catX < r.liftX + r.liftW && r.liftX < r.catX + 26 && r.catY < r.liftBottom - 1e-6 && r.liftY < r.catY + 34;
  for (const [i, r] of rows.entries()) {
    assert.equal(r.catY, start.cat.y, 'the cat never moves (tick ' + i + ')');
    assert.equal(r.catX, start.cat.x, 'the cat never moves (tick ' + i + ')');
    assert.ok(!r.hurt, 'never hurt (tick ' + i + ')');
    assert.ok(!inside(r), 'never inside the lift (tick ' + i + ')');
  }
  assert.equal(approach.at(-1).liftBottom, start.cat.y, 'the lift stopped on the head');
  const held = rows.filter(r => r.liftBottom === start.cat.y).length;
  assert.ok(held >= 64 && held <= 72, 'held ~68 ticks: ' + held);
  assert.ok(after.at(-1).liftY < approach.at(-1).liftY - 20, 'and rose again');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'lift-stop.json'), JSON.stringify({ start, rows }, null, 2));
  console.log('CAMPAIGN LIFT STOP PASS: 1-4 UpDownLift stopped on the cat head after ' + approach.length
    + ' ticks, held ' + held + ' ticks, rose again; cat never moved, never inside, never hurt');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
