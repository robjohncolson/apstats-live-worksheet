// Local-only smoke (teacher 2026-10-07: "make sure 1-4 plays correctly"): the real campaign engine (desk renderer and
// input path, campaign-engine.mjs) plays 1-4 at party 2 from spawn to STAGE CLEAR with the shared condition-driven
// route (campaign-playthrough-1-4.mjs), and screenshots the key moments. Needs Playwright: PARK_PLAYWRIGHT_MODULE may
// point to an installed playwright-core index.mjs and PARK_BROWSER to a Chromium/Edge/Chrome executable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const app = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.resolve(process.env.PARK_SMOKE_OUTPUT || 'test-results/park-campaign-playthrough');
mkdirSync(output, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body style="margin:0;background:#f7f5ee"><div id="stage"></div></body></html>');
    return;
  }
  const file = path.resolve(app, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(app + path.sep)) { response.writeHead(403); response.end(); return; }
  response.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  const stream = createReadStream(file);
  stream.on('error', () => { response.writeHead(404); response.end(); }); stream.pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/');
  const result = await page.evaluate(async () => {
    const { createCampaignEngine, campaignStages } = await import('/apstat-park/campaign-engine.mjs');
    const { playStage14 } = await import('/apstat-park/campaign-playthrough-1-4.mjs');
    const engine = await createCampaignEngine();
    document.getElementById('stage').append(engine.canvas);
    engine.load(campaignStages.findIndex(stage => stage.source === 'stage_weight01'), 2, 1);
    engine.setViewWidth(1600);
    // campaign-engine decodeInput bits: left 1, right 2, up 4, down 8, jump 16, jumpPressed 32.
    const bits = input => (input.left ? 1 : 0) | (input.right ? 2 : 0) | (input.up ? 4 : 0) | (input.down ? 8 : 0)
      | (input.jump ? 16 : 0) | (input.jumpPressed ? 32 : 0);
    const shots = [];
    const snap = new Set(['key', 'both on lift A', 'the wall passes over lift A', 'hop lift A back up', 'both on lift B', 'both enter']);
    const outcome = playStage14({ runtime: engine.runtime, advance: inputs => engine.step(inputs.map(bits)),
      cleared: () => !!engine.stats.cleared,
      onPhase: (label, frame) => { if (!snap.has(label)) return; engine.render(); shots.push({ label, frame, png: engine.canvas.toDataURL('image/png') }); } });
    engine.render();
    shots.push({ label: 'final', frame: outcome.frames, png: engine.canvas.toDataURL('image/png') });
    return { outcome, shots };
  });
  result.shots.forEach((shot, i) => writeFileSync(path.join(output, `1-4-${String(i).padStart(2, '0')}-${shot.label.replace(/[^a-z0-9]+/gi, '-')}.png`),
    Buffer.from(shot.png.split(',')[1], 'base64')));
  writeFileSync(path.join(output, 'playthrough.json'), JSON.stringify(result.outcome, null, 2));
  assert.equal(result.outcome.failedPhase, null, 'stuck at ' + result.outcome.failedPhase + ' ' + JSON.stringify(result.outcome.state));
  assert.equal(result.outcome.cleared, true);
  assert.deepEqual(errors, []);
  console.log('CAMPAIGN 1-4 PLAYTHROUGH PASS: cleared at frame ' + result.outcome.frames + ' (party 2, real campaign engine)');
} finally {
  await browser.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
