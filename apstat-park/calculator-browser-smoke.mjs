// Local-only integration smoke. Needs Playwright and the sibling relay checkout.
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
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/apstat-park');
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
  const alice = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const bob = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  for (const [page, name] of [[alice, 'alice'], [bob, 'bob']]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?user=' + name);
    await page.waitForFunction(() => board.getSpritePosition(new URL(location).searchParams.get('user')));
    await page.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
    await page.evaluate(() => { window.originalRoom = board.getParkScene(); window.originalHeight = board.getBoardHeight(); });
    if (name === 'alice') await page.screenshot({ path: path.join(output, 'calculator-entrance.png'), fullPage: true });
    // Enter from the main room using movement, not a new door.
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => board.getParkScene().getView().cameraX > 120);
    assert.equal(await page.evaluate(() => board.getParkScene() === window.originalRoom), true);
    assert.equal(await page.evaluate(() => board.getBoardHeight() === window.originalHeight), true);
    if (name === 'alice') await page.screenshot({ path: path.join(output, 'calculator-scrolling.png'), fullPage: true });
    await page.waitForSelector('[data-calculator-participating]', { timeout: 15000 });
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => board.getParkScene()?.getState());
    await page.getByText('Choose a tile without jumping (keyboard or touch)', { exact: true }).click();
  }
  await alice.waitForFunction(() => board.getParkScene().getState().members.length === 2);
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().resetDoor), null);
  await alice.locator('[data-calculator-key="STAT"]').click();
  await bob.locator('[data-calculator-key="ENTER"]').click();
  await alice.waitForTimeout(1300);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().step), 0, 'one student cannot advance alone');
  timeOffset += 31000;
  // Move the mission clock without simulating a disconnected browser.
  for (const [ws, who] of sockets) {
    const pose = packets.findLast(packet => packet.name === who.username && packet.type === 'calculator_pose');
    if (pose) service.handle(ws, pose);
  }
  await alice.waitForFunction(() => document.querySelector('[data-calculator-controls]').textContent.includes('Hint: choose STAT'));
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().timeoutCount), 1);
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().playerX), 785);
  for (const [step, key] of ['STAT','RIGHT','ENTER','DOWN','DOWN','ENTER','DOWN','4','7','11','14','20'].entries()) {
    for (const page of [alice, bob]) {
      const actualKey = page === alice && step === 2 ? '1' : page === alice && step === 3 ? 'ENTER' : key;
      await page.locator('[data-calculator-key="' + actualKey + '"]').click();
    }
    for (const page of [alice, bob]) await page.waitForFunction(step => board.getParkScene().getState().step === step + 1, step);
    if (step === 0) await alice.screenshot({ path: path.join(output, 'calculator-team.png'), fullPage: true });
    if (step === 3) {
      await alice.waitForTimeout(1100);
      assert.equal(await alice.evaluate(() => board.getParkScene().getState().step), 4, 'held DOWN does not repeat into another step');
      assert.deepEqual(await alice.evaluate(() => board.getParkScene().getState().keys), ['STAT', 'RIGHT', '1', 'ENTER']);
      timeOffset += 31000;
      for (const [ws, who] of sockets) {
        const pose = packets.findLast(packet => packet.name === who.username && packet.type === 'calculator_pose');
        if (pose) service.handle(ws, pose);
      }
      for (const page of [alice, bob]) {
        await page.waitForFunction(() => board.getParkScene().getState().timeoutCount === 2);
        assert.equal(await page.evaluate(() => board.getParkScene().getState().step), 4);
        assert.equal(await page.evaluate(() => board.getParkScene().getView().playerX), 785);
        assert.ok(await page.evaluate(() => board.getParkScene().getView().lines.some(line => line.selected && line.text.includes('FreqList'))));
      }
      await bob.reload();
      await bob.waitForFunction(() => board.getSpritePosition('bob'));
      await bob.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
      await bob.evaluate(() => board.openCalculatorMission());
      await bob.waitForFunction(() => board.getParkScene()?.getState()?.step === 4);
      assert.equal(await bob.evaluate(() => board.getParkScene().getCalculatorScreen().id), 'one-var-stats-wizard');
      await bob.getByText('Choose a tile without jumping (keyboard or touch)', { exact: true }).click();
    }
  }
  assert.equal(await alice.evaluate(() => board.getParkScene().getCalculatorScreen().id), 'one-var-stats-result-page2');
  assert.equal(await bob.evaluate(() => board.getParkScene().getState().complete), true);
  await alice.screenshot({ path: path.join(output, 'calculator-complete.png'), fullPage: true });
  await alice.getByText('Back to start', { exact: true }).click();
  await alice.waitForFunction(() => !board.getParkScene().getView().participating);
  await alice.evaluate(() => board.openNativeGameplay(0));
  await alice.waitForSelector('[data-park-active]');
  await alice.keyboard.press('Escape');
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await alice.evaluate(() => board.openCalculatorMission());
  await alice.waitForFunction(() => board.getParkScene()?.getState()?.complete);
  assert.equal(await alice.evaluate(() => board.getParkScene().getCalculatorScreen().id), 'one-var-stats-result-page2');
  // The completed goal reveals a world door. Walk there and use the real Up input.
  assert.ok(await alice.evaluate(() => board.getParkScene().getView().resetDoor));
  await alice.keyboard.down('ArrowRight');
  await alice.waitForFunction(() => board.getParkScene().getView().playerX >= 1378);
  await alice.keyboard.up('ArrowRight');
  await alice.keyboard.press('ArrowUp');
  for (const page of [alice, bob]) {
    await page.waitForFunction(() => board.getParkScene().getState().step === 0 && !board.getParkScene().getView().participating);
    assert.equal(await page.evaluate(() => board.getParkScene().getView().resetDoor), null);
    assert.equal(await page.evaluate(() => board.getParkScene().getView().playerX), 65);
    assert.equal(await page.evaluate(() => board.getParkScene().getState().bonus), 0);
  }
  await alice.evaluate(() => board.openCalculatorMission());
  await alice.waitForFunction(() => board.getParkScene().getState().members.some(member => member.name === 'alice'));
  await alice.keyboard.down('ArrowRight');
  await alice.waitForTimeout(300); await alice.keyboard.up('ArrowRight');
  await alice.keyboard.down('Space');
  await alice.waitForFunction(() => board.getParkScene().getState().members.find(member => member.name === 'alice').pose.y < 670);
  const moving = await alice.evaluate(() => board.getParkScene().getState().members.find(member => member.name === 'alice').pose);
  assert.ok(moving.x > 65 && moving.y < 676, 'the same avatar can walk and jump across the key platforms: ' + JSON.stringify(moving));
  await alice.keyboard.up('Space');
  await alice.setViewportSize({ width: 390, height: 1000 });
  await alice.screenshot({ path: path.join(output, 'calculator-mobile.png'), fullPage: true });
  for (const [ws, who] of sockets) {
    if (who.username === 'alice') send(ws, { ...registry.stateFor('B', 'student', 'alice'),
      poll: { id: 'recall', question: 'Return to class', options: ['Ready'], votes: {} } });
  }
  await alice.waitForFunction(() => !board.getParkScene());
  assert.equal(await alice.evaluate(() => board.getBoardHeight()), 220, 'teacher recall restores the normal room');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'calculator-result.json'), JSON.stringify({ passed: true, errors, steps: 12 }, null, 2));
  console.log('CALCULATOR COOPERATIVE BROWSER PASS');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
