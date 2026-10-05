// Local-only campaign coverage and synchronized progression smoke. Needs Playwright and the sibling relay checkout.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';
import { DEFAULT_LEVEL } from './calculator-curriculum.mjs';
import { earnCampaignEntry } from './campaign-entry-browser-fixture.mjs';

const relayRoot = process.env.PARK_RELAY_ROOT
  ? path.resolve(process.env.PARK_RELAY_ROOT) : fileURLToPath(new URL('../../curriculum_render/', import.meta.url));
const { createClassroomRegistry } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/classroom.js')));
const { createParkService } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/apstat-park/service.mjs')));

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign');
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
  calculatorOptions: { available: () => [DEFAULT_LEVEL] },
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
  await page.goto(origin + '/?user=engine-audit&section=audit');
  await page.evaluate(async () => {
    const module = await import('/apstat-park/campaign-engine.mjs');
    window.auditEngine = await module.createCampaignEngine();
    window.auditTwin = await module.createCampaignEngine();
    window.campaignStages = module.campaignStages;
  });
  const reports = [];
  for (let index = 0; index < 48; index++) {
    const report = await page.evaluate(async index => {
      const { RUNTIME_SPAWN_HANDLER_ACTOR_NAMES } = await import('/apstat-park/recovered/runtime.mjs');
      const entry = campaignStages[index];
      const unknown = [entry.data, entry.largeParty?.data].filter(Boolean)
        .flatMap(stage => stage.createTable.map(actor => actor.actorName))
        .filter(name => !RUNTIME_SPAWN_HANDLER_ACTOR_NAMES.includes(name));
      const results = [];
      for (const count of [2, 8]) {
        auditEngine.load(index, count, 12345); auditTwin.load(index, count, 12345);
        for (let frame = 0; frame < 180; frame++) {
          const inputs = Array.from({ length: count }, (_, slot) => frame < 60 ? (slot % 2 ? 1 : 2) : frame === 60 ? 48 : frame < 90 ? 16 : 0);
          auditEngine.step(inputs); auditTwin.step(inputs);
          // Presentation must not change simulation or its random stream.
          if (frame % 6 === 0) auditEngine.render();
        }
        auditEngine.render();
        const a = auditEngine.getView(), b = auditTwin.getView();
        if (!a.players.length || a.players.some(rect => Object.values(rect).some(value => !Number.isFinite(value)))) throw new Error('Invalid players: ' + index);
        if (JSON.stringify(a.players) !== JSON.stringify(b.players) || a.seed !== b.seed) throw new Error('Non-deterministic stage: ' + index);
        results.push({ count, actors: a.players.length, cleared: a.stats.cleared });
      }
      return { index, name: entry.source, unknown: [...new Set(unknown)], results };
    }, index);
    assert.deepEqual(report.unknown, [], 'Missing actor handlers in ' + report.name);
    reports.push(report); console.log('STAGE', index + 1, report.name, 'PASS');
  }
  await page.evaluate(() => { auditEngine.dispose(); auditTwin.dispose(); });
  await page.close();
  writeFileSync(path.join(output, 'stage-audit.json'), JSON.stringify(reports, null, 2));
  const pages = await Promise.all(['alice', 'bob'].map(async name => {
    const next = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    next.on('pageerror', error => errors.push(error.message));
    await next.goto(origin + '/?user=' + name);
    await next.waitForFunction(() => window.board?.getParkScene?.()?.kind === 'calculator');
    return next;
  }));
  await earnCampaignEntry(pages);
  await Promise.all(pages.map(next => next.evaluate(() => board.openNativeGameplay(0))));
  await Promise.all(pages.map(next => next.waitForFunction(() => board.getParkScene()?.kind === 'campaign'
    && board.getParkScene().getView().roster?.length === 2 && board.getParkScene().getView().frame > 30)));
  const [alice, bob] = pages;
  await alice.screenshot({ path: path.join(output, 'campaign-1-1.png'), fullPage: true });
  await alice.keyboard.down('ArrowRight'); await alice.waitForTimeout(650); await alice.keyboard.up('ArrowRight');
  await alice.waitForTimeout(700);
  const positions = await Promise.all(pages.map(next => next.evaluate(() => board.getParkScene().getView().players)));
  assert.deepEqual(positions[0], positions[1], 'The two clients converge after input release');
  // Completion fixture exercises the recovered goal checker, relay quorum and
  // presentation; it intentionally does not solve the platform route.
  for (const next of pages) await next.evaluate(() => {
    const runtime = board.getParkScene().getGame().runtime;
    for (const player of runtime.players) runtime.goalClearedPlayers.add(player);
    runtime.checkGoals();
  });
  await alice.waitForFunction(() => !!board.getParkScene().getView().clear);
  await alice.waitForTimeout(1900);
  assert.equal(await alice.evaluate(() => board.getParkScene().getGame().runtime.overlayLayer.visible), false,
    'the recovered preview instructions must not cover the desk CLEAR banner');
  await alice.screenshot({ path: path.join(output, 'campaign-clear.png'), fullPage: true });
  await Promise.all(pages.map(next => next.waitForFunction(() => board.getParkScene()?.getView().stageIndex === 1)));
  await alice.screenshot({ path: path.join(output, 'campaign-1-2.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('CAMPAIGN BROWSER PASS: 48 stages, 2/8 players, deterministic replay, team CLEAR and next stage');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
