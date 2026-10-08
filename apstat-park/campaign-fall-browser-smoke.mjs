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
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-fall');
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
  const page = await browser.newPage();
  await page.goto(origin + '/?user=fall-audit');
  const result = await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    const events = [], game = await createCampaignEngine({ onEvent: event => events.push(event) });
    const cases = [];
    // native-player-body: the row/actor point is rect + (16, 47) for the 32 x 46 body (was + (13, 32)).
    for (const [x, expectedX] of [[880, 720], [910, 720], [1600, 1392], [1770, 1392]]) {
      game.load(0, 2, 100); events.length = 0;
      const player = game.runtime.players[0];
      // Start below the floor, including the right edge missed by centered sensors.
      Object.assign(player.rect, { x: x - 16, y: 490 }); player.velocity.y = 200;
      for (let tick = 0; tick < 180 && !events.some(e => e.type === 'warp' || e.type === 'hit'); tick++) game.step([0, 0]);
      cases.push({ x, expectedX, actorX: player.rect.x + 16, actorY: player.rect.y + 47,
        events: events.map(e => e.type), death: player.deathTimer });
    }
    game.load(0, 2, 100); events.length = 0;
    const walker = game.runtime.players[0];
    Object.assign(walker.rect, { x: 827, y: 432 - walker.rect.height });
    for (let tick = 0; tick < 180 && !events.some(event => event.type === 'warp'); tick++) game.step([2, 0]);
    const walkingReturn = { x: walker.rect.x + 16, y: walker.rect.y + 47, events: events.map(event => event.type) };
    // Two arrivals use the native per-zone counter and -50 vertical offset.
    game.load(0, 2, 100); events.length = 0;
    for (const player of game.runtime.players) {
      Object.assign(player.rect, { x: 897, y: 490 }); player.velocity.y = 200;
    }
    game.step([0, 0]);
    const pair = game.runtime.players.map(player => ({ x: player.rect.x + 16, y: player.rect.y + 47 }));
    for (let tick = 0; tick < 120; tick++) game.step([0, 0]);
    const settled = game.runtime.players.map(player => ({ x: player.rect.x + 16, feet: player.rect.y + player.rect.height }));
    const deaths = events.filter(event => event.type === 'hit' || event.type === 'dead');
    game.dispose(); return { cases, walkingReturn, pair, settled, deaths };
  });
  for (const sample of result.cases) {
    assert.ok(sample.events.includes('warp'), 'fall at x=' + sample.x + ' must enter its pit Warp: ' + JSON.stringify(sample));
    assert.equal(sample.actorX, sample.expectedX);
    assert.equal(sample.actorY, -48);
    assert.equal(sample.death, 0);
  }
  assert.deepEqual(result.pair, [{ x: 720, y: -48 }, { x: 720, y: -98 }]);
  assert.deepEqual(result.walkingReturn, { x: 720, y: -48, events: ['warp'] }, 'walking off the ledge uses the Warp, without death');
  assert.deepEqual(result.deaths, []);
  assert.ok(result.settled.every(player => player.x === 720 && player.feet <= 432), 'players land on the near side, never at the entrance');
  writeFileSync(path.join(output, 'fall-audit.json'), JSON.stringify(result, null, 2));
  console.log('CAMPAIGN FALL PASS: both pits, right edges, above-pit destinations, staggered multiplayer return and safe landing');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
