import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href);
const root = new URL('../', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<div id="park"></div>'); return; }
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await readFile(new URL('.' + pathname, root)));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_BROWSER });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Exercise the actual panel with a small engine stub; physics is unchanged.
  await page.route('**/campaign-engine.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function createCampaignEngine() { return { canvas: document.createElement('canvas'),
      stats: { cleared: false }, load() {}, setPresentation() {}, step() { window.played = (window.played || 0) + 1; }, render() {}, dispose() {},
      getView() { return { screenPlayers: [], projection: { x: 0 } }; } }; }
  ` }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { mountCampaign } = await import('/apstat-park/campaign-panel.mjs');
    const listeners = new Set(); window.sent = [];
    const socket = { readyState: 1, bufferedAmount: 0, send: text => sent.push(JSON.parse(text)),
      addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
    window.receive = packet => { for (const listener of listeners) listener({ data: JSON.stringify(packet) }); };
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 750;
    window.board = { username: 'active', viewportW: () => 720, engine: { canvas }, input: {}, createPeer: () => ({ hue: 90 }) };
    window.panel = mountCampaign({ container: document.querySelector('#park'), getSocket: () => socket, board, onClose() {} });
  });
  await page.waitForFunction(() => panel.getGame());
  const cadence = await page.evaluate(() => {
    receive({ type: 'campaign_state', epoch: 'one', roster: ['active'], stageIndex: 0,
      seed: 1, phase: 'playing', from: 0, to: 0, events: [] });
    const update = board.engine.sceneEntities.get('campaign').update;
    for (let i = 0; i < 10; i++) update(1 / 60); // wait for first packet
    const advances = [];
    for (let frame = 0; frame < 30; frame++) {
      receive({ type: 'campaign_frames', epoch: 'one', from: frame, to: frame + 1, events: [] });
      const before = window.played || 0;
      update(1 / 144); advances.push((window.played || 0) - before);
      // Running out of frames must not introduce a three-frame refill wait.
      update(1 / 144);
    }
    // A short network hiccup must not leave playback permanently behind.
    receive({ type: 'campaign_frames', epoch: 'one', from: 30, to: 38, events: [] });
    const beforeCatchup = window.played;
    update(1 / 144); advances.push(window.played - beforeCatchup);
    return advances;
  });
  assert.deepEqual(cadence, [...Array(30).fill(1), 8], 'single frames play immediately; a backlog is drained without an extra client clock');
  await page.evaluate(() => panel.dispose());
  assert.deepEqual(errors, []);
  console.log('Campaign playback cadence browser smoke passed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
