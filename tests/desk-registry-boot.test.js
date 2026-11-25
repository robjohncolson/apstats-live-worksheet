// @vitest-environment node
// tests/desk-registry-boot.test.js — the Desk carries no built-in (baked) lesson registry.
//
// REGISTRY starts as { lessons: {} }. Before the first paint the Desk seeds it from this
// device's saved roadmap (localStorage apstats_roadmap_registry_cache_v2); loadRegistry()
// then merges roadmap-data.json and loadSupabaseOverlay() lays the live Supabase rows on top.
//
// These cases run the Desk's REAL code in a vm sandbox: the registry prelude (banner through
// the seed call) plus the real loader functions (fnBody), with a fake localStorage, a fake
// #roadmap-status element and a stubbed fetch. The CED label helper is the real one too, so
// the prelude's configureCedLabels(...) wires labels to the real REGISTRY, as on the page.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { deskHtml, deskSource, fnBody } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(ROOT, file), 'utf8');

const ROADMAP_TEXT = read('roadmap-data.json');
const ROADMAP = JSON.parse(ROADMAP_TEXT);
const CROSSWALK = JSON.parse(read('2026-crosswalk.json')).map;
const CED_SOURCE = read('js/ced2026-crosswalk.js') + '\n' + read('js/ced2026-labels.js');
const CACHE_KEY = 'apstats_roadmap_registry_cache_v2';

const DESK_SRC = deskSource();
const BANNER = '/* ═══ LESSON REGISTRY';
const SEED_CALL = /^_seedRegistryFromSavedRoadmap\(\);$/m;

// The prelude exactly as the page runs it: banner, REGISTRY, configureCedLabels, the
// ROADMAP_* consts, the seed function and its call.
function registryPrelude() {
  const start = DESK_SRC.indexOf(BANNER);
  if (start < 0) throw new Error('LESSON REGISTRY banner not found');
  const call = SEED_CALL.exec(DESK_SRC.slice(start));
  if (!call) throw new Error('seed call not found after the banner');
  return DESK_SRC.slice(start, start + call.index + call[0].length);
}

const LOADER_FUNCTIONS = [
  '_setRoadmapStatus', '_wireRoadmapNetworkStatus', '_readRoadmapCache', '_writeRoadmapCache',
  '_roadmapFetch', '_roadmapFetchJson', '_roadmapFetchJsonRetry', '_mergeRegistryData',
  '_overlayCacheKey', 'loadRegistry', 'loadSupabaseOverlay', 'mergeSupabase',
];

// Small Supabase fixture: one lesson's links and one posted schedule row.
const SUPABASE_URL_ROWS = [{
  topic: '1.1',
  worksheet_url: 'https://example.test/u1_lesson1_live.html',
  drills_url: null,
  quiz_url: 'https://example.test/quiz-1-1',
  blooket_url: 'https://example.test/blooket-1-1',
}];
const SUPABASE_SCHED_ROWS = [{ topic: '1.1', date: '2026-09-02', title: 'Topic 1.1', status: 'posted', schoology_folder_id: null }];

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(value)) };
}

// roadmap / supabase: 'ok' answers, 'reject' throws like a network failure.
function bootSandbox({ saved = null, roadmap = 'ok', supabase = 'ok', online = true } = {}) {
  const store = new Map();
  if (saved !== null) store.set(CACHE_KEY, saved);
  const status = { hidden: true, textContent: '', dataset: {} };
  const fetched = [];

  async function fetch(url) {
    fetched.push(String(url));
    if (url === 'roadmap-data.json') {
      if (roadmap === 'reject') throw new Error('roadmap-data.json unreachable');
      return jsonResponse(ROADMAP);
    }
    if (supabase === 'reject') throw new Error('Supabase unreachable');
    if (String(url).includes('/rest/v1/topic_schedule')) return jsonResponse(SUPABASE_SCHED_ROWS);
    if (String(url).includes('/rest/v1/lesson_urls')) return jsonResponse(SUPABASE_URL_ROWS);
    throw new Error('unexpected fetch ' + url);
  }

  const sandbox = {
    console, setTimeout, clearTimeout, AbortController, fetch,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { store.set(key, String(value)); },
      removeItem: (key) => { store.delete(key); },
    },
    navigator: { onLine: online },
    document: { getElementById: (id) => (id === 'roadmap-status' ? status : null) },
    addEventListener() {},
    rCal() {}, rProg() {}, renderDoNow() {},
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-test',
    SCHOOLOGY_COURSE_B: '', SCHOOLOGY_COURSE_E: '', cP: 'B', _supaCache: {},
  };
  const ctx = createContext(sandbox);
  runInContext('var window = this;', ctx);
  runInContext(CED_SOURCE, ctx);
  runInContext(registryPrelude() + '\n' + LOADER_FUNCTIONS.map(fnBody).join('\n'), ctx);

  return {
    store,
    status,
    fetched,
    registry: () => runInContext('REGISTRY', ctx),
    run: (code) => runInContext(code, ctx),
  };
}

