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
await page.screenshot({path:'test-results/push-after.png'});
const result = await page.evaluate(() => {
  const centerPixel = [...game.canvas.getContext('2d').getImageData(359, 560, 1, 1).data];
  const art = game.runtime.pushBoxes.map(box => ({pieces: box.view.children.length,
    alpha: box.view.alpha, width: box.view.children[0].width}));
  game.load(2, 2, 123);
  const runtime = game.runtime;
  const spawned = runtime.pushBoxes.map(box => box.rect.y);
  for (let frame = 0; frame < 120; frame++) game.step([0, 0]);
  const settled = runtime.pushBoxes.map(box => box.rect.y);
  // Isolate contacts using the shipped update method, independent of player AI/input.
  const box = runtime.pushBoxes[0];
  runtime.pushBoxes = [box];
  runtime.tileMap.rectHitsSolid = rect => rect.y + rect.height > 432;
  runtime.staticRects = []; runtime.moveWalls = []; runtime.weightedLifts = [];
  runtime.players[0].rect = {x: 180, y: 390, width: 40, height: 42};
  runtime.players[1].rect = {x: 500, y: 390, width: 40, height: 42};
  box.applyRect({x: 180, y: 250, width: 40, height: 50});
  box.velocityY = 0; box.falling = false;
  for (let frame = 0; frame < 120; frame++) runtime.updateFallingPushBoxes(1 / 60);
  const headBottom = box.rect.y + box.rect.height;
  runtime.players[0].rect.x = 600;
  for (let frame = 0; frame < 120; frame++) runtime.updateFallingPushBoxes(1 / 60);
  const floorBottom = box.rect.y + box.rect.height;
  return {centerPixel, art, spawned, settled, headBottom, floorBottom};
});
assert.deepEqual(result.centerPixel, [255, 255, 255, 255]);
assert(result.art.every(box => box.pieces === 10 && box.alpha === 1));
assert(result.settled.some((y, index) => y > result.spawned[index] + 10));
assert(Math.abs(result.headBottom - 390) < 1, JSON.stringify(result));
assert(Math.abs(result.floorBottom - 432) < 1, JSON.stringify(result));
console.log('PASS: native block art, unsupported spawn gravity, cat-head support, fall after support removal', result);
} finally { await browser.close(); server.close(); }
