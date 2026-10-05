import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href);
const root = new URL('../', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<div id="park" style="width:720px;color:#463c40"></div>'); return; }
    res.setHeader('Content-Type', pathname.endsWith('.png') ? 'image/png' : 'text/javascript');
    res.end(await readFile(new URL('.' + pathname, root)));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_BROWSER });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { DEFAULT_LEVEL } = await import('/apstat-park/calculator-curriculum.mjs');
    const { createMission } = await import('/apstat-park/calculator-mission.mjs');
    window.sent = []; window.sockets = []; window.mode = 'campaign'; window.clock = 100;
    window.WebSocket = class {
      readyState = 1; bufferedAmount = 0; section = ''; closed = false;
      constructor() { sockets.push(this); setTimeout(() => this.onopen?.(), 0); }
      close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
      send(text) {
        const request = JSON.parse(text); sent.push(request);
        if (request.type === 'classroom_join') this.section = request.section;
        if (request.type !== 'park_watch') return;
        const name = this.section === 'PeriodE' ? 'eva' : 'alice';
        const state = { type: 'campaign_state', team: this.section, epoch: this.section, seed: 1,
          roster: [name], stageIndex: 0, phase: 'playing', from: request.epoch === this.section ? request.from : 0,
          to: 100, events: [{ frame: 0, inputs: [2, 0] }], more: false };
        const mission = createMission(0, DEFAULT_LEVEL); mission.keys = ['STAT']; mission.step = 1;
        if (mode === 'plot') { mission.step = DEFAULT_LEVEL.route.length; mission.boxValues = [4, 7, 11]; }
        const packet = { type: 'park_watch_state', section: this.section, students: [{ username: name, hue: 90 }],
          campaign: { teams: mode === 'campaign' ? [{ id: this.section, roster: [name], stageIndex: 0 }] : [],
            state: mode === 'campaign' ? state : null },
          calculator: mode === 'calculator' || mode === 'plot' ? { epoch: 'calculator', clock,
            level: DEFAULT_LEVEL, lobby: { phase: 'active' }, members: [{ name, pose: { x: 160, y: 676 }, state: mission }] } : null };
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(packet) }), 0);
      }
    };
    const { mountTeacherSpectator } = await import('/apstat-park/teacher-spectator.mjs');
    window.viewer = mountTeacherSpectator(document.querySelector('#park'), { wsUrl: 'ws://test', username: 'teacher', section: 'B' });
  });
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('1 student'));
  await page.waitForFunction(() => [...document.querySelectorAll('select')][2].value === 'alice');
  await page.locator('select').nth(0).selectOption('PeriodE');
  await page.waitForFunction(() => [...document.querySelectorAll('select')][2].value === 'eva');
  assert.equal(await page.evaluate(() => sockets[0].closed), true);
  await page.evaluate(() => { mode = 'calculator'; });
  await page.locator('select').nth(1).selectOption('calculator');
  await page.waitForTimeout(400);
  await page.evaluate(() => { mode = 'plot'; });
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); await page.locator('canvas').click();
  const messages = await page.evaluate(() => sent);
  assert.ok(messages.some(message => message.type === 'classroom_join' && message.section === 'PeriodE' && message.role === 'teacher'));
  assert.ok(messages.every(message => ['classroom_join', 'classroom_heartbeat', 'park_watch'].includes(message.type)));
  await page.evaluate(() => sockets.at(-1).close());
  await page.waitForFunction(() => sockets.length === 3);
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Watching only'));
  await page.evaluate(() => viewer.destroy());
  assert.equal(await page.locator('[data-teacher-spectator]').count(), 0);
  assert.equal(await page.evaluate(() => sockets.every(socket => socket.closed)), true);
  assert.deepEqual(errors, []);
  console.log('Teacher spectator: real campaign rendering, calculator/plot, class switching, reconnect, read-only controls passed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