const savedCopy = (data) => JSON.stringify({ ts: Date.now(), data });

describe('(a) an empty base plus roadmap-data.json', () => {
  it('gives REGISTRY.lessons deep-equal to the file', () => {
    const desk = bootSandbox();
    expect(desk.registry()).toEqual({ lessons: {} });
    expect(desk.run('_mergeRegistryData(' + ROADMAP_TEXT + ')')).toBe(true);
    expect(JSON.parse(JSON.stringify(desk.registry().lessons))).toEqual(ROADMAP.lessons);
    expect(Object.keys(desk.registry().lessons)).toHaveLength(Object.keys(ROADMAP.lessons).length);
  });

  it('merging the saved copy and then the live file (a returning device) gives the same lessons', () => {
    const desk = bootSandbox({ saved: savedCopy(ROADMAP) });
    desk.run('_mergeRegistryData(' + ROADMAP_TEXT + ')');
    expect(JSON.parse(JSON.stringify(desk.registry().lessons))).toEqual(ROADMAP.lessons);
  });
});

describe('(b) _seedRegistryFromSavedRoadmap', () => {
  it('fills the registry from the saved copy before any fetch', () => {
    const desk = bootSandbox({ saved: savedCopy(ROADMAP) });
    expect(desk.fetched).toEqual([]);
    expect(JSON.parse(JSON.stringify(desk.registry().lessons))).toEqual(ROADMAP.lessons);
  });

  it('uses a saved copy older than 14 days too, like loadRegistry does', () => {
    const old = JSON.stringify({ ts: Date.now() - 30 * 24 * 60 * 60 * 1000, data: ROADMAP });
    const desk = bootSandbox({ saved: old });
    expect(Object.keys(desk.registry().lessons)).toHaveLength(Object.keys(ROADMAP.lessons).length);
  });

  it('leaves { lessons: {} } when there is no saved copy', () => {
    const desk = bootSandbox();
    expect(desk.registry()).toEqual({ lessons: {} });
    expect(desk.run('_seedRegistryFromSavedRoadmap()')).toBe(false);
    expect(desk.registry()).toEqual({ lessons: {} });
  });

  it('returns false and does not throw on a corrupt saved copy', () => {
    let desk;
    expect(() => { desk = bootSandbox({ saved: '{not json' }); }).not.toThrow();
    expect(desk.registry()).toEqual({ lessons: {} });
    expect(desk.run('_seedRegistryFromSavedRoadmap()')).toBe(false);
  });

  it('returns false on a saved copy with no lessons', () => {
    const desk = bootSandbox({ saved: savedCopy({ generatedAt: 'x' }) });
    expect(desk.registry()).toEqual({ lessons: {} });
    expect(desk.run('_seedRegistryFromSavedRoadmap()')).toBe(false);
  });

  it('does not throw when localStorage itself throws (blocked site data)', () => {
    const desk = bootSandbox();
    desk.run('localStorage.getItem = function () { throw new Error("blocked"); };');
    expect(desk.run('_seedRegistryFromSavedRoadmap()')).toBe(false);
  });
});

