// Local-only integration smoke. Needs Playwright and the sibling relay checkout.
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
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/apstat-park');
mkdirSync(output, { recursive: true });
const registry = createClassroomRegistry(), sockets = new Map(), errors = [], packets = [];
let hour = 0, timeOffset = 0;
const send = (ws, message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
const service = createParkService({ registry, wallNow: () => hour * 3600000,
  now: () => performance.now() + timeOffset, send });
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#edf3ee;font:16px system-ui"><main style="max-width:640px;margin:20px auto">
<h1>AP Statistics calendar</h1><div id="board"></div><p id="calendar">Today's lesson stays here.</p></main>
<script src="/canvas_engine.js"></script><script src="/sprite_sheet.js"></script><script src="/classroom-board.js"></script>
<script>const params=new URL(location.href).searchParams;window.board=ClassroomBoard.mount(document.querySelector('#board'),{
wsUrl:location.origin.replace('http','ws'),section:params.get('section')||'B',username:params.get('user'),hue:90,role:params.get('role')||'student'});</script></body></html>`);
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
  ws.on('message', bytes => {
    const message = JSON.parse(bytes);
    if (message.type === 'classroom_join') {
      registry.join(ws, message.section, message.username, message.role, Date.now(), message.hue);
      sockets.set(ws, message);
      for (const [socket, who] of sockets) send(socket, registry.stateFor(who.section, who.role, who.username));
    } else if (service.accepts(message)) {
      packets.push({ name: sockets.get(ws)?.username, ...message });
      const result = service.handle(ws, message); if (result) send(ws, result);
    }
  });
  ws.on('close', () => { sockets.delete(ws); service.detached(ws); registry.detach(ws, Date.now()); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
const scene = '[data-park-scene]';
async function open(name, section = 'B', width = 800) {
  const page = await browser.newPage({ viewport: { width, height: 700 } });
  page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:', error.message); });
  await page.goto(`${origin}/?user=${name}&section=${section}`);
  await page.waitForFunction(() => window.board?.getSpritePosition?.(new URL(location.href).searchParams.get('user')));
  return page;
}
async function entered(page) {
  await page.waitForFunction(() => !!window.board.getParkScene()?.getGame()?.getWorld());
  assert.equal(await page.locator('dialog').count(), 0);
}
async function move(page, x, jump = false) {
  await page.locator(`${scene} canvas`).focus();
  const from = await page.evaluate(() => board.getParkScene().getGame().getWorld().player.x);
  const direction = x > from ? 'ArrowRight' : 'ArrowLeft';
  if (jump) await page.keyboard.down('Space');
  await page.keyboard.down(direction);
  await page.waitForFunction(({ x, right }) => {
    const p = board.getParkScene().getGame().getWorld().player;
    return right ? p.x >= x : p.x <= x;
  }, { x, right: x > from }, { timeout: 12000, polling: 'raf' });
  await page.keyboard.up(direction);
  if (jump) await page.keyboard.up('Space');
}
async function act(page) {
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !board.getParkScene().replica.outbox.length);
}
try {
  const alice = await open('alice'), bob = await open('bob');
  const originalURL = alice.url();
  const originalStrip = await alice.locator('#board').boundingBox();
  await alice.screenshot({ path: path.join(output, 'doorway.png') });
  // Keyboard entry uses the existing classroom player, not a test teleport.
  const start = await alice.evaluate(() => board.getSpritePosition('alice').x);
  const direction = start > 43 ? 'ArrowLeft' : 'ArrowRight';
  await alice.keyboard.down(direction); await entered(alice); await alice.keyboard.up(direction);
  await bob.getByRole('button', { name: 'Enter APStat Park', exact: true }).click(); await entered(bob);
  assert.equal(alice.url(), originalURL);
  assert.equal(await alice.locator('#calendar').isVisible(), true);
  assert.equal(await alice.getByRole('button', { name: /Create group|Start|Pause|Next level/ }).count(), 0);
  // Put the calendar avatar directly inside its doorway before entering by click.
  // This is the position that lets a bubbled Up key immediately reopen the park.
  await alice.getByRole('button', { name: 'Exit to calendar' }).click();
  const approachRight = await alice.evaluate(() => board.getSpritePosition('alice').x < 32);
  const approachKey = approachRight ? 'ArrowRight' : 'ArrowLeft';
  await alice.keyboard.down(approachKey);
  await alice.waitForFunction(right => right ? board.getSpritePosition('alice').x >= 32 : board.getSpritePosition('alice').x <= 32, approachRight, {polling:'raf'});
  await alice.keyboard.up(approachKey);
  assert.ok(await alice.evaluate(() => Math.abs(board.getSpritePosition('alice').x + 10 - 43) <= 16));
  await alice.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(alice);
  const parkStrip = await alice.locator('#board').boundingBox();
  assert.equal(parkStrip.height, originalStrip.height, 'Entering must not resize the character strip');
  assert.equal(parkStrip.width, originalStrip.width);
  assert.equal(await alice.locator(scene).evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  // Reproduce the reported exit loop: Up at the actual in-world return door.
  await move(alice, 40);
  await alice.keyboard.down('ArrowUp');
  await alice.waitForFunction(() => !board.getParkScene());
  await alice.waitForTimeout(1600);
  await alice.keyboard.down('ArrowUp'); // held key auto-repeat after the cooldown
  await alice.waitForTimeout(200);
  assert.equal(await alice.locator(scene).count(), 0, 'Return door must stay in the calendar');
  await alice.keyboard.up('ArrowUp');
  await alice.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(alice);
  // The drawn doorway also returns by pointer with the scaled camera coordinates.
  await alice.locator(scene + ' canvas').click({position:{x:34,y:138}});
  await alice.waitForFunction(() => !board.getParkScene());
  await alice.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(alice);
  const before = await alice.evaluate(() => board.getSpritePosition('alice'));
  await move(alice, 220); await act(alice);
  await bob.waitForFunction(() => board.getParkScene().replica.state.progress.switches.includes('switch-0'));
  assert.deepEqual(await alice.evaluate(() => board.getSpritePosition('alice')), before, 'background classroom player must sleep');
  // Late entry inherits saved switches immediately.
  const late = await open('late'); await late.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(late);
  assert.deepEqual(await late.evaluate(() => board.getParkScene().replica.state.progress.switches), ['switch-0']);
  await late.getByRole('button', { name: 'Exit to calendar' }).click();
  await late.close();
  // A real socket interruption keeps local movement responsive and rejoins.
  for (const [socket, who] of sockets) if (who.username === 'alice') socket.terminate();
  await move(alice, 430); await act(alice);
  await alice.waitForFunction(() => board.getParkScene().replica.state.progress.switches.includes('switch-1'), null, { timeout: 15000 });
  for (const x of [640, 850]) { await move(alice, x); await act(alice); }
  await alice.waitForFunction(() => board.getParkScene().replica.state.progress.bridgeOpen);
  await alice.screenshot({ path: path.join(output, 'shared-puzzle.png') });
  // Hour boundary cannot interrupt an unfinished attempt.
  hour = 1;
  for (const [socket, who] of sockets) if (who.username === 'alice') send(socket, service.handle(socket, { type: 'park_status' }));
  assert.equal(await alice.evaluate(() => board.getParkScene().replica.state.level.index), 0);
  await bob.getByRole('button', { name: 'Exit to calendar' }).click();
  for (let i = 0; i < 3; i++) {
    await bob.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(bob);
    assert.ok(await bob.evaluate(() => board.getParkScene().getGame().getWorld().player.x > 900));
    await bob.getByRole('button', { name: 'Exit to calendar' }).click();
  }
  await move(alice, 1210); await act(alice);
  await alice.waitForFunction(() => board.getParkScene().replica.state.progress.arrived.includes('alice'));
  timeOffset += 9000;
  for (const [socket, who] of sockets) if (who.username === 'alice') send(socket, service.handle(socket, { type: 'park_status' }));
  await alice.waitForFunction(() => board.getParkScene().getGame().getWorld().level.index === 1);
  // Both sample puzzles must be physically playable with keyboard input.
  for (const index of [1, 2]) {
    const level = await alice.evaluate(() => board.getParkScene().replica.state.level);
    assert.equal(level.index, index);
    if (index === 1) {
      await move(alice, 220, true);
      await alice.waitForFunction(() => board.getParkScene().getGame().getWorld().player.grounded);
    }
    for (const item of level.samples) {
      await move(alice, item.x); await act(alice);
      await alice.waitForFunction(id => board.getParkScene().replica.state.progress.samples.includes(id), item.id);
    }
    if (index === 1) {
      await move(alice, 960);
      await alice.waitForFunction(() => board.getParkScene().getGame().getWorld().player.y > 500);
    }
    for (const station of [...level.switches].reverse()) { await move(alice, station.x); await act(alice); await act(alice); }
    await alice.waitForFunction(() => board.getParkScene().replica.state.progress.bridgeOpen);
    await move(alice, level.goal.x); await act(alice);
    await alice.waitForFunction(() => board.getParkScene().replica.state.progress.arrived.includes('alice'));
    if (index === 1) {
      hour = 2; timeOffset += 9000;
      for (const [socket, who] of sockets) if (who.username === 'alice') send(socket, service.handle(socket, { type: 'park_status' }));
      await alice.waitForFunction(() => board.getParkScene().getGame().getWorld().level.index === 2);
    }
  }
  // Reload restores the durable exit checkpoint, without sending a world snapshot every frame.
  await alice.reload(); await alice.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(alice);
  assert.ok(await alice.evaluate(() => board.getParkScene().getGame().getWorld().player.x > 1100));
  await alice.getByRole('button', { name: 'Exit to calendar' }).click();
  assert.equal(await alice.locator(`${scene}`).count(), 0);
  assert.equal(await alice.getByRole('button', { name: 'Enter APStat Park' }).isVisible(), true);
  // Mobile-sized scene and a different period remain independent.
  const mobile = await open('mobile', 'E', 360);
  await mobile.getByRole('button', { name: 'Enter APStat Park' }).click(); await entered(mobile);
  assert.deepEqual(await mobile.evaluate(() => board.getParkScene().replica.state.progress.switches), []);
  assert.ok(await mobile.locator(`${scene} canvas`).evaluate(el => el.getBoundingClientRect().width <= innerWidth));
  await mobile.screenshot({ path: path.join(output, 'mobile.png') });
  // Load the actual calendar at a short viewport with an isolated roster identity.
  // No request or socket from this test may reach a production service.
  const calendar = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const calendarErrors = [];
  calendar.on('pageerror', error => calendarErrors.push(error.message));
  await calendar.route('**/*', route => route.request().url().startsWith(origin + '/')
    ? route.continue() : route.abort());
  await calendar.addInitScript(origin => {
    localStorage.setItem('apstats_roster.v1', JSON.stringify({ studentId: 'local-smoke', username: 'calendar_test',
      realName: 'Local Test', section: 'E', role: 'student', spriteHue: 90 }));
    Object.defineProperty(window, 'RAILWAY_SERVER_URL', { get: () => origin, set() {} });
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket { constructor(url, protocols) { super(origin.replace('http', 'ws'), protocols); } };
  }, origin);
  await calendar.goto(origin + '/ap_stats_roadmap_square_mode.html', { waitUntil: 'domcontentloaded' });
  await calendar.waitForFunction(() => !!window._classroomBoardHandle);
  await calendar.getByRole('button', { name: 'Enter APStat Park' }).click();
  await calendar.waitForFunction(() => !!window._classroomBoardHandle.getParkScene()?.getGame()?.getWorld());
  await calendar.locator(`${scene} canvas`).focus();
  await calendar.keyboard.down('ArrowRight');
  await calendar.waitForFunction(() => _classroomBoardHandle.getParkScene().getGame().getWorld().player.x > 130);
  await calendar.keyboard.up('ArrowRight');
  // An old classroom activity must not capture the park's Up key.
  await calendar.evaluate(() => { _lastClassroomSummary = { activity: { state: { values: { calendar_test: 0 } } } }; });
  await calendar.keyboard.press('ArrowUp');
  await calendar.waitForFunction(() => _classroomBoardHandle.getParkScene().replica.state.progress.samples.includes('sample-0'));
  await calendar.getByRole('button', { name: 'Help / enter', exact: true }).scrollIntoViewIfNeeded();
  await calendar.screenshot({ path: path.join(output, 'actual-calendar.png') });
  assert.ok(!calendarErrors.some(error => /park|drawAvatar|world|replica/i.test(error)), JSON.stringify(calendarErrors));
  await calendar.getByRole('button', { name: 'Exit to calendar' }).click();
  assert.equal(await calendar.getByRole('button', { name: 'Enter APStat Park' }).isVisible(), true);
  assert.ok(!packets.some(packet => ['park_start', 'park_run', 'park_next', 'park_stop'].includes(packet.type)));
  assert.deepEqual(errors, []);
  const result = { passed: true, levelsCompletedWithKeyboard: 3, doorway: 'walk and click',
    samePage: true, lateJoin: true, reconnect: true, hourlyRotation: true, reloadCheckpoint: true, mobile: true,
    actualCalendarAt650px: true, returnDoorUpAndClick: true, unchangedStripSize: true, retiredControlPackets: 0, errors, calendarErrors };
  writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
