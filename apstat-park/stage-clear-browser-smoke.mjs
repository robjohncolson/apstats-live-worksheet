// Local-only goal-door presentation smoke. Needs Playwright and the sibling relay checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { createParkService } from '../../curriculum_render/railway-server/apstat-park/service.mjs';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-clear');
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

// Goal fixture: skip the platform route, but use the real relay and real Up input
// for each arrival. This exercises the completion event and actual canvas drawing.
try {
  const pages = [];
  for (const name of ['alice', 'bob']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?user=' + name);
    await page.waitForFunction(() => window.board?.getParkScene?.()?.kind === 'calculator');
    await page.evaluate(() => board.openNativeGameplay(0));
    await page.waitForFunction(() => board.getParkScene()?.getGame?.().getWorld().shown);
    pages.push(page);
  }
  const [alice, bob] = pages;
  await alice.waitForFunction(() => board.getParkScene().replica.state.online.length === 2);
  await alice.evaluate(() => {
    const r = board.getParkScene().replica;
    r.queue('key', 'key', { ...r.state.level.key, vx: 0, vy: 0 });
  });
  await alice.waitForFunction(() => board.getParkScene().replica.state.progress.keyHolder === 'alice');
  await alice.evaluate(() => {
    const r = board.getParkScene().replica;
    r.queue('unlock', 'door', { ...r.state.level.goal, vx: 0, vy: 0 });
  });
  for (const page of pages) {
    await page.waitForFunction(() => board.getParkScene().replica.state.progress.doorOpen);
    await page.evaluate(() => {
      const w = board.getParkScene().getGame().getWorld();
      Object.assign(w.player, { x: w.level.goal.x - 2, y: w.level.goal.y - 1, vx: 0, vy: 0 });
    });
  }
  await alice.waitForTimeout(600);
  const before = await alice.evaluate(() => {
    const c = board.getCanvas(), ctx = c.getContext('2d'), pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let y = c.height - 10; y > c.height / 2; y--) for (let x = 20; x < c.width - 20; x++) {
      const i = (y * c.width + x) * 4;
      if (pixels[i] === 255 && pixels[i + 1] === 134 && pixels[i + 2] === 77)
        return { x, y, colour: [...pixels.slice(i, i + 4)] };
    }
    throw new Error('No orange floor pixel in goal fixture');
  });
  await alice.keyboard.press('ArrowUp');
  await alice.waitForFunction(() => board.getParkScene().replica.state.progress.arrived.includes('alice'));
  await alice.waitForTimeout(1000);
  assert.equal(await alice.evaluate(() => board.getParkScene().getGame().getWorld().clear), null,
    'one arrival cannot start the team celebration');
  await bob.keyboard.press('ArrowUp');
  await alice.waitForFunction(() => board.getParkScene().getGame().getWorld().clear?.visible);
  const entering = await alice.evaluate(() => board.getParkScene().getGame().getWorld().clear);
  assert.ok(entering.x < 100, 'the banner enters from the left');
  await alice.waitForTimeout(400);
  await alice.screenshot({ path: path.join(output, 'clear-sliding.png'), fullPage: true });
  await alice.waitForFunction(() => {
    const frame = board.getParkScene().getGame().getWorld().clear;
    return Math.abs(frame.x - board.getCanvas().getBoundingClientRect().width / 2) < 0.1;
  });
  const after = await alice.evaluate(({ x, y }) => [...board.getCanvas().getContext('2d').getImageData(x, y, 1, 1).data], before);
  assert.ok(after[0] >= 253, 'filter output allows GPU rounding');
  assert.ok(after[1] > 210 && after[2] > 190, 'orange floor becomes a pale shade of white: ' + after);
  const background = await alice.evaluate(() => {
    const c = board.getCanvas();
    return [...c.getContext('2d').getImageData(c.width - 4, 4, 1, 1).data];
  });
  assert.ok(background[3] === 0 || background.slice(0, 3).join(',') === '247,245,238',
    'the calendar background keeps its colour');
  await alice.screenshot({ path: path.join(output, 'clear-centered.png'), fullPage: true });
  await alice.setViewportSize({ width: 390, height: 1000 });
  await alice.waitForTimeout(100);
  assert.ok(await alice.evaluate(() => Math.abs(board.getParkScene().getGame().getWorld().clear.x
    - board.getCanvas().getBoundingClientRect().width / 2) < 1));
  await alice.screenshot({ path: path.join(output, 'clear-mobile.png'), fullPage: true });
  for (const page of pages) await page.keyboard.press('Escape');
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await alice.evaluate(() => board.openNativeGameplay(0));
  await alice.waitForFunction(() => board.getParkScene()?.getGame?.().getWorld().shown);
  assert.equal(await alice.evaluate(() => board.getParkScene().getGame().getWorld().clear), null);
  assert.deepEqual(errors, []);
  console.log('STAGE CLEAR BROWSER PASS');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
