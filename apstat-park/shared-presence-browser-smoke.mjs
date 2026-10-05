// Local-only shared B/E/teacher arrival smoke. Needs Playwright and the sibling relay checkout.
// PARK_RELAY_ROOT may point to another curriculum_render checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
// PARK_RTC_SMOKE=1 also checks default-on movement and forced disconnect fallback.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';

const relayRoot = process.env.PARK_RELAY_ROOT
  ? path.resolve(process.env.PARK_RELAY_ROOT)
  : fileURLToPath(new URL('../../curriculum_render/', import.meta.url));
const { createClassroomRegistry } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/classroom.js')));
const { createParkService } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/apstat-park/service.mjs')));

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign');
const rtcPilot = process.env.PARK_RTC_SMOKE === '1';
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
wsUrl:location.origin.replace('http','ws'),section:params.get('section')||'B',username:params.get('user'),hue:params.has('hue')?+params.get('hue'):90,role:params.get('role')||'student',playable:true});</script></body></html>`);
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
  const pages = [];
  for (const [user, section, role] of [['bee','PeriodB','student'],['eve','PeriodE','student'],['teacher','PeriodX','teacher']]) {
    const page = await browser.newPage({viewport:{width:900,height:1000}}); pages.push(page);
    if (rtcPilot) await page.addInitScript(() => {
      window.testPeers = [];
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(options) { super(options); window.testPeers.push(this); }
      };
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin+'/?user='+user+'&section='+section+'&role='+role);
    await page.waitForFunction(() => board.getParkScene()?.getView()?.lobby?.members.length);
  }
  await pages[2].waitForFunction(() => board.getParkScene().getView().lobby.members.length === 3);
  await pages[2].waitForFunction(() => new Set(board.getParkScene().getView().lobby.members.map(m => m.pose.x)).size === 3);
  const view = await pages[2].evaluate(() => board.getParkScene().getView());
  assert.equal(new Set(view.lobby.members.map(member => member.pose.x)).size, 3);
  if (rtcPilot) {
    for (const page of pages) await page.waitForFunction(() => {
      const stats = board.getParkScene().getNetworkStats();
      return stats.connected === (stats.hub ? 2 : 1) && stats.fresh === 2 && stats.received > 0;
    });
    console.log('RTC connected:', await pages[2].evaluate(() => board.getParkScene().getNetworkStats()));
    // Closing real peer connections must not remove the student or stop server motion.
    const before = await pages[0].evaluate(() => board.getParkScene().getView().playerX);
    await pages[0].evaluate(() => { for (const peer of testPeers) peer.close(); board._getPlayerInput().right = true; });
    await pages[2].waitForFunction(x => board.getParkScene().getView().lobby.members.find(m => m.name === 'bee').pose.x > x + 25, before);
    await pages[0].evaluate(() => { board._getPlayerInput().right = false; });
    await pages[0].waitForFunction(() => board.getParkScene().getNetworkStats().fresh === 0);
    assert.equal(await pages[0].evaluate(() => board.getParkScene().getNetworkStats().connected), 0);
    assert.equal(await pages[2].evaluate(() => board.getParkScene().getView().lobby.members.length), 3);
    // A browser without WebRTC still gets the complete shared lobby.
    const fallback = await browser.newPage();
    fallback.on('pageerror', error => errors.push(error.message));
    await fallback.addInitScript(() => { window.RTCPeerConnection = undefined; });
    await fallback.goto(origin + '/?user=fallback&section=PeriodB&parkRtc=1');
    await fallback.waitForFunction(() => board.getParkScene()?.getView()?.lobby?.members.length === 4);
    assert.equal(await fallback.evaluate(() => board.getParkScene().getNetworkStats().supported), false);
    assert.equal(await fallback.evaluate(() => board.getParkScene().getView().lobby.rtcPeers.length), 3);
    console.log('RTC movement, forced disconnection, and unsupported-browser WebSocket fallback passed');
  }
  assert.deepEqual(errors, []);
  console.log('Shared B/E/teacher arrivals are connected and occupy three distinct visible positions');
  await pages[2].screenshot({path:path.join(output,'teacher-presence.png')});
} finally { await browser.close(); service.close(); wss.close(); server.close(); }
