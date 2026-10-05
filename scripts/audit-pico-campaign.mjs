// Inventory, not a fidelity certificate. Run after build-pico-campaign.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { CAMPAIGN } from '../apstat-park/campaign-catalog.mjs';

const root = new URL('../apstat-park/', import.meta.url);
const stages = JSON.parse(readFileSync(new URL('recovered/stages.json', root)));
const sourceMap = JSON.parse(readFileSync(new URL('recovered/runtime.mjs.map', root)));
const runtime = sourceMap.sourcesContent[sourceMap.sources.findIndex(path => path.endsWith('/GameRuntime.ts'))];
if (!runtime) throw new Error('Missing recovered runtime source');
const registry = runtime.slice(runtime.indexOf('export const IMPLEMENTED_RUNTIME_ACTOR_REGISTRY'),
  runtime.indexOf('type ImplementedRuntimeActorName'));
const provenance = Object.fromEntries([...registry.matchAll(/^\s+(\w+):\s*\{\s*provenance:\s*'([^']+)'/gm)]
  .map(match => [match[1], match[2]]));
const report = CAMPAIGN.map(entry => {
  const names = [entry.source, entry.largeParty].filter(Boolean);
  const definitions = names.map(name => {
    const stage = stages.find(stage => stage.path === `stage/${name}.lua` || stage.name === name);
    if (!stage) throw new Error('Missing stage ' + name);
    return stage;
  });
  const actors = [...new Set(definitions.flatMap(stage => stage.createTable.map(actor => actor.actorName)))].sort();
  return {
    stage: `${entry.world}-${entry.stage}`, source: entry.source,
    definitions: definitions.map(stage => stage.path),
    fidelity: 'not-fully-verified',
    actors: actors.map(name => ({ name, upstreamProvenance: provenance[name] || 'unclassified' })),
    correctedContracts: actors.some(name => name.startsWith('Warp') && !name.startsWith('WarpGun'))
      ? ['Warp/WarpAll left-bottom sensor bounds; invisible sensor presentation'] : [],
    remainingChecks: [
      ...(actors.includes('Goal') ? ['Goal unlock commands, key delivery, fresh-Up entry and team completion'] : []),
      ...(actors.includes('Rect') && entry.index !== 0 ? ['Rect anchor, collision surface and visible skirt'] : []),
      'Native timing, collisions and complete puzzle solution for every supported party size',
      'Presentation and retry/checkpoint behavior against native evidence',
    ],
  };
});
writeFileSync(new URL('recovered/fidelity-audit.json', root), JSON.stringify({
  scope: 'All 48 campaign entries including alternate large-party definitions; dynamically spawned actors require separate tracing.',
  interpretation: 'Upstream recovered-data labels describe evidence provenance, not complete verified behavior. Smoke and determinism tests do not establish fidelity.',
  stages: report,
}, null, 2) + '\n');
console.log(`Inventoried ${report.length} stages; ${report.filter(stage => stage.actors.some(actor => actor.upstreamProvenance === 'suspected')).length} use explicitly suspected actor implementations.`);
