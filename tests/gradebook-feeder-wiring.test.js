/**
 * tests/gradebook-feeder-wiring.test.js  (DN2a)
 *
 * Closed-loop proof for the worksheet → gradebookClient.record → /ledger/record
 * → item_ledger → /donow loop, guarding the ONE named integration risk
 * (DESK_DONOW_SPEC.md §3): "the manifest's item_ids MUST match exactly what the
 * feeders record into item_ledger". If the wired worksheet ever emits an itemId
 * that is not a skill-map / work-manifest key, /donow's remaining-math breaks and
 * this test goes red.
 *
 * Strategy: load each wired pilot worksheet in jsdom with the REAL
 * roster_config.js + roster-client.js + gradebook-client.js, seed a roster
 * session, intercept window.fetch, then invoke the REAL wired helper functions
 * (recordBlankToGradebook / recordReflectionToGradebook — global because the
 * worksheet inline <script> is a classic, un-IIFE'd script) and assert the
 * exact POST body + that every emitted itemId ∈ skill-map ∩ work-manifest.
 *
 * Complements tests/audit-feeder-ids.test.js (which proves runtime ids ==
 * skill-map). This proves the wiring actually emits those ids, verbatim, in the
 * CONTRACT-3 body shape, and that they reach /donow's vocabulary.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { JSDOM, ResourceLoader } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');
const ROSTER_URL = 'https://roster-production-12c1.up.railway.app';

const SKILL_MAP = JSON.parse(readFileSync(resolve(ROOT, 'data/skill-map.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'data/work-manifest.json'), 'utf8'));

// Flatten every itemId the work-manifest expects — this is exactly the
// vocabulary GET /donow matches student ledger rows against (donow.js).
const MANIFEST_IDS = new Set();
for (const u of MANIFEST.units || []) {
  for (const l of u.lessons || []) {
    for (const a of l.activities || []) {
      for (const id of a.itemIds || []) MANIFEST_IDS.add(id);
    }
  }
  if (u.pc) for (const id of u.pc.itemIds || []) MANIFEST_IDS.add(id);
}

// railway_config.js / railway_client.js live in the worksheet's PARENT dir at
// deploy time; they are not in this repo. Stub them so jsdom doesn't error —
// the gradebook feeder path is fully independent of railway.
class LocalLoader extends ResourceLoader {
  fetch(url, options) {
    if (url.includes('railway_config.js') || url.includes('railway_client.js')) {
      return Promise.resolve(Buffer.from('/* railway not present in test repo */'));
    }
    return super.fetch(url, options);
  }
}

async function loadWorksheet(file) {
  const htmlPath = resolve(ROOT, file);
  const html = readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, {
    url: pathToFileURL(htmlPath).href, // file:// so relative <script src> load from disk
    runScripts: 'dangerously',
    resources: new LocalLoader(),
    pretendToBeVisual: true,
  });
  await new Promise((r) => {
    if (dom.window.document.readyState === 'complete') return r();
    dom.window.addEventListener('load', r);
    setTimeout(r, 3000); // safety net
  });
  return dom;
}

// Replace window.fetch with a capturing stub that mimics /ledger/record 200.
function captureFetch(win) {
  const calls = [];
  win.fetch = (url, options) => {
    calls.push({ url: String(url), options: options || {} });
    return Promise.resolve({
      ok: true,
      json: async () => ({ ok: true, ledgerId: 'LEDGER-TEST', evidenceTier: 'practice' }),
    });
  };
  return calls;
}

