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
    correctedContracts: [
      ...(actors.some(name => name.endsWith('Player')) ? ['Native default player body, movement units, size/art alignment and visual reset'] : []),
      ...(actors.some(name => name.startsWith('Warp') && !name.startsWith('WarpGun'))
        ? ['Warp/WarpAll actor-origin sensor bounds; invisible sensor presentation'] : []),
      ...(actors.includes('Rect') ? ['Literal Rect bottom anchor, native party scaling and full body height'] : []),
      ...(actors.includes('Goal') ? ['Closed/open goal, key delivery and deferred consumption, per-player fresh-Up entry'] : []),
      ...(actors.includes('BreakoutKey') ? ['Breakout reward key activation after removal of BR1..BR5 chips'] : []),
      ...(actors.includes('LaserKeyBox') ? ['Laser launcher speed/lifecycle, hit/reset commands, three-hit reward and native atlas frames'] : []),
      ...(actors.includes('BallBox') ? ['BoundBall gravity/mass response and BallBox capture/reward lifecycle; preview collision adapter remains'] : []),
    ],
    remainingChecks: [
      ...(actors.includes('Goal') ? ['Entered-player physical deactivation, dynamic reward paths and complete team solution'] : []),
      ...(actors.includes('LaserKeyBox') ? ['Native global actor/contact phase ordering and complete player-input-only puzzle solution'] : []),
      ...(actors.includes('BallBox') ? ['Native pair solver, BallBox horizontal push/support behavior and input-only puzzle solution'] : []),
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
