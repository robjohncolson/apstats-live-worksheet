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
  const r = game.runtime;
  const thresholds = r.pushBoxes.map(box => r.pushBoxRequiredPlayers(box));
  game.step([0, 0, 128]);
  const teacher = r.players.find(player => player.parkHelper);
  if (!teacher) throw new Error('Teacher cat was not spawned');
  const before = teacher.rect.x;
  for (let i = 0; i < 20; i++) game.step([0, 0, 130]);
  const moved = teacher.rect.x !== before;
  const after = r.pushBoxes.map(box => r.pushBoxRequiredPlayers(box));
  game.render();
  game.step([0, 0, 0]);
  const left = r.players.length;
  game.load(0, 2, 123); game.step([0, 0, 128]);
  const goal = game.runtime.goals[0];
  game.runtime.coinObserverKeyGateOpen = () => true;
  for (const player of game.runtime.players.filter(player => !player.parkHelper)) Object.assign(player.rect, goal.rect);
  const helper = game.runtime.players.find(player => player.parkHelper); helper.rect.x = -1000;
  game.runtime.checkGoals();
  const clearWithoutTeacher = game.runtime.cleared;
  // Smoke every original stage with an optional helper entering and leaving.
  for (let stage = 0; stage < 48; stage++) {
    game.load(stage, 2, 123);
    for (let frame = 0; frame < 4; frame++) game.step([0, 0, 128]);
    game.render(); game.step([0, 0, 0]); game.render();
  }
  return { thresholds, after, moved, left, clearWithoutTeacher };
});
assert.deepEqual(result.thresholds, result.after);
assert.equal(result.moved, true);
assert.equal(result.left, 2);
assert.equal(result.clearWithoutTeacher, true);
console.log('Teacher cat moves, leaves cleanly, does not change box thresholds or goal requirements; all 48 stages render');
} finally { await browser.close(); server.close(); }
