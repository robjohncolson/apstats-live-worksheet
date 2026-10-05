// Local-only campaign coverage and synchronized progression smoke. Needs Playwright and the sibling relay checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { createParkService } from '../../curriculum_render/railway-server/apstat-park/service.mjs';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-presentation');
mkdirSync(output, { recursive: true });
const registry = createClassroomRegistry(), sockets = new Map(), errors = [], packets = [];
let hour = 0, timeOffset = 0;
const net = { latency: +(process.env.PARK_LATENCY_MS || 0), jitter: +(process.env.PARK_JITTER_MS || 0) };
const outAt = new WeakMap(), inAt = new WeakMap();
// One-way delay of latency + uniform(0, jitter) ms per message and direction, in order (review probe).
function delayed(map, ws, fn) {
  if (!net.latency && !net.jitter) return fn();
  const at = Math.max(map.get(ws) || 0, performance.now() + net.latency + Math.random() * net.jitter);
  map.set(ws, at); setTimeout(fn, at - performance.now());
}
const send = (ws, message) => delayed(outAt, ws, () => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); });
const service = createParkService({ registry, wallNow: () => hour * 3600000,
  now: () => performance.now() + timeOffset, send });
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#edf3ee;font:16px system-ui"><main style="max-width:640px;margin:20px auto;background:#f7f5ee">
<h1>AP Statistics calendar</h1><div id="board"></div><p id="calendar">Today's lesson stays here.</p></main>
<script src="/canvas_engine.js"></script><script src="/sprite_sheet.js"></script><script src="/classroom-board.js"></script>
<script>const params=new URL(location.href).searchParams;window.board=ClassroomBoard.mount(document.querySelector('#board'),{
wsUrl:location.origin.replace('http','ws'),section:params.get('section')||'B',username:params.get('user'),hue:params.has('hue')?+params.get('hue'):90,role:params.get('role')||'student'});</script></body></html>`);
    return;
  }
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const file = path.resolve(app, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(app + path.sep)) { response.writeHead(403); response.end(); return; }
  response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); }); stream.pipe(response);
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  ws.on('message', bytes => delayed(inAt, ws, () => {
    const message = JSON.parse(bytes);
    if (message.type === 'classroom_join') {
      registry.join(ws, message.section, message.username, message.role, Date.now(), message.hue);
      sockets.set(ws, message);
      for (const [socket, who] of sockets) send(socket, registry.stateFor(who.section, who.role, who.username));
    } else if (service.accepts(message)) {
      packets.push({ name: sockets.get(ws)?.username, ...message });
      const result = service.handle(ws, message); if (result) send(ws, result);
    }
  }));
  ws.on('close', () => { sockets.delete(ws); service.detached(ws); registry.detach(ws, Date.now()); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/?user=alice');
  await page.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await page.evaluate(() => board.openParkLevel(6));
  await page.waitForFunction(() => board.getParkScene()?.getGame?.().getWorld().shown);
  await page.waitForTimeout(500);
  const reference = await page.evaluate(() => {
    const world = board.getParkScene().getGame().getWorld();
    return { height: board.getBoardHeight(), lift: { x: world.lift.x, y: world.lift.y, w: world.lift.w, h: world.lift.h }, steps: world.terrain.filter(item => item.party)
      .map(({ x, y, w, h }) => ({ x, y, w, h })).sort((a, b) => a.x - b.x) };
  });
  await page.screenshot({ path: path.join(output, 'previous-1-1.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await page.evaluate(() => board.openNativeGameplay(0));
  await page.waitForFunction(() => board.getParkScene()?.getView().frame > 60);
  const current = await page.evaluate(() => {
    const game = board.getParkScene().getGame();
    const ctx = game.canvas.getContext('2d');
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    const lift = game.runtime.weightedLifts[0].rect;
    return { height: board.getBoardHeight(), lift: { x: lift.x / 2, y: lift.y / 2, w: lift.width / 2, h: lift.height / 2 }, steps: game.runtime.staticRects.map(({ rect: r }) =>
      ({ x: r.x / 2, y: r.y / 2, w: r.width / 2, h: r.height / 2 })).sort((a, b) => a.x - b.x),
      lowerFloor: pixel(100, 745), pit: pixel(445, 745), oldDebugLine: pixel(440, 748),
      viewport: game.getView().projection, marker: pixel(50, 670), cat: pixel(50, 682) };
  });
  assert.equal(current.height, reference.height);
  assert.deepEqual(current.steps.map(({ h, ...surface }) => surface), reference.steps.map(({ h, ...surface }) => surface),
    'native bodies retain the previously verified stair tops and widths');
  assert.deepEqual(current.steps.map(step => step.h), [36.5, 36.5],
    'Rect factory bb7696b uses the full 73-unit height, including the overlapping skirt');
  assert.deepEqual(current.lift, reference.lift, 'the lift keeps its verified resting surface and size');
  assert.deepEqual(current.lowerFloor, [255, 134, 77, 255], 'the ground continues to the bottom of the playspace');
  assert.equal(current.pit[3], 0, 'pits remain open');
  assert.equal(current.oldDebugLine[3], 0, 'invisible warp sensors have no debug outline');
  assert.ok(current.marker[3] > 0 && current.marker[1] > current.marker[0], 'local cat marker retains the green calendar hue');
  assert.ok(current.cat[3] > 0 && current.cat[1] > current.cat[0], 'the local cat retains its calendar hue');
  assert.deepEqual(current.viewport, { x: 0, y: 484, scale: .5 });
  await page.screenshot({ path: path.join(output, 'restored-1-1.png') });
  // Exercise the corrected collision surface with actual fixed-step physics.
  const landing = await page.evaluate(() => {
    const game = board.getParkScene().getGame(), player = game.runtime.players[0];
    Object.assign(player.rect, { x: 1360, y: 280 });
    player.velocity.x = 0; player.velocity.y = 0;
    for (let i = 0; i < 45; i++) game.step([0, 0]);
    game.render();
    return { feet: player.rect.y + player.rect.height, grounded: player.grounded, cameraX: game.getView().projection.x };
  });
  assert.ok(landing.grounded && Math.abs(landing.feet - 336) < 2.1, 'the cat lands on the displayed upper step');
  assert.ok(landing.cameraX < -300, 'the camera follows the local cat through the level');
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(output, 'restored-1-1-mobile.png') });
  assert.deepEqual(errors, []);
  console.log('CAMPAIGN PRESENTATION PASS: verified steps, floor, pits, hidden sensors, cat colour, camera and landing');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
