// @vitest-environment node
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

it('bakes the exact video-minute inventory into the Desk', () => {
  const desk = readFileSync('ap_stats_roadmap_square_mode.html', 'utf8');
  const matches = [...desk.matchAll(/^const VIDEO_MINUTES = (\{[^\r\n]*\});/gm)];
  expect(matches).toHaveLength(1);
  const inventory = JSON.parse(readFileSync('data/video-minutes.json', 'utf8'));
  const expected = Object.fromEntries(Object.entries(inventory.topics).map(([topic, entry]) => [topic, entry.minutes]));
  expect(JSON.parse(matches[0][1])).toEqual(expected);
});
