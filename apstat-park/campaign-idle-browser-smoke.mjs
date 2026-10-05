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
      stats: { cleared: false }, load() {}, setPresentation() {}, step() {}, render() {}, dispose() {},
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
  await page.evaluate(() => {
    receive({ type: 'campaign_state', epoch: 'one', roster: ['active', 'idle'], stageIndex: 0, seed: 1, phase: 'playing', from: 0, to: 0, events: [] });
    receive({ type: 'campaign_idle' });
  });
  const before = await page.evaluate(() => sent.length);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => sent.length), before, 'idle tab must stop heartbeats and automatic joins');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => sent.filter(packet => packet.type === 'campaign_join').at(-1).active), true);
  await page.evaluate(() => panel.dispose());
  assert.deepEqual(errors, []);
  console.log('Campaign idle browser smoke passed');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