// jsdom gives file:// an opaque origin → no Storage. roster-client.js reads a
// bare global `localStorage`; install an in-memory shim it resolves to.
function installLocalStorage(win) {
  const store = new Map();
  Object.defineProperty(win, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

function seedRoster(win, token = 'TEST-TOKEN') {
  win.localStorage.setItem(
    'apstats_roster.v1',
    JSON.stringify({ studentId: 'stu-test', username: 'tester', token })
  );
}

const PILOTS = [
  { file: 'u4_lesson1-2_live.html', unitId: 'U4L1-2', unit: 'U4' },
  { file: 'u8_lesson1_live.html', unitId: 'U8L1', unit: 'U8' },
];

for (const pilot of PILOTS) {
  describe(`DN2a feeder wiring — ${pilot.file}`, () => {
    let dom, win, raw;

    beforeAll(async () => {
      dom = await loadWorksheet(pilot.file);
      win = dom.window;
      installLocalStorage(win);
      raw = readFileSync(resolve(ROOT, pilot.file), 'utf8');
    });

    it('loads roster_config + roster-client + gradebook-client (scripts resolved)', () => {
      expect(win.ROSTER_SERVICE_URL).toBe(ROSTER_URL);
      expect(typeof win.rosterClient?.token).toBe('function');
      expect(typeof win.gradebookClient?.record).toBe('function');
    });

    it('the three feeder script tags are present in the canonical order', () => {
      const i1 = raw.indexOf('src="roster_config.js"');
      const i2 = raw.indexOf('src="roster-client.js"');
      const i3 = raw.indexOf('src="gradebook-client.js"');
      expect(i1).toBeGreaterThan(-1);
      expect(i2).toBeGreaterThan(i1);
      expect(i3).toBeGreaterThan(i2);
      // sibling paths — NOT ../ (railway is ../, roster/gradebook are repo-root)
      expect(raw).not.toContain('src="../roster_config.js"');
      expect(raw).not.toContain('src="../gradebook-client.js"');
    });

    it('hooks are wired at the right call sites', () => {
      // blank: immediately after the existing railway submit, in handleLiveUpdate
      expect(raw).toMatch(/sendAnswer\(blank\);\s*\n\s*recordBlankToGradebook\(blank\);/);
      // reflection: both finalization points in gradeAllReflections
      expect(raw).toContain("recordReflectionToGradebook(id, answer, 'E');");
      expect(raw).toContain('recordReflectionToGradebook(id, answer, result.score);');
    });

    it('BLANK feeder emits dataset.questionId VERBATIM as a skill-map ∩ manifest key', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      win.assignQuestionIds(); // idempotent; guarantees ids are stamped

      const blank = win.document.querySelector('.blank');
      expect(blank).toBeTruthy();
      blank.value = '  probability long-run  ';
      win.recordBlankToGradebook(blank);
      await new Promise((r) => setTimeout(r, 0));

      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record`);
      expect(rec).toBeTruthy();
      expect(rec.options.method).toBe('POST');
      // no proctor header is ever sent (decision L-C)
      expect(rec.options.headers || {}).not.toHaveProperty('x-proctor-secret');

      const body = JSON.parse(rec.options.body);
      const expectedId = blank.dataset.questionId;
      expect(expectedId).toMatch(new RegExp(`^WS-${pilot.unitId}-Q\\d+$`));
      expect(body.itemId).toBe(expectedId); // VERBATIM — the integration risk
      expect(body.source).toBe('worksheet');
      expect(body.response).toBe('probability long-run'); // trimmed value
      expect(body.unit).toBe(pilot.unit);
      expect(body.token).toBe('TEST-TOKEN');
      // topic/skill intentionally NOT sent (Phase-3 rollup resolves them)
      expect(body).not.toHaveProperty('topic');
      expect(body).not.toHaveProperty('skill');

      // LOOP CLOSURE: the emitted id is in /donow's vocabulary
      expect(SKILL_MAP).toHaveProperty(expectedId);
      expect(MANIFEST_IDS.has(expectedId)).toBe(true);
    });

    it('REFLECTION feeder emits WS-${UNIT_ID}-${textareaId} as a skill-map ∩ manifest key', async () => {
      seedRoster(win);
      const calls = captureFetch(win);

      for (const [textareaId, letter, score] of [
        ['reflect1', 'E', 1],
        ['reflect2', 'P', 0.5],
        ['exitTicket', 'I', 0],
      ]) {
        win.recordReflectionToGradebook(textareaId, 'a sufficiently long reflection answer', letter);
        await new Promise((r) => setTimeout(r, 0));

        const rec = calls.find(
          (c) =>
            c.url === `${ROSTER_URL}/ledger/record` &&
            JSON.parse(c.options.body).itemId === `WS-${pilot.unitId}-${textareaId}`
        );
        expect(rec, `${textareaId} record`).toBeTruthy();
        const body = JSON.parse(rec.options.body);
        const expectedId = `WS-${pilot.unitId}-${textareaId}`;

        expect(body.itemId).toBe(expectedId);
        expect(body.source).toBe('frq');
        expect(body.score).toBe(score); // E→1 / P→0.5 / I→0
        expect(body.unit).toBe(pilot.unit);
        expect(body).not.toHaveProperty('skill');

        expect(SKILL_MAP).toHaveProperty(expectedId);
        expect(MANIFEST_IDS.has(expectedId)).toBe(true);
      }
    });

    it('unknown reflection score → score field omitted (not 0)', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      win.recordReflectionToGradebook('reflect1', 'answer text here', 'X');
      await new Promise((r) => setTimeout(r, 0));
      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record`);
      expect(rec).toBeTruthy();
      expect(JSON.parse(rec.options.body)).not.toHaveProperty('score');
    });

    it('no roster identity → fire-and-forget no-op, ZERO network (decision L-D)', async () => {
      win.localStorage.removeItem('apstats_roster.v1');
      const calls = captureFetch(win);
      const blank = win.document.querySelector('.blank');
      blank.value = 'something';
      win.recordBlankToGradebook(blank);
      win.recordReflectionToGradebook('reflect1', 'answer text here', 'E');
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toHaveLength(0);
    });

    it('empty blank value → not recorded (no spurious ledger rows)', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      const blank = win.document.querySelector('.blank');
      blank.value = '   ';
      win.recordBlankToGradebook(blank);
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toHaveLength(0);
    });

    // Codex review finding (DN2a): prove the worksheet UX cannot break if
    // gradebook-client.js fails to load (404 / CDN miss). Helpers must no-op,
    // never throw into handleLiveUpdate/gradeAllReflections, never hit network.
    it('gradebook-client.js absent → helpers no-op safely, never throw, ZERO network', async () => {
      seedRoster(win); // identity present — proves the ABSENT CLIENT is what makes it safe
      const calls = captureFetch(win);
      const saved = win.gradebookClient;
      delete win.gradebookClient;
      try {
        const blank = win.document.querySelector('.blank');
        blank.value = 'an answer';
        expect(() => win.recordBlankToGradebook(blank)).not.toThrow();
        expect(() =>
          win.recordReflectionToGradebook('reflect1', 'a reflection answer', 'E')
        ).not.toThrow();
        await new Promise((r) => setTimeout(r, 0));
        expect(calls).toHaveLength(0);
      } finally {
        win.gradebookClient = saved; // restore — keep this test order-independent
      }
    });
  });
}
