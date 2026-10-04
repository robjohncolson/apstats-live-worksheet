// Local-only integration smoke. Needs Playwright and the sibling relay checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClassroomRegistry } from '../../curriculum_render/railway-server/classroom.js';
import { CALCULATOR_PROBLEMS, levelById, challengeFor } from './calculator-curriculum.mjs';
import { createCalculatorService } from '../../curriculum_render/railway-server/apstat-park/calculator-service.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
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
const realCurriculum = process.env.PARK_REAL_CURRICULUM === '1';
const filter = realCurriculum ? ['dotplot'] : process.env.PARK_SKILL_FILTER?.split(',');
const levels = CALCULATOR_PROBLEMS.filter(level => !filter || filter.includes(level.id));
let selectedLevel = levels[0];
const latest = new Map();
const service = createCalculatorService({ registry,
  ...(realCurriculum ? { wallNow: () => Date.parse('2026-10-04T16:00:00Z'), random: () => .99 } : { available: () => [selectedLevel] }),
  now: () => performance.now() + timeOffset, send(ws, packet) { latest.set(packet.type, packet); send(ws, packet); } });
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
    const { tilesFor, missionFor } = await import('/apstat-park/calculator-mission.mjs');
    const scene = board.getParkScene();
    const tile = tilesFor(scene.getState().step, missionFor(scene.getState())).find(tile => tile.key === key);
    const rect = document.querySelector('canvas').getBoundingClientRect();
    const scale = Math.min(1, rect.width / 720);
    return { x: rect.left + (720 + tile.x + tile.w / 2 - Math.round(scene.getView().cameraX)) * scale,
      y: rect.top + (tile.y + tile.h / 2) * scale };
  }, key);
  await page.mouse.click(point.x, point.y);
}

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/?user=alice&section=' + (process.env.PARK_SECTION || 'PeriodB'));
  await page.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await page.waitForFunction(() => board.getParkScene().getView().lobby);
  const ws = [...sockets.keys()][0];
  const results = [];
  for (const configured of levels) {
    const level = realCurriculum ? levelById(await page.evaluate(() => board.getParkScene().getView().missionId)) : configured;
    selectedLevel = level;
    assert.equal(await page.evaluate(() => board.getParkScene().getView().missionId), level.id, 'lobby shows the selected skill before arrival');
    assert.equal(await page.evaluate(() => board.getParkScene().getState()), null);
    if (realCurriculum) {
      await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight');
      await page.waitForFunction(() => board.getParkScene().getState(), null, { timeout: 30000 });
      await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift');
    } else {
    // Speed through block travel with valid authenticated lobby poses. The
    // separate cooperative smoke covers real keyboard pushing and the door.
    for (let i = 0; i < 115; i++) {
      const lobby = latest.get('calculator_lobby_state');
      service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        epoch: lobby.epoch, pose: { x: lobby.blockX - 20, y: 676 }, pushing: true });
      timeOffset += 100; service.tick();
    }
    await page.evaluate(() => board.openCalculatorMission());
    }
    await page.waitForFunction(id => board.getParkScene().getState()?.missionId === id, level.id);
    if (process.env.PARK_KEY_LAYERS === '1') {
      for (const key of ['ALPHA', 'CLEAR']) {
        const revision = await page.evaluate(() => board.getParkScene().getState().revision);
        await clickKey(page, key);
        await page.waitForFunction(revision => board.getParkScene().getState().revision > revision, revision);
        if (key === 'ALPHA') {
          assert.equal(await page.evaluate(() => board.getParkScene().getKeyboard().labels.MATH), 'A');
          await page.screenshot({ path: path.join(output, level.id + '-alpha.png'), fullPage: true });
        }
      }
    }
    for (const key of level.route) {
      const revision = await page.evaluate(() => board.getParkScene().getState().revision);
      await clickKey(page, key);
      await page.waitForFunction(revision => board.getParkScene().getState().revision > revision, revision);
      if (process.env.PARK_KEY_LAYERS === '1' && key === '2ND') {
        assert.equal(await page.evaluate(() => board.getParkScene().getKeyboard().labels['Y=']), 'STAT PLOT');
        await page.screenshot({ path: path.join(output, level.id + '-second.png'), fullPage: true });
      }
    }
    assert.equal(await page.evaluate(() => board.getParkScene().getState().step), level.route.length, level.id);
    await page.waitForFunction(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1);
    await page.screenshot({ path: path.join(output, level.id + '-result-reference.png'), fullPage: true });
    if (level.procedureId === 'one-var-stats') {
      const lines = await page.evaluate(() => board.getParkScene().getView().lines.map(line => line.text));
      assert(lines.some(line => line.includes('minX')), 'five-number summary stays available at the challenge');
      assert(lines.some(line => line.includes('maxX')));
    }
    const challenge = challengeFor(level);
    for (const value of challenge.answers) {
      const revision = await page.evaluate(() => board.getParkScene().getState().revision);
      await clickKey(page, String(value));
      await page.waitForFunction(revision => board.getParkScene().getState().revision > revision, revision);
    }
    await page.waitForFunction(() => board.getParkScene().getState().complete);
    await page.screenshot({ path: path.join(output, level.id + '.png'), fullPage: true });
    if (['histogram', 't-test-stats', 'matrix-entry'].includes(level.id)) {
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(output, level.id + '-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 900, height: 1000 });
    }
    results.push({ id: level.id, passed: true });
    console.log('BROWSER PASS: ' + level.id);
    const state = latest.get('calculator_state');
    selectedLevel = levels[(levels.indexOf(level) + 1) % levels.length];
    service.handle(ws, { type: 'calculator_restart', epoch: state.epoch, revision: state.revision });
    await page.waitForFunction(() => board.getParkScene().getState() === null);
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'curriculum-results.json'), JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
