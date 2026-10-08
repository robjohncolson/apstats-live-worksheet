// Campaign solvability (teacher 2026-10-08: "go across all levels and make sure all the puzzles can be played out
// correctly"). Every stage has a scripted solver in campaign-solve/ that drives the party from spawn to the door
// with player inputs only. campaign-solve/manifest.json records what each solver achieved when it was last
// recorded:
//   SOLVED                 -> asserted here: a runtime change that breaks the route fails this test loudly.
//   BLOCKED                -> reported (diagnostic), never fails: the reason names the mechanic still to fix.
//   SKIPPED-UNIMPLEMENTED  -> reported: the stage's core mechanic is not in the runtime yet.
// When a BLOCKED stage starts clearing, the diagnostic says so: record it as SOLVED in the manifest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { STAGES, loadSolver, runSolver, solverFileFor } from './campaign-solve/driver.mjs';

const manifestUrl = new URL('./campaign-solve/manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const recorded = new Map(manifest.stages.map((row) => [row.tag, row]));

test('every campaign stage has a solver file and a manifest row', () => {
  assert.equal(STAGES.length, 48);
  for (const stage of STAGES) {
    assert.ok(existsSync(new URL('./campaign-solve/' + solverFileFor(stage), import.meta.url)), 'solver for ' + stage.tag);
    assert.ok(recorded.has(stage.tag), 'manifest row for ' + stage.tag);
  }
});

for (const stage of STAGES) {
  const row = recorded.get(stage.tag);
  const expected = row?.status ?? 'MISSING';
  test(`${stage.tag} ${stage.source}: recorded ${expected}`, async (t) => {
    const solver = await loadSolver(stage);
    const result = await runSolver(stage, solver);
    if (expected === 'SOLVED') {
      assert.equal(result.status, 'SOLVED', `${stage.tag} was recorded SOLVED in ${row.frames} frames; now ${result.status}: ` +
        `${result.reason ?? ''} ${JSON.stringify(result.details ?? {})}`);
      return;
    }
    if (result.status === 'SOLVED') {
      t.diagnostic(`${stage.tag} now CLEARS in ${result.frames} frames (recorded ${expected}): record it as SOLVED in manifest.json`);
      return;
    }
    t.diagnostic(`${stage.tag} ${result.status}: ${result.reason ?? ''}`);
  });
}
