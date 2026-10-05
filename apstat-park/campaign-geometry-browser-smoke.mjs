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
  const checked = [];
  for (const count of [2, 8]) for (let stage = 0; stage < 48; stage++) {
    game.load(stage, count, 123);
    for (let frame = 0; frame < 10; frame++) game.step(Array(count).fill(0));
    game.render();
    for (const actor of [...game.runtime.gates, ...game.runtime.bridges, ...game.runtime.pushBoxes]) {
      if (!Object.values(actor.rect).every(Number.isFinite)) throw new Error('Invalid geometry at ' + stage);
    }
    checked.push([stage, count]);
  }
  return checked.length;
});
assert.equal(result, 96);
console.log('PASS: all 48 stages load, step, and render with finite geometry for 2 and 8 cats');
} finally { await browser.close(); server.close(); }
