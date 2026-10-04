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

async function clickKey(page, key) {
  await page.waitForFunction(() => {
    const width = document.querySelector('canvas').getBoundingClientRect().width;
    const target = Math.max(0, Math.min(720, 1440 - width / Math.min(1, width / 720)));
    return Math.abs(board.getParkScene().getView().cameraX - target) < 0.5;
  });
  const point = await page.evaluate(async key => {
    const { tilesFor } = await import('/apstat-park/calculator-mission.mjs');
    const scene = board.getParkScene();
    const tile = tilesFor(scene.getState().step).find(tile => tile.key === key);
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const scale = Math.min(1, rect.width / 720);
    return { x: rect.left + (720 + tile.x + tile.w / 2 - Math.round(scene.getView().cameraX)) * scale,
      y: rect.top + (tile.y + tile.h / 2) * scale };
  }, key);
  await page.mouse.click(point.x, point.y);
}

try {
  const alice = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  const bob = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  for (const [page, name] of [[alice, 'alice'], [bob, 'bob']]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.bootHeights = [];
      function sampleBoot() {
        const canvas = document.querySelector('canvas');
        if (canvas) window.bootHeights.push(canvas.getBoundingClientRect().height);
        if (window.board?.getParkScene?.()?.kind !== 'calculator') requestAnimationFrame(sampleBoot);
      }
      requestAnimationFrame(sampleBoot);
    });
    await page.route('**/apstat-park/calculator-room.mjs*', async route => {
      await new Promise(resolve => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.goto(origin + '/?user=' + name);
    await page.waitForFunction(() => board.getSpritePosition(new URL(location).searchParams.get('user')));
    await page.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
    assert.ok(await page.evaluate(() => bootHeights.length > 0 && bootHeights.every(height => height === board.getBoardHeight())),
      'every startup frame reserves the full calculator height, including delayed module loading');
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
  }
  await alice.waitForFunction(() => board.getParkScene().getState().members.length === 2);
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().resetDoor), null);
  await clickKey(alice, 'STAT');
  await alice.waitForFunction(() => board.getParkScene().getState().step === 1);
  assert.equal(await bob.evaluate(() => board.getParkScene().getState().step), 0, 'Alice advances without changing Bob');
  const bobDeadline = await bob.evaluate(() => board.getParkScene().getState().startedAt);
  await clickKey(bob, 'MATH');
  await bob.waitForFunction(() => board.getParkScene().getState().lastPress?.key === 'MATH');
  assert.deepEqual(await bob.evaluate(() => board.getParkScene().getState().keys), ['MATH']);
  assert.equal(await bob.evaluate(() => board.getParkScene().getState().startedAt), bobDeadline, 'wrong press does not reset the timer');
  assert.deepEqual(await alice.evaluate(() => board.getParkScene().getState().keys), ['STAT']);
  // Alice takes a list-editor detour and then uses numeric selection/ENTER.
  for (const [key, screen] of [['ENTER','stat-edit-lists'], ['STAT','stat-menu']]) {
    await clickKey(alice, key);
    await alice.waitForFunction(screen => board.getParkScene().getCalculatorScreen().id === screen, screen);
  }
  await alice.screenshot({ path: path.join(output, 'calculator-independent.png'), fullPage: true });
  // Submit the whole calculator route without waiting for replies between clicks.
  for (const key of ['RIGHT', '1', 'ENTER', 'DOWN', 'ENTER', 'DOWN']) await clickKey(alice, key);
  await alice.waitForFunction(() => board.getParkScene().getState().step === 7);
  await alice.waitForFunction(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().solved), false,
    'the character falls through the number ledges before answering any boxplot questions');
  await alice.screenshot({ path: path.join(output, 'calculator-boxplot-transition.png'), fullPage: true });
  assert.deepEqual(await alice.evaluate(() => board.getParkScene().getState().keys),
    ['STAT', 'ENTER', 'STAT', 'RIGHT', '1', 'ENTER', 'DOWN', 'ENTER', 'DOWN']);
  const boxplotStartedAt = await alice.evaluate(() => board.getParkScene().getState().startedAt);
  for (const [i, key] of ['20', '14', '11', '7'].entries()) {
    await clickKey(alice, key);
    await alice.waitForFunction(i => board.getParkScene().getState().step === 8 + i, i);
    assert.equal(await alice.evaluate(() => board.getParkScene().getState().boxAttempts), 0);
    assert.equal(await alice.evaluate(() => board.getParkScene().getState().startedAt), boxplotStartedAt);
  }
  await alice.screenshot({ path: path.join(output, 'calculator-unjudged-boxplot.png'), fullPage: true });
  await clickKey(alice, '4');
  await alice.waitForFunction(() => board.getParkScene().getState().boxAttempts === 1);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().step), 7);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().startedAt), boxplotStartedAt);
  assert.deepEqual(await alice.evaluate(() => board.getParkScene().getState().boxValues), []);
  await alice.screenshot({ path: path.join(output, 'calculator-boxplot-retry.png'), fullPage: true });
  for (const [i, key] of ['4','7','11','14','20'].entries()) {
    await clickKey(alice, key);
    await alice.waitForFunction(i => board.getParkScene().getState().step === 8 + i, i);
    assert.ok(await alice.evaluate(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1),
      'clicking a boxplot value leaves the character on the ground');
  }
  await alice.waitForFunction(() => board.getParkScene().getState().solved);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().complete), false);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().readyCount), 1);
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().resetDoor), null);
  await alice.waitForFunction(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1);
  await alice.screenshot({ path: path.join(output, 'calculator-waiting-for-team.png'), fullPage: true });
  // Bob's expired calculator now kills his character and resets everyone, including Alice.
  const failedEpoch = await bob.evaluate(() => board.getParkScene().getState().epoch);
  timeOffset += 31000;
  for (const [ws, who] of sockets) {
    const pose = packets.findLast(packet => packet.name === who.username && packet.type === 'calculator_pose');
    if (pose) service.handle(ws, pose);
  }
  await bob.waitForFunction(() => board.getParkScene().getState().failure?.name === 'bob');
  await bob.screenshot({ path: path.join(output, 'calculator-timeout-death.png'), fullPage: true });
  for (const page of [alice, bob]) {
    await page.waitForFunction(epoch => board.getParkScene().getState().epoch !== epoch, failedEpoch);
    assert.equal(await page.evaluate(() => board.getParkScene().getState().step), 0);
    assert.deepEqual(await page.evaluate(() => board.getParkScene().getState().keys), []);
    assert.equal(await page.evaluate(() => board.getParkScene().getState().solved), false);
    assert.equal(await page.evaluate(() => board.getParkScene().getView().playerX), 785);
  }
  // Finish Alice again to check the independent route and waiting-for-team behavior after reset.
  for (const [step, key] of ['STAT','RIGHT','1','ENTER','DOWN','ENTER','DOWN','4','7','11','14','20'].entries()) {
    await clickKey(alice, key);
    await alice.waitForFunction(step => board.getParkScene().getState().step === step + 1, step);
  }
  for (const [step, key] of ['STAT','RIGHT','ENTER','DOWN','DOWN','ENTER','DOWN','4','7','11','14','20'].entries()) {
    await clickKey(bob, key);
    await bob.waitForFunction(step => board.getParkScene().getState().step === step + 1, step);
    if (step === 3) {
      await bob.reload();
      await bob.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
      await bob.evaluate(() => board.openCalculatorMission());
      await bob.waitForFunction(() => board.getParkScene()?.getState()?.step === 4);
      assert.equal(await bob.evaluate(() => board.getParkScene().getCalculatorScreen().id), 'one-var-stats-wizard');
      assert.equal(await alice.evaluate(() => board.getParkScene().getState().solved), true);
    }
  }
  await alice.waitForFunction(() => board.getParkScene().getState().complete);
  assert.equal(await alice.evaluate(() => board.getParkScene().getCalculatorScreen().id), 'one-var-stats-result-page2');
  assert.equal(await bob.evaluate(() => board.getParkScene().getState().complete), true);
  for (const page of [alice, bob]) {
    await page.waitForFunction(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1);
    assert.equal(await page.getByRole('button', { name: 'Back to start', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Enter reset door', exact: true }).count(), 0);
  }
  const completedEpoch = await alice.evaluate(() => board.getParkScene().getState().epoch);
  const doorPoint = await alice.evaluate(() => {
    const scene = board.getParkScene(), view = scene.getView(), door = view.resetDoor;
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const scale = Math.min(1, rect.width / 720);
    return { x: rect.left + (720 + door.x + door.w / 2 - Math.round(view.cameraX)) * scale,
      y: rect.top + (door.y + door.h / 2) * scale };
  });
  await alice.mouse.click(doorPoint.x, doorPoint.y);
  await alice.waitForTimeout(300);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().epoch), completedEpoch,
    'clicking the reset door must not restart');
  await alice.screenshot({ path: path.join(output, 'calculator-complete.png'), fullPage: true });
  await alice.keyboard.press('Escape');
  await alice.waitForFunction(() => !board.getParkScene().getView().participating);
  await alice.waitForFunction(() => board.getParkScene().getView().cameraX < 0.1);
  const roomHeight = await alice.evaluate(() => board.getBoardHeight());
  // Delay the first module load: the outgoing room must remain visible throughout.
  await alice.route('**/apstat-park/panel.mjs*', async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await alice.evaluate(() => {
    window.transitionHeights = [];
    window.watchTransition = true;
    function sample() {
      if (!window.watchTransition) return;
      window.transitionHeights.push(board.getBoardHeight());
      requestAnimationFrame(sample);
    }
    sample();
  });
  await alice.evaluate(() => board.openNativeGameplay(0));
  await alice.waitForSelector('[data-park-active]');
  await alice.waitForFunction(() => board.getParkScene()?.getGame?.().getWorld().shown);
  await alice.waitForTimeout(400);
  assert.equal(await alice.evaluate(() => board.getBoardHeight()), roomHeight);
  assert.ok(await alice.evaluate(height => transitionHeights.every(value => value === height), roomHeight),
    'loading and entering Pico never flashes the old short board');
  await alice.screenshot({ path: path.join(output, 'calculator-pico-aligned.png'), fullPage: true });
  await alice.keyboard.press('ArrowUp');
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await alice.waitForTimeout(400);
  assert.ok(await alice.evaluate(height => transitionHeights.every(value => value === height), roomHeight),
    'returning to the calculator keeps the same canvas height');
  await alice.evaluate(() => { window.watchTransition = false; });
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
  await alice.keyboard.press('Escape');
  await alice.waitForFunction(() => board.getParkScene().getView().cameraX < 0.1);
  const mobileHeight = await alice.evaluate(() => board.getBoardHeight());
  await alice.evaluate(() => board.openNativeGameplay(0));
  await alice.waitForFunction(() => board.getParkScene()?.getGame?.().getWorld().shown);
  await alice.waitForTimeout(400);
  assert.equal(await alice.evaluate(() => board.getBoardHeight()), mobileHeight,
    'mobile Pico keeps the calculator scale and floor position');
  await alice.screenshot({ path: path.join(output, 'calculator-pico-mobile.png'), fullPage: true });
  await alice.keyboard.press('ArrowUp');
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
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
