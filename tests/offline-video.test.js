/**
 * Tests for offline-video.js (OFFLINE_MODE_SPEC §4.H) + the Desk render branch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'offline-video.js'), 'utf8');
const DESK = readFileSync(resolve(import.meta.dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

const MANIFEST = {
  byUrl: {
    'https://apclassroom.collegeboard.org/d/708w9bpk60?sui=33,1': { topic: '1-1', file: 'media/1-1__0__abc.mp4' },
    'https://drive.google.com/file/d/abc/view': { topic: '1-1', file: 'media/1-1__0__abc.mp4' },
  },
};

function boot({ offline = true, fetchImpl } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost:8765/index.html' });
  const win = dom.window;
  if (offline) win.OFFLINE_MODE = true;
  win.fetch = fetchImpl || vi.fn().mockResolvedValue({ ok: true, json: async () => MANIFEST });
  const ctx = createContext(win);
  runInContext(SRC, ctx);
  return win;
}

describe('OfflineVideo.load + localFor', () => {
  it('loads the manifest when OFFLINE_MODE and resolves a network URL to a local file', async () => {
    const win = boot();
    await win.OfflineVideo.load();
    expect(win.OfflineVideo.localFor('https://apclassroom.collegeboard.org/d/708w9bpk60?sui=33,1')).toBe('media/1-1__0__abc.mp4');
    expect(win.OfflineVideo.localFor('https://drive.google.com/file/d/abc/view')).toBe('media/1-1__0__abc.mp4');
  });

  it('returns null for an unknown url or empty input', async () => {
    const win = boot();
    await win.OfflineVideo.load();
    expect(win.OfflineVideo.localFor('https://example.com/x')).toBeNull();
    expect(win.OfflineVideo.localFor('')).toBeNull();
    expect(win.OfflineVideo.localFor(null)).toBeNull();
  });

  it('does NOT fetch when not in OFFLINE_MODE (and resolves nothing)', async () => {
    const fetchFn = vi.fn();
    const win = boot({ offline: false, fetchImpl: fetchFn });
    await win.OfflineVideo.load();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(win.OfflineVideo.localFor('https://drive.google.com/file/d/abc/view')).toBeNull();
  });

  it('survives a failed manifest fetch (stays empty, never throws)', async () => {
    const win = boot({ fetchImpl: vi.fn().mockRejectedValue(new Error('no manifest')) });
    await win.OfflineVideo.load();
    expect(win.OfflineVideo.localFor('https://drive.google.com/file/d/abc/view')).toBeNull();
  });
});

describe('OfflineVideo.open', () => {
  it('opens a local <video> overlay and closes on Escape', async () => {
    const win = boot();
    win.OfflineVideo.open('media/1-1__0__abc.mp4', 'Video 1');
    const ov = win.document.getElementById('offline-video-overlay');
    expect(ov).not.toBeNull();
    const vid = ov.querySelector('video');
    expect(vid).not.toBeNull();
    expect(vid.getAttribute('src')).toBe('media/1-1__0__abc.mp4');
    // Escape closes it
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(win.document.getElementById('offline-video-overlay')).toBeNull();
  });

  it('no-ops on a falsy file', () => {
    const win = boot();
    expect(win.OfflineVideo.open('', 'x')).toBeNull();
    expect(win.document.getElementById('offline-video-overlay')).toBeNull();
  });
});

describe('Desk render branch (source pins)', () => {
  it('loads offline-video.js before gradebook-client.js', () => {
    const ov = DESK.indexOf('src="offline-video.js"');
    const gb = DESK.indexOf('src="gradebook-client.js"');
    expect(ov).toBeGreaterThan(0);
    expect(ov).toBeLessThan(gb);
  });

  it('renders a local-video link in OFFLINE_MODE when a copy exists (XSS-safe)', () => {
    expect(DESK).toContain('OfflineVideo.localFor(v.url) || OfflineVideo.localFor(v.altUrl)');
    expect(DESK).toMatch(/window\.OFFLINE_MODE && window\.OfflineVideo/);
    // onclick uses _deskEsc(JSON.stringify(...)) — the established safe idiom
    expect(DESK).toContain('OfflineVideo.open(\' + _deskEsc(JSON.stringify(_ovFile))');
    expect(DESK).toContain('(offline)</a>');
  });

  it('keeps the offline branch ahead of the apclassroom/alt branches (falls through when no local copy)', () => {
    const i = DESK.indexOf('if (_ovFile) {');
    const j = DESK.indexOf('} else if (_apAvail) {');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });
});
