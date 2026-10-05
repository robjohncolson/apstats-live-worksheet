// Browser regressions for immediate campaign input, backpressure and bitmap caches.
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
    res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('.' + pathname, root)));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PARK_BROWSER });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/campaign-engine.mjs*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function createCampaignEngine() { return { canvas: document.createElement('canvas'),
      stats: { cleared: false }, load() {}, setPresentation() {}, step() {},
      render() { window.paints = (window.paints || 0) + 1; }, dispose() {},
      getView() { return { screenPlayers: [], projection: { x: 0 } }; } }; }
  ` }));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const { mountCampaign } = await import('/apstat-park/campaign-panel.mjs');
    const listeners = new Set(); window.sent = [];
    window.socket = { readyState: 1, bufferedAmount: 0, send: text => sent.push(JSON.parse(text)),
      addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
    window.receive = packet => { for (const listener of listeners) listener({ data: JSON.stringify(packet) }); };
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 750;
    window.board = { username: 'active', viewportW: () => 720, engine: { canvas }, input: {}, createPeer: () => ({ hue: 90 }) };
    window.panel = mountCampaign({ container: document.querySelector('#park'), getSocket: () => socket, board, onClose() {} });
  });
  await page.waitForFunction(() => panel.getGame());
  const immediate = await page.evaluate(() => {
    receive({ type: 'campaign_state', epoch: 'one', roster: ['active'], helpers: [], stageIndex: 0,
      seed: 1, phase: 'playing', from: 0, to: 0, events: [] });
    const start = sent.length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    return sent.slice(start).filter(packet => packet.type === 'campaign_input').map(packet => packet.bits);
  });
  assert.deepEqual(immediate, [2, 0, 48, 0], 'all edges leave synchronously, even within one frame');
  await page.evaluate(() => {
    socket.bufferedAmount = 9000; window.blockedAt = sent.length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
  });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => sent.length - blockedAt), 0);
  await page.evaluate(() => { socket.bufferedAmount = 0; });
  await page.waitForFunction(() => sent.slice(blockedAt).some(packet => packet.type === 'campaign_input' && (packet.bits & 32)));
  const caching = await page.evaluate(() => {
    const scene = board.engine.sceneEntities.get('campaign'), ctx = board.engine.canvas.getContext('2d');
    for (let i = 0; i < 20; i++) scene.render(ctx);
    const initial = paints;
    receive({ type: 'campaign_frames', epoch: 'one', from: 0, to: 1, events: [] });
    scene.update(1 / 60); scene.render(ctx);
    const advanced = paints;
    receive({ type: 'campaign_helpers', epoch: 'one', helpers: ['teacher'] }); scene.render(ctx);
    return { initial, advanced, helpers: paints };
  });
  assert.deepEqual(caching, { initial: 1, advanced: 2, helpers: 3 });
  const pixels = await page.evaluate(async () => {
    const { pixelText } = await import('/apstat-park/pixel-text.mjs');
    const canvas = () => { const result = document.createElement('canvas'); result.width = 720; result.height = 100; return result; };
    const cached = canvas().getContext('2d'), raw = canvas().getContext('2d');
    const uncached = { fillRect: (...args) => raw.fillRect(...args),
      set fillStyle(value) { raw.fillStyle = value; } };
    let rasterWrites = 0, imageWrites = 0;
    const fill = cached.fillRect.bind(cached), draw = cached.drawImage.bind(cached);
    cached.fillRect = (...args) => { rasterWrites++; fill(...args); };
    cached.drawImage = (...args) => { imageWrites++; draw(...args); };
    for (const [value, size, color, align, y] of [
      ['PICO PARK 1-1 / 48', 14, '#493d48', 'left', 20],
      ['2ND STAT PLOT', 7, '#008800', 'center', 40],
      ['15s + 30s', 14, '#0088ff', 'right', 65],
    ]) {
      const x = align === 'left' ? 10 : 650;
      pixelText(cached, value, x, y, size, color, align);
      pixelText(uncached, value, x, y, size, color, align);
    }
    const a = cached.getImageData(0, 0, 720, 100).data, b = raw.getImageData(0, 0, 720, 100).data;
    return { equal: a.every((value, index) => value === b[index]), rasterWrites, imageWrites };
  });
  assert.deepEqual(pixels, { equal: true, rasterWrites: 0, imageWrites: 3 });
  await page.evaluate(() => panel.dispose());
  assert.deepEqual(errors, []);
  console.log('Optimization browser smoke passed: immediate edges, retained jumps, frame caching, pixel-identical text');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
