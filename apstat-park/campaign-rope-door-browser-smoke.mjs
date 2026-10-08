// Local-only smoke (teacher 2026-10-08 on 2-1: rope not drawn, cats behind the door, entered cats still solid): in
// the real browser engine, 2-1 at party 2 (recovered patches 'rope-draw', 'actor-draw-depth', 'goal-enter-native').
// 1. The rope is a visible Graphics line between the two cats. 2. A cat standing in the Goal door sorts in front of
// the door. 3. UP pressed in the open door: the cat is hidden and not solid (the other cat walks through its spot).
// Needs Playwright: PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs and PARK_BROWSER to a
// Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-rope-door');
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
const UP = 4 | 512, RIGHT = 2;   // UP held + the UP press edge (wire bit 512, goal-enter-native)

try {
  const page = await browser.newPage({ viewport: { width: 760, height: 780 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');

  // 1. The rope between the two cats.
  const rope = await page.evaluate(async () => {
    const { createCampaignEngine, campaignStages } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    document.getElementById('stage').append(game.canvas);
    game.load(campaignStages.findIndex(stage => stage.source === 'stage_constraint01'), 2, 100);
    const runtime = game.runtime, [a, b] = runtime.players;
    const place = (player, x, y) => player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true);
    place(a, 560, 240 - a.rect.height - 60); place(b, 700, 240 - b.rect.height);
    for (let tick = 0; tick < 3; tick++) game.step([0, 0]);
    game.render();
    window.smoke = { game, runtime, a, b, place };
    const view = [...runtime.ropeViews.values()][0];
    const squares = view.geometry.graphicsData.map((data) => data.shape);
    const xs = squares.map((s) => s.x), ys = squares.map((s) => s.y);
    return {
      exists: !!view, visible: view.visible && view.worldVisible, inActorLayer: view.parent === runtime.actorLayer,
      marker: runtime.distanceConstraints[0].view.visible, color: view.geometry.graphicsData[0]?.fillStyle.color,
      count: squares.length, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
      a: { ...a.rect }, b: { ...b.rect }, ropeZ: view.zIndex, catZ: [a.view.zIndex, b.view.zIndex],
    };
  });
  await page.screenshot({ path: path.join(output, '2-1-rope.png') });
  assert.ok(rope.exists && rope.visible && rope.inActorLayer, 'the rope view exists, is visible and in the actor layer');
  assert.equal(rope.marker, false, 'the green spawn marker is hidden');
  assert.equal(rope.color, 0xff864d);
  assert.ok(rope.count > 20, 'the rope has its squares: ' + rope.count);
  const aCx = rope.a.x + rope.a.width / 2, bCx = rope.b.x + rope.b.width / 2;
  assert.ok(rope.minX >= aCx + 5 - 1e-6 && rope.maxX <= bCx - 5 + 1, `the rope runs between the cats (${rope.minX}..${rope.maxX} vs ${aCx}..${bCx})`);
  assert.ok(rope.minY >= rope.a.y && rope.maxY <= rope.b.y + rope.b.height, 'the rope runs between the cats vertically');
  assert.ok(rope.ropeZ < Math.min(...rope.catZ), 'the rope draws behind the cats');

  // 2. A cat in the open Goal door sorts in front of the door.
  const depth = await page.evaluate(() => {
    const { game, runtime, a, b, place } = window.smoke;
    const goal = runtime.goals[0];
    goal.setOpened(true);
    place(a, goal.rect.x + 8, 240 - a.rect.height); place(b, goal.rect.x - 40, 240 - b.rect.height);
    for (let tick = 0; tick < 5; tick++) game.step([0, 0]);
    game.render();
    const children = runtime.actorLayer.children;
    return { catIndex: children.indexOf(a.view), doorIndex: children.indexOf(goal.view), catZ: a.view.zIndex, doorZ: goal.view.zIndex,
      overlaps: a.rect.x < goal.rect.x + goal.rect.width && goal.rect.x < a.rect.x + a.rect.width };
  });
  await page.screenshot({ path: path.join(output, '2-1-cat-in-front-of-door.png') });
  assert.ok(depth.overlaps, 'the cat stands in the door');
  assert.ok(depth.catZ > depth.doorZ, `cat zIndex ${depth.catZ} over door ${depth.doorZ}`);
  assert.ok(depth.catIndex > depth.doorIndex, `after the render sort the cat (child ${depth.catIndex}) draws after the door (${depth.doorIndex})`);

  // 3. UP press in the open door: hidden, not solid; the other cat walks through the spot.
  const enter = await page.evaluate(({ UP, RIGHT }) => {
    const { game, runtime, a, b } = window.smoke;
    game.step([UP, 0]);
    const spot = { ...a.rect };
    const result = { entered: runtime.goalClearedPlayers.has(a), visible: a.view.visible, cleared: !!runtime.cleared };
    let through = false;
    for (let tick = 0; tick < 30; tick++) {
      game.step([0, RIGHT]);
      if (b.rect.x < spot.x + spot.width && spot.x < b.rect.x + b.rect.width) through = true;
      if (tick === 12) game.render();
    }
    return { ...result, through, bx: b.rect.x, spotX: spot.x };
  }, { UP, RIGHT });
  await page.screenshot({ path: path.join(output, '2-1-entered-cat-walked-through.png') });
  assert.equal(enter.entered, true, 'UP in the open door enters');
  assert.equal(enter.visible, false, 'the entered cat is hidden');
  assert.equal(enter.cleared, false, 'one of two cats inside is not a clear');
  assert.ok(enter.through, `the other cat walks through the entered cat's spot (b x ${enter.bx}, spot x ${enter.spotX})`);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'rope-door.json'), JSON.stringify({ rope, depth, enter }, null, 2));
  console.log(`CAMPAIGN ROPE / DOOR PASS: 2-1 rope ${rope.count} squares between the cats (#ff864d, behind them); cat child ${depth.catIndex} over door ${depth.doorIndex}; entered cat hidden, walked through`);
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
