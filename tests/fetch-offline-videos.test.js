/**
 * Tests for the offline video extractor (scripts/fetch-offline-videos.mjs).
 * Runs against the REAL Desk RESOURCES so the manifest plan can't silently drift.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { extractVideos, extractDriveIds, parseDriveConfirm } from '../scripts/fetch-offline-videos.mjs';

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

describe('extractDriveIds', () => {
  it('pulls unique Drive file ids from file/d/ and id= forms', () => {
    const text = 'a https://drive.google.com/file/d/1AAAAAAAAAAAAAAAAAAAAA/view b '
      + 'https://drive.google.com/uc?export=download&id=1BBBBBBBBBBBBBBBBBBBBB c '
      + 'https://drive.google.com/file/d/1AAAAAAAAAAAAAAAAAAAAA/view again';
    expect(extractDriveIds(text).sort()).toEqual(['1AAAAAAAAAAAAAAAAAAAAA', '1BBBBBBBBBBBBBBBBBBBBB']);
  });
  it('the Desk and the cr quiz app reference the same Drive id set', () => {
    const deskIds = new Set(extractDriveIds(DESK));
    const cr = resolve(import.meta.dirname, '..', '..', 'curriculum_render', 'data', 'units.js');
    let crText = '';
    try { crText = readFileSync(cr, 'utf8'); } catch (_) { /* cr not present in this checkout */ }
    if (!crText) return;
    const crIds = extractDriveIds(crText);
    expect(crIds.length).toBeGreaterThan(100);
    expect(crIds.every((id) => deskIds.has(id))).toBe(true); // no cr-only videos
  });
});

describe('parseDriveConfirm (large-file interstitial → real download URL)', () => {
  it('builds the usercontent download URL from the confirm form', () => {
    const html = `<html><body><form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
      <input type="hidden" name="id" value="FILEID123">
      <input type="hidden" name="export" value="download">
      <input type="hidden" name="confirm" value="t">
      <input type="hidden" name="uuid" value="abc-uuid-9">
    </form></body></html>`;
    const url = parseDriveConfirm(html, 'FILEID123');
    expect(url).toContain('https://drive.usercontent.google.com/download?');
    expect(url).toContain('id=FILEID123');
    expect(url).toContain('confirm=t');
    expect(url).toContain('uuid=abc-uuid-9');
  });

  it('falls back to a confirm token if no form is present', () => {
    const url = parseDriveConfirm('…href="/uc?export=download&confirm=ZxYw&id=FID"…', 'FID');
    expect(url).toContain('drive.usercontent.google.com/download');
    expect(url).toContain('id=FID');
    expect(url).toContain('confirm=ZxYw');
  });

  it('returns null when the page is neither a form nor a token page', () => {
    expect(parseDriveConfirm('<html>nope</html>', 'FID')).toBeNull();
  });
});