describe('(c) the seed runs before the first paint', () => {
  it('the seed call comes after the ROADMAP_* consts and before the boot loadYear(cYear)', () => {
    const seed = SEED_CALL.exec(DESK_SRC);
    const lastConst = DESK_SRC.indexOf('const ROADMAP_CACHE_MAX_AGE_MS');
    const bootLoadYear = /^\s*loadYear\(cYear\);/m.exec(DESK_SRC);
    expect(seed).toBeTruthy();
    expect(bootLoadYear).toBeTruthy();
    expect(lastConst).toBeGreaterThan(-1);
    expect(seed.index).toBeGreaterThan(lastConst);
    expect(seed.index).toBeLessThan(bootLoadYear.index);
  });

  it('the seed and the helpers it calls share one inline <script>, so hoisting reaches them', () => {
    const blocks = [...deskHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const block = blocks.find((text) => SEED_CALL.test(text));
    expect(block).toBeTruthy();
    expect(block).toContain('function _readRoadmapCache(');
    expect(block).toContain('function _mergeRegistryData(');
  });
});

describe('(d) labels need no registry', () => {
  it('every lesson in roadmap-data.json gets its CED label, never the raw old key, with REGISTRY empty', () => {
    const empty = bootSandbox();
    const full = bootSandbox({ saved: savedCopy(ROADMAP) });
    expect(empty.registry()).toEqual({ lessons: {} });
    for (const key of Object.keys(ROADMAP.lessons)) {
      const label = empty.run('cedLabel(' + JSON.stringify(key) + ')');
      expect(label.mapped, key).toBe(true);
      expect(label.text, key).not.toBe(key);
      const entry = CROSSWALK[key];
      const allowed = entry && entry.status === 'core' ? [entry.newTopic] : [];
      const numbers = label.text.match(/(?<![\d.])[1-9]\.\d{1,2}(?![\d%]|\.\d)/g) || [];
      expect(numbers.filter((n) => !allowed.includes(n)), key + ': ' + label.text).toEqual([]);
      // Same text the loaded registry gives (its ced2026 overlay matches the crosswalk).
      expect(label.text, key).toBe(full.run('cedLabel(' + JSON.stringify(key) + ').text'));
    }
  });
});

describe('(e) nothing claims a built-in copy', () => {
  it('the Desk source has no BAKED_REGISTRY and no built-in roadmap or lesson-link wording', () => {
    for (const text of [deskHtml(), DESK_SRC]) {
      expect(text).not.toContain('BAKED_REGISTRY');
      expect(text).not.toContain('built-in roadmap');
      expect(text).not.toContain('built-in lesson links');
    }
  });
});

describe('(f) status line when the roadmap file is unreachable', () => {
  const MISSING = 'Live roadmap refresh failed; some lesson links may be missing. Reload to try again.';
  const FALSE_CLAIM = /still work|built-in/;

  it('roadmap rejects, Supabase answers, no saved copy: says links may be missing and keeps saying it', async () => {
    const desk = bootSandbox({ roadmap: 'reject', supabase: 'ok' });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe(MISSING);
    expect(desk.status.textContent).not.toMatch(FALSE_CLAIM);
    expect(desk.status.hidden).toBe(false);
    // Supabase still supplied what it has.
    expect(desk.registry().lessons['1.1'].urls.worksheet).toBe(SUPABASE_URL_ROWS[0].worksheet_url);
  });

  it('roadmap and Supabase both reject, no saved copy: nothing claims the links work', async () => {
    const desk = bootSandbox({ roadmap: 'reject', supabase: 'reject' });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe(MISSING);
    expect(desk.status.textContent).not.toMatch(FALSE_CLAIM);
    expect(desk.registry()).toEqual({ lessons: {} });
  });

  it('offline, roadmap and Supabase reject, no saved copy: says the links will load later', async () => {
    const desk = bootSandbox({ roadmap: 'reject', supabase: 'reject', online: false });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe('Offline: lesson links will load when the network returns.');
    expect(desk.status.textContent).not.toMatch(FALSE_CLAIM);
  });

  it('roadmap rejects with a saved copy: uses the last saved roadmap, as before', async () => {
    const desk = bootSandbox({ saved: savedCopy(ROADMAP), roadmap: 'reject', supabase: 'ok' });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe('Using the last saved roadmap; live refresh is unavailable.');
    expect(Object.keys(desk.registry().lessons).length).toBeGreaterThanOrEqual(Object.keys(ROADMAP.lessons).length);
  });

  it('a filled registry with Supabase down says lesson links still work (true: they come from the roadmap)', async () => {
    const desk = bootSandbox({ saved: savedCopy(ROADMAP), roadmap: 'reject', supabase: 'reject' });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe('Live Schoology sync unavailable; lesson links still work.');
  });

  it('roadmap answers: the status clears and the file is saved for the next first paint', async () => {
    const desk = bootSandbox({ roadmap: 'ok', supabase: 'ok' });
    await desk.run('loadRegistry()');
    expect(desk.status.textContent).toBe('');
    expect(desk.status.hidden).toBe(true);
    const saved = JSON.parse(desk.store.get(CACHE_KEY));
    expect(saved.data.lessons).toEqual(ROADMAP.lessons);
  });
});
