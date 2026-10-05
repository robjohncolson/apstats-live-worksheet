// Native goal unlock, input edge, key delivery and multiplayer completion contracts.
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
  const result = await page.evaluate(async () => {
    const { createCampaignEngine } = await import('/apstat-park/campaign-engine.mjs');
    const game = await createCampaignEngine();
    const samples = [];
    for (const party of [2, 8]) {
      game.load(35, party, 44);
      const runtime = game.runtime;
      game.step(Array(party).fill(0)); game.step(Array(party).fill(0));
      const pitcher = runtime.deadBallPitchers.find(p => p.spawn.actorName === 'BoundBallPitcher');
      const first = pitcher.nativeState.state.child;
      const initial = first.state;
      let removedAt = null, replacementAt = null;
      for (let tick = 0; tick < 200; tick++) {
        game.step(Array(party).fill(0));
        if (first.removed && removedAt === null) removedAt = tick;
        if (pitcher.nativeState.state.child && pitcher.nativeState.state.child !== first) { replacementAt = tick; break; }
      }
      const ball = pitcher.nativeState.state.child;
      const box = runtime.nativeBoundBoxes[0];
      // Place a live projectile at the mouth; the next real contact must send
      // command 11, accept it and publish a collectible Key.
      ball.resolvePosition(box.spawn.x - ball.state.velocity.x, box.spawn.y - 65);
      game.step(Array(party).fill(0));
      const reward = { captured: ball.state.captured, keys: runtime.keys.length, hits: box.nativeState.state.released,
        key: runtime.keys[0] && { active: runtime.keys[0].active, x: runtime.keys[0].spawn.x, y: runtime.keys[0].spawn.y },
        x: box.spawn.x, y: box.spawn.y - 30 };
      const mapContact = { active: first.nativeMapBody?.mapContacts,
        pending: first.nativeMapBody?.pendingMapContacts,
        sharedMap: first.nativeMapBody?.contactMap === runtime.nativeBoundMap,
        numericMap: runtime.nativeBoundMap?.table.every(Number.isInteger) };
      samples.push({ party, initial, removedAt, replacementAt, reward, mapContact });
    }
    game.load(35, 2, 44);
    const runtime = game.runtime;
    let invalid = null, bounces = 0;
    for (let tick = 0; tick < 2400; tick++) {
      const ball = runtime.deadBallPitchers[0].nativeState?.state.child;
      const inputs = runtime.players.map((p, i) => {
        const x = p.rect.x + p.rect.width / 2;
        const target = ball && !ball.removed ? ball.state.x - i * 45 : 1050 - i * 45;
        let bits = Math.abs(target - x) < 5 ? 0 : target > x ? 2 : 1;
        if (ball && !ball.state.remaining && ball.state.velocity.y > 0 && ball.state.y > 450 && p.grounded) bits |= 48;
        else if (!p.grounded && p.velocity.y < 0) bits |= 16;
        return bits;
      });
      const beforeVelocityY = ball?.state.velocity.y;
      game.step(inputs);
      const current = runtime.deadBallPitchers[0].nativeState?.state.child;
      if (current === ball && beforeVelocityY > 0 && current.state.velocity.y < 0) bounces++;
      if (current && ![current.state.x, current.state.y, current.state.velocity.x, current.state.velocity.y].every(Number.isFinite)) {
        invalid = { tick, state: current.state }; break;
      }
    }
    game.dispose(); return { samples, invalid, bounces };
  });
  console.log(JSON.stringify(result));
  for (const sample of result.samples) {
    assert.ok(sample.initial.velocity.x < 0, 'launcher emits leftward native movement');
    assert.ok(sample.removedAt !== null, 'a ball hitting the floor finishes its removal countdown');
    assert.equal(sample.replacementAt - sample.removedAt, 2, 'launcher clears child then replaces it on the next tick');
    assert.equal(sample.reward.captured, true);
    assert.equal(sample.reward.keys, 1);
    assert.equal(sample.reward.hits, true);
    assert.deepEqual(sample.reward.key, { active: true, x: sample.reward.x, y: sample.reward.y });
    assert.ok(sample.mapContact.active.some(normal => normal.x === 0 && normal.y === 1), 'native floor contact was accepted');
    assert.deepEqual(sample.mapContact.pending, [], 'native map finalization consumed pending contacts');
    assert.equal(sample.mapContact.sharedMap, true, 'retained contacts share the refreshed native map');
    assert.equal(sample.mapContact.numericMap, true);
  }
  assert.ok(result.bounces > 0, 'moving players actually bounce the ball during the contact run');
  assert.equal(result.invalid, null, 'player-body contacts keep native state finite');
  console.log('BOUND BALL INTEGRATION PASS: launch, floor loss, delayed replacement, sensor capture and reward key');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
