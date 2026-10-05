// Checks sensor bounds against native local [0,0,w,h], including large-party variants.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PARK_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.end('<!doctype html><body>Sensor audit</body>'); return; }
  const file = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    response.setHeader('Content-Type', extname(file) === '.mjs' ? 'text/javascript' : 'image/png');
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
  ...(process.env.PARK_BROWSER ? { executablePath: process.env.PARK_BROWSER } : {}) });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const samples = await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine(), samples = [];
    for (let index = 0; index < 48; index++) {
      for (const count of [2, 8]) {
        game.load(index, count, 12345);
        for (const tick of [0, 1, 120]) {
          for (let frame = tick === 120 ? 1 : 0; frame < tick; frame++) game.step(Array(count).fill(0));
          game.render();
          for (const sensor of [...game.runtime.warps, ...game.runtime.warpAlls]) {
            samples.push({ index, count, tick, actor: sensor.spawn.actorName,
              actual: sensor.rect, expected: { x: sensor.spawn.x, y: sensor.spawn.y - sensor.triggerSize.height,
                width: sensor.triggerSize.width, height: sensor.triggerSize.height }, visible: sensor.view.visible });
          }
        }
      }
    }
    game.dispose(); return samples;
  });
  assert.ok(samples.length > 0);
  assert.ok(samples.some(sample => sample.actor === 'WarpAll'));
  for (const sample of samples) {
    assert.deepEqual(sample.actual, sample.expected, JSON.stringify(sample));
    assert.equal(sample.visible, false, 'Invisible native sensor: ' + JSON.stringify(sample));
  }
  await mkdir('test-results/park-campaign-sensors', { recursive: true });
  await writeFile('test-results/park-campaign-sensors/sensors.json', JSON.stringify(samples, null, 2));
  console.log(`CAMPAIGN SENSORS PASS: ${samples.length} samples across all 48 stages, 2/8 players, load/update/render`);
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
