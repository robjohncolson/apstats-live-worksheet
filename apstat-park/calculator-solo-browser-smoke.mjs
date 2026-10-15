// Local-only integration smoke for the solo room (APSTAT_PARK_TRAINER_ABSORB_SPEC §3, protocol 12).
// Needs Playwright and the sibling relay checkout, like calculator-browser-smoke.mjs.
// PARK_PLAYWRIGHT_MODULE may point to an installed playwright-core index.mjs.
// PARK_BROWSER may point to an installed Chromium/Edge executable.
//
// Acceptance (spec §3): a signed-in student opens #room=calc-solo&skill=one-var-stats, completes the
// route against random data, sees the clear celebration, and park_calc_clears increments. No ledger row.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { levelById } from './calculator-curriculum.mjs';
import { WebSocketServer } from '../../curriculum_render/railway-server/node_modules/ws/wrapper.mjs';

const relayRoot = process.env.PARK_RELAY_ROOT
  ? path.resolve(process.env.PARK_RELAY_ROOT) : fileURLToPath(new URL('../../curriculum_render/', import.meta.url));
const { createClassroomRegistry } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/classroom.js')));
const { createParkService } = await import(pathToFileURL(path.join(relayRoot, 'railway-server/apstat-park/service.mjs')));

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/apstat-park');
mkdirSync(output, { recursive: true });
const registry = createClassroomRegistry(), sockets = new Map(), errors = [], packets = [];
const send = (ws, message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
// The relay's clears persist through this in-memory store (the Supabase store's interface): rows are
// absolute counts per student and skill, so a double count would show up as a 2 where a 1 belongs.
const clearRows = new Map(), clearWrites = [];
const clearsStore = {
  async load() { return []; },
  save(section, rows) {
    clearWrites.push(rows.map(row => ({ ...row })));
    for (const row of rows) clearRows.set(row.username + ':' + row.skillId, row.clears);
    return Promise.resolve();
  },
};
const walletWrites = [];
const keyStore = {
  async load() { return { wallets: [], open: [] }; },
  saveWallets(section, rows) { walletWrites.push(rows.map(row => ({ ...row }))); return Promise.resolve(); },
  saveSpend() { return Promise.resolve(); },
};
// The rotation never offers one-var-stats here: the deep link alone must reach it.
const service = createParkService({ registry, keyStore, clearsStore, wallNow: () => 0,
  calculatorOptions: { available: () => [levelById('histogram')] }, now: () => performance.now(), send });
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
async function waitFor(check, message, timeout = 5000) {
  const until = performance.now() + timeout;
  while (!check()) {
    if (performance.now() > until) throw new Error('Timed out: ' + message);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
// The round's own route and answers (random data: read them from the state the relay sent).
const roundPlan = page => page.evaluate(async () => {
  const { missionFor } = await import('/apstat-park/calculator-mission.mjs');
  const { challengeFor } = await import('/apstat-park/calculator-curriculum.mjs');
  const level = missionFor(board.getParkScene().getState());
  return { id: level.id, route: level.route, answers: challengeFor(level).answers.map(String), varied: !!level.varied };
});
async function solveRound(page) {
  const plan = await roundPlan(page);
  for (const [step, key] of plan.route.entries()) {
    await clickKey(page, key);
    await page.waitForFunction(step => board.getParkScene().getState().step === step + 1, step);
  }
  await page.waitForFunction(() => Math.abs(board.getParkScene().getView().playerY - 676) < 0.1);
  for (const key of plan.answers) {
    const revision = await page.evaluate(() => board.getParkScene().getState().revision);
    await clickKey(page, key);
    await page.waitForFunction(revision => board.getParkScene().getState().revision > revision, revision);
  }
  await page.waitForFunction(() => board.getParkScene().getState().complete);
  return plan;
}

try {
  const alice = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  alice.on('pageerror', error => errors.push(error.message));
  await alice.goto(origin + '/?user=alice#room=calc-solo&skill=one-var-stats');
  await alice.waitForFunction(() => board.getSpritePosition(new URL(location).searchParams.get('user')));
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  // The link alone puts the student on the keypad in their own round: no block, no team.
  await alice.waitForSelector('[data-calculator-participating]', { timeout: 30000 });
  await alice.waitForFunction(() => board.getParkScene()?.getState()?.mode === 'solo');
  const view = await alice.evaluate(() => board.getParkScene().getView());
  assert.equal(view.mode, 'solo');
  assert.equal(view.skill, 'one-var-stats');
  assert.equal(view.navigator, null);
  const first = await alice.evaluate(() => board.getParkScene().getState());
  assert.equal(first.teamSize, 1);
  assert.equal(first.pinnedSkill, 'one-var-stats');
  assert.deepEqual(first.members.map(member => member.name), ['alice']);
  assert.equal(packets.some(packet => packet.name === 'alice' && packet.type === 'calculator_lobby'), false, 'solo never pushes the block');
  const join = packets.find(packet => packet.name === 'alice' && packet.type === 'calculator_join');
  assert.deepEqual({ mode: join.mode, skill: join.skill }, { mode: 'solo', skill: 'one-var-stats' });
  await alice.screenshot({ path: path.join(output, 'solo-start.png'), fullPage: true });
  const plan = await solveRound(alice);
  assert.ok(plan.id.startsWith('one-var-stats'), 'the pinned skill, not the rotation\'s histogram: ' + plan.id);
  assert.equal(plan.varied, true, 'random data');
  // The same clear celebration; one clear recorded and persisted; no key (Phase 4), no ledger row.
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().keyReward), true);
  assert.match(await alice.evaluate(() => document.querySelector('[data-calculator-controls] [role="status"]').textContent), /^Cleared! /);
  const done = await alice.evaluate(() => board.getParkScene().getState());
  assert.equal(done.clears, 1);
  assert.equal(done.rung, 1);
  await waitFor(() => clearRows.get('alice:one-var-stats') === 1, 'the clear is written to park_calc_clears');
  assert.deepEqual(walletWrites, [], 'no key for a solo clear until Phase 4');
  await alice.screenshot({ path: path.join(output, 'solo-complete.png'), fullPage: true });
  // Reload: the completed round comes back; nothing is counted twice.
  await alice.reload();
  await alice.waitForFunction(() => board.getParkScene()?.kind === 'calculator');
  await alice.waitForFunction(() => board.getParkScene()?.getState()?.complete);
  await alice.waitForTimeout(400);
  assert.equal(clearRows.get('alice:one-var-stats'), 1, 'no double count after a reload');
  assert.ok(clearWrites.every(rows => rows.every(row => row.clears <= 1)), 'no later write raises the count');
  // The door: the next round is the same skill with new data, and the student stays on the keypad.
  const completedEpoch = done.epoch;
  await alice.keyboard.down('ArrowRight');
  await alice.waitForFunction(() => board.getParkScene().getView().playerX >= 1378);
  await alice.keyboard.up('ArrowRight');
  await alice.keyboard.press('ArrowUp');
  await alice.waitForFunction(epoch => board.getParkScene().getState()?.epoch && board.getParkScene().getState().epoch !== epoch, completedEpoch);
  const next = await alice.evaluate(() => board.getParkScene().getState());
  assert.equal(next.step, 0);
  assert.equal(next.pinnedSkill, 'one-var-stats');
  assert.equal(await alice.evaluate(() => board.getParkScene().getView().participating), true, 'no walk back to a block');
  await alice.screenshot({ path: path.join(output, 'solo-next-round.png'), fullPage: true });
  // Escape leaves the round; walking back in resumes it.
  await alice.keyboard.press('Escape');
  await alice.waitForFunction(() => !board.getParkScene().getView().participating);
  await alice.evaluate(() => board.openCalculatorMission());
  await alice.waitForFunction(() => board.getParkScene().getView().participating && board.getParkScene().getState()?.epoch);
  assert.equal(await alice.evaluate(() => board.getParkScene().getState().epoch), next.epoch, 'the round resumes');
  // A topic link resolves through the lesson map (1.10 -> normalcdf).
  await alice.goto(origin + '/?user=alice#room=calc-solo&topic=1.10');
  await alice.waitForFunction(() => board.getParkScene()?.getState()?.pinnedSkill === 'normalcdf');
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'solo-result.json'), JSON.stringify({ passed: true, errors, steps: 6 }, null, 2));
  console.log('CALCULATOR SOLO BROWSER PASS');
} finally {
  await browser.close(); service.close();
  for (const ws of wss.clients) ws.terminate();
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
