/**
 * Tests for the offline video extractor (scripts/fetch-offline-videos.mjs).
 * Runs against the REAL Desk RESOURCES so the manifest plan can't silently drift.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { extractVideos } from '../scripts/fetch-offline-videos.mjs';

const DESK = readFileSync(resolve(import.meta.dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');
const vids = extractVideos(DESK);

describe('extractVideos (offline video acquisition plan)', () => {
  it('finds a substantial set of lesson videos', () => {
    expect(vids.length).toBeGreaterThan(100);
  });

  it('maps topic 1-1 to its known Drive copy', () => {
    const v = vids.find((x) => x.topic === '1-1' && x.idx === 0);
    expect(v).toBeTruthy();
    expect(v.source).toBe('drive');
    expect(v.id).toBe('1wEbNmDM4KBUWvvoRoQIgIYKYWxG3x6Cv');
    expect(v.url).toContain('apclassroom.collegeboard.org');
  });

  it('classifies the lone YouTube fallback', () => {
    const yt = vids.filter((x) => x.source === 'youtube');
    expect(yt.length).toBeGreaterThanOrEqual(1);
    expect(yt.every((x) => x.id && x.id.length >= 6)).toBe(true);
  });

  it('every entry is downloadable (drive/youtube) — no silent unsupported sources', () => {
    const bad = vids.filter((x) => x.source !== 'drive' && x.source !== 'youtube');
    expect(bad.map((b) => `${b.topic}: ${b.altUrl}`)).toEqual([]);
  });

  it('keys are unique per (topic, idx) so multi-video topics do not collide', () => {
    const keys = vids.map((v) => `${v.topic}__${v.idx}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('handles multi-video topics (e.g. 1-4 has 2 videos)', () => {
    const u14 = vids.filter((x) => x.topic === '1-4');
    expect(u14.length).toBeGreaterThanOrEqual(2);
    expect(u14.map((x) => x.idx)).toEqual(u14.map((_, i) => i));
  });
});
