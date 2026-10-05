// Bundle the recovered browser engine and original campaign without running the ROM.
// Optional first argument: recovered/browser_port directory (with npm dependencies).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { CAMPAIGN_PATCHES, patchCampaignSource } from './pico-campaign-patches.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] || resolve(root, '../../not-school/hermes/old-app/recovered/browser_port'));
const output = resolve(root, 'apstat-park/recovered');
mkdirSync(output, { recursive: true });
const settings = readFileSync(resolve(source, '../lua_archive_sources/seq_setting.lua'), 'utf8').replace(/--[^\n]*/g, '');
const rows = [...settings.slice(settings.indexOf('stageList ='), settings.indexOf('battleStageBegin ='))
  .matchAll(/^\s*\{\s*"(stage_[^"]+)"\s*,\s*TYPE_BEST_TIME([^\n]*)/gm)];
assert.equal(rows.length, 48);
const worlds = [...settings.slice(settings.indexOf('world ='), settings.indexOf('battleStage ='))
  .matchAll(/\{\s*"([^"]+)"[^{}]*\{([^}]+)\}/g)];
assert.equal(worlds.length, 12);
execFileSync('python', [resolve(root, 'scripts/export-pico-campaign.py'), source, resolve(output, 'stages.json')]);
const stages = JSON.parse(readFileSync(resolve(output, 'stages.json'), 'utf8'));
const byName = name => {
  const stage = stages.find(stage => stage.path === 'stage/' + name + '.lua');
  assert(stage, 'Missing recovered stage ' + name);
  return stage;
};
const campaign = worlds.flatMap((world, w) => world[2].split(',').map(Number).filter(Number.isFinite).map((index, s) => {
  const row = rows[index];
  const variants = [...row[2].matchAll(/\{\s*(\d+)\s*,\s*"([^"]+)"\s*\}/g)];
  // The final entry is the shipped network variant when one is present.
  const variant = variants.at(-1);
  return { index: w * 4 + s, world: w + 1, stage: s + 1, title: world[1],
    source: row[1], data: byName(row[1]),
    largeParty: variant ? { minimum: +variant[1], data: byName(variant[2]) } : null };
}));
assert.equal(campaign.length, 48);
assert.equal(new Set(campaign.map(stage => stage.source)).size, 48);
writeFileSync(resolve(root, 'apstat-park/campaign-catalog.mjs'),
  '// Original world order from recovered seq_setting.lua. Generated; do not edit.\nexport const CAMPAIGN = '
  + JSON.stringify(campaign.map(({ data, largeParty, ...stage }) => ({ ...stage, largeParty: largeParty?.data.name || null })), null, 2) + ';\n');

const hashes = {};
const runtimeEntry = `
import { Application } from 'pixi.js';
import { GameRuntime, RUNTIME_SPAWN_HANDLER_ACTOR_NAMES } from ${JSON.stringify(resolve(source, 'src/engine/GameRuntime.ts'))};
import { loadPicoSpriteAtlas } from ${JSON.stringify(resolve(source, 'src/engine/sprites.ts'))};
export { Application, GameRuntime, loadPicoSpriteAtlas, RUNTIME_SPAWN_HANDLER_ACTOR_NAMES };
export const stages = ${JSON.stringify(campaign)};
export { setRandomState, getRandomState } from 'campaign-random';
`;
await build({ stdin: { contents: runtimeEntry, resolveDir: source, sourcefile: 'campaign-entry.ts', loader: 'ts' },
  outfile: resolve(output, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  sourcemap: 'external', sourcesContent: true, minify: true, legalComments: 'linked',
  plugins: [{ name: 'recovered-campaign', setup(builder) {
    builder.onResolve({ filter: /^campaign-random$/ }, () => ({ path: 'campaign-random', namespace: 'campaign' }));
    builder.onLoad({ filter: /.*/, namespace: 'campaign' }, () => ({ contents:
      `let state=1; export const setRandomState=value=>{state=value>>>0||1;}; export const getRandomState=()=>state;
       export function picoRandom(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}` }));
    builder.onResolve({ filter: /\.png\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.replace('?inline', '')), namespace: 'atlas' }));
    builder.onLoad({ filter: /.*/, namespace: 'atlas' }, args => ({ contents: 'export default "data:image/png;base64,' + readFileSync(args.path).toString('base64') + '";' }));
    builder.onLoad({ filter: /\.ts$/ }, args => {
      if (!args.path.startsWith(resolve(source, 'src'))) return;
      let contents = readFileSync(args.path, 'utf8');
      hashes[relative(source, args.path).replaceAll('\\', '/')] = createHash('sha256').update(contents).digest('hex');
      contents = patchCampaignSource(relative(source, args.path).replaceAll('\\', '/'), contents);
      // Per-runtime seeded randomness makes input replay identical across classmates.
      if (contents.includes('Math.random()')) contents = "import { picoRandom } from 'campaign-random';\n" + contents.replaceAll('Math.random()', 'picoRandom()');
      // The calendar supplies the background; preserve the recovered terrain/art.
      contents = contents.replaceAll('g.beginFill(PICO_BACKGROUND, 1);', 'g.beginFill(PICO_BACKGROUND, 0);');
      return { contents, loader: 'ts', resolveDir: dirname(args.path) };
    });
  } }], metafile: true });
writeFileSync(resolve(output, 'provenance.json'), JSON.stringify({
  source: 'hermes/old-app/recovered/browser_port', campaignSource: 'lua_archive_sources/seq_setting.lua',
  stages: 48, worlds: 12, adaptations: ['seeded randomness for synchronized input replay', 'transparent map background'],
  patches: CAMPAIGN_PATCHES,
  localSources: Object.fromEntries([
    'scripts/pico-campaign-patches.mjs', 'scripts/pico-goal-patches.mjs',
    'apstat-park/native-goals.mjs', 'apstat-park/native-breakout-key.mjs',
    'apstat-park/native-rect.mjs',
    'scripts/pico-laser-patches.mjs', 'apstat-park/native-laser-runtime.mjs',
    'apstat-park/native-laser.mjs', 'apstat-park/native-pitcher.mjs', 'apstat-park/native-key-box.mjs',
  ].map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')])),
  hashes: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + '\n');
execFileSync(process.execPath, [resolve(root, 'scripts/audit-pico-campaign.mjs')], { stdio: 'inherit' });
console.log('Bundled 48 original campaign stages and recovered engine (' + Object.keys(hashes).length + ' source files).');
