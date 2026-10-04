import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignReplay } from './campaign-replay.mjs';
import { CAMPAIGN } from './campaign-catalog.mjs';

test('original world order covers exactly 48 distinct campaign stages', () => {
  assert.equal(CAMPAIGN.length, 48);
  assert.equal(new Set(CAMPAIGN.map(stage => stage.source)).size, 48);
  for (let i = 0; i < 48; i++) {
    assert.equal(CAMPAIGN[i].world, Math.floor(i / 4) + 1);
    assert.equal(CAMPAIGN[i].stage, i % 4 + 1);
  }
  assert.deepEqual(CAMPAIGN.slice(0, 4).map(stage => stage.source), ['stage_jump01', 'stage_push02', 'stage_jump02', 'stage_weight01']);
  assert.equal(CAMPAIGN[47].source, 'stage_auto_scroll02');
});

test('dropped batches request replay; duplicate delivery cannot replay a jump edge', () => {
  const seen = [], replay = createCampaignReplay(inputs => seen.push([...inputs]));
  replay.reset(2);
  assert.equal(replay.accept({ from: 3, to: 6, events: [] }), false);
  const packet = { from: 0, to: 3, events: [{ frame: 1, inputs: [48, 0] }, { frame: 2, inputs: [16, 0] }] };
  replay.accept(packet); replay.advance(3); replay.accept(packet); replay.advance(3);
  assert.deepEqual(seen, [[48, 0], [16, 0], [16, 0]]);
  replay.accept({ from: 3, to: 6, events: [{ frame: 5, inputs: [0, 2] }] }); replay.advance(3);
  assert.deepEqual(seen.slice(3), [[16, 0], [0, 2], [0, 2]]);
});
