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
      game.load(32, party, 12);
      const runtime = game.runtime;
      let reset = null, completed = null;
      for (let tick = 0; tick < 1000; tick++) {
        for (const player of runtime.players) {
          player.rect.x = 400; player.rect.y = 40;
          player.velocity.x = 0; player.velocity.y = 0;
        }
        const box = runtime.nativeLaserBoxes[0];
        const pitcher = runtime.deadBallPitchers.find(actor => actor.spawn.actorName === 'LaserBallPitcher');
        // Exercise a real player collision after the first successful delivery.
        if (party === 2 && !reset && box.nativeState.state.hits === 1) {
          const child = pitcher.nativeState?.state.child;
          if (child && !child.state.remaining && child.state.x > 200) {
            runtime.players[0].rect.x = child.state.x - 30;
            runtime.players[0].rect.y = child.state.y - 30;
          }
        }
        game.step(Array(party).fill(0));
        if (party === 2 && !reset && pitcher.nativeState.state.speed === 7 && tick > 120 && box.nativeState.state.hits === 0) {
          reset = { speed: pitcher.nativeState.state.speed, hits: box.nativeState.state.hits };
        }
        if (box.nativeState.state.released) {
          completed = { tick, hits: box.nativeState.state.hits, keys: runtime.keys.length,
            keyActive: runtime.keys[0].active, x: runtime.keys[0].spawn.x, y: runtime.keys[0].spawn.y,
            expectedX: box.spawn.x, expectedY: box.spawn.y - 30 };
          break;
        }
      }
      samples.push({ party, reset, completed });
    }
    game.load(32, 2, 34);
    const runtime = game.runtime;
    let solvedAt = null, keyTick = null;
    for (let tick = 0; tick < 3500; tick++) {
      const reward = runtime.nativeLaserBoxes[0].nativeState.state.released;
      const key = runtime.keys[0];
      if (reward && keyTick === null) keyTick = tick;
      const ball = runtime.deadBallPitchers.find(p => p.spawn.actorName === 'LaserBallPitcher').nativeState?.state.child;
      const inputs = runtime.players.map((player, index) => {
        if (runtime.goalClearedPlayers.has(player)) return 0;
        const x = player.rect.x + player.rect.width / 2;
        let bits = 0;
        if (!reward) {
          if (ball && !ball.removed && !ball.state.remaining && ball.state.x - x > 0 && ball.state.x - x < runtime.deadBallPitchers.find(p => p.spawn.actorName === 'LaserBallPitcher').nativeState.state.speed * 14 && player.grounded) bits = 48;
          else if (!player.grounded && player.velocity.y < 0) bits = 16;
        } else {
          const goal = runtime.goals[0];
          const destination = index === 0 && !key.collected ? key.spawn.x : goal.spawn.x + (goal.opened ? 0 : 35 * (index + 1));
          if (Math.abs(destination - x) > 8) bits = destination > x ? 2 : 1;
          if (Math.abs(destination - x) < 25 && tick % 2 === 0) bits |= 4;
        }
        return bits;
      });
      game.step(inputs);
      if (game.stats.cleared) { solvedAt = tick; break; }
    }
    const solution = { solvedAt, keyTick, players: runtime.players.map(p => ({ rect: p.rect, grounded: p.grounded })),
      key: runtime.keys[0] && { collected: runtime.keys[0].collected, active: runtime.keys[0].active },
      hits: runtime.nativeLaserBoxes[0].nativeState.state.hits, entered: runtime.players.map(p => runtime.goalClearedPlayers.has(p)) };
    game.dispose();
    return { samples, solution };
  });
  console.log(JSON.stringify(result));
  for (const sample of result.samples) {
    assert.ok(sample.completed, `party ${sample.party} produces a reward key through projectile contacts`);
    assert.equal(sample.completed.hits, 3);
    assert.equal(sample.completed.keys, 1);
    assert.equal(sample.completed.keyActive, true);
    assert.equal(sample.completed.x, sample.completed.expectedX);
    assert.equal(sample.completed.y, sample.completed.expectedY);
  }
  assert.deepEqual(result.samples[0].reset, { speed: 7, hits: 0 });
  assert.ok(result.solution.solvedAt !== null, 'input-only team route earns and delivers the key, then enters the door');
  console.log('NATIVE LASER CORRIDOR PASS: real projectile contacts, reset and three-hit reward for 2/8 players');
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
