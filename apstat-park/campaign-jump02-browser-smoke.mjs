import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
await mkdir('test-results', {recursive: true});
import {pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.PARK_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PARK_PLAYWRIGHT_MODULE).href : 'playwright');
const server=createServer(async(req,res)=>{try{res.setHeader('Content-Type',req.url.endsWith('.png')?'image/png':'text/javascript');res.end(await readFile(process.cwd()+decodeURI(req.url).split('?')[0]));}catch{res.end('');}});
await new Promise(r=>server.listen(0,r));
const browser=await chromium.launch({executablePath:process.env.PARK_BROWSER,headless:true});
try {
const page=await browser.newPage({viewport:{width:750,height:800}});
await page.goto('http://localhost:'+server.address().port+'/');
await page.evaluate(async()=>{const {createCampaignEngine}=await import('/apstat-park/campaign-engine.mjs');window.game=await createCampaignEngine({});game.load(1,2,123);document.body.style.background='#edf3ee';document.body.append(game.canvas);game.render();});

const result = await page.evaluate(() => {
  game.load(2, 2, 123);
  const runtime = game.runtime;
  const gates = runtime.gates.map(gate => ({...gate.rect}));
  const bridge = runtime.bridges.find(bridge => bridge.spawn.label === '');
  bridge.open();
  // bridge-folded-start-and-motion: open() sets the target (full span) and the strip extends 2 units per tick;
  // with no switch held the momentary pass would fold it again, so jump to the target to check the deployed extent.
  bridge.applyProgress(bridge.segmentMotion.target);
  const bridgeRect = {...bridge.rect};
  const box = runtime.pushBoxes[0]; runtime.pushBoxes = [box];
  const player = runtime.players[0], other = runtime.players[1];
  runtime.player = player;
  runtime.staticRects = []; runtime.weightedLifts = []; runtime.moveWalls = [];
  runtime.gates = []; runtime.bridges = [];
  runtime.tileMap.rectHitsSolid = () => false;
  function push(sign, pinned = false) {
    box.applyRect({x: 300, y: 382, width: 40, height: 50});
    other.rect = {x: sign > 0 ? 340 : 260, y: 390, width: 40, height: 42};
    const previous = {x: sign > 0 ? 260 : 340, y: 390, width: 40, height: 42};
    player.rect = {...previous, x: previous.x + sign * 2};
    player.velocity = {x: sign * 120, y: 0};
    runtime.tileMap.rectHitsSolid = r => pinned && (sign > 0 ? r.x + r.width > 380 : r.x < 260);
    runtime.applyPushBoxes(previous);
    return {box: box.rect.x, cat: other.rect.x};
  }
  const right = push(1), left = push(-1), pinnedRight = push(1, true), pinnedLeft = push(-1, true);
  runtime.tileMap.rectHitsSolid = () => false;
  runtime.bridges = [bridge]; other.rect.x = 900;
  box.applyRect({x: 400, y: 382, width: 40, height: 50});
  for (let step = 0; step < 20; step++) {
    const previous = {x: box.rect.x - 40, y: 390, width: 40, height: 42};
    player.rect = {...previous, x: previous.x + 2}; player.velocity = {x: 120, y: 0};
    runtime.applyPushBoxes(previous);
  }
  return {gates, bridgeRect, right, left, pinnedRight, pinnedLeft, crossedBridge: box.rect.x};
});
assert(result.gates.every(rect => rect.y === -24 && rect.height === 151 && rect.width === 30));
assert.deepEqual(result.bridgeRect, {x: 406, y: 432, width: 441, height: 20});
assert.deepEqual(result.right, {box: 302, cat: 342});
assert.deepEqual(result.left, {box: 298, cat: 258});
assert.deepEqual(result.pinnedRight, {box: 300, cat: 340});
assert.deepEqual(result.pinnedLeft, {box: 300, cat: 260});
assert.equal(result.crossedBridge, 440);
console.log('PASS: jump02 gate extents, bridge alignment and traversal, solid push chains', result);
} finally { await browser.close(); server.close(); }
