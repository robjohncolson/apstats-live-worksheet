/**
 * tests/gradebook-feeder-wiring.test.js  (DN2a + DN2b)
 *
 * Closed-loop proof for worksheet → gradebookClient.record → /ledger/record →
 * item_ledger → /donow, guarding the named integration risk (DESK_DONOW_SPEC §3):
 * the manifest's item_ids MUST match exactly what the feeders record.
 *
 *  - STRUCTURAL SWEEP (all 69): every worksheet carries the 3 feeder script
 *    tags, the form-agnostic helper block, and all three hook call sites; the
 *    old DN2a UNIT_ID-only helper is gone everywhere; one consistent EOL.
 *  - FUNCTIONAL DEEP PROOF (representative): loads the real roster/gradebook
 *    clients in jsdom and invokes the REAL wired helpers, asserting the emitted
 *    itemId is verbatim (blanks) / <WS-prefix>-<id> (reflections), is in
 *    skill-map ∩ work-manifest, CONTRACT-3 body, identity-gated, absent-safe.
 *    Covers BOTH id-declaration forms: UNIT_ID (u4/u8) and WORKSHEET_ID (u3).
 *
 * Complements tests/audit-feeder-ids.test.js (runtime ids == skill-map) and
 * tests/work-manifest.test.js (manifest == skill-map keys).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { JSDOM, ResourceLoader } from 'jsdom';

const ROOT = resolve(import.meta.dirname, '..');
const ROSTER_URL = 'https://roster-production-12c1.up.railway.app';

const SKILL_MAP = JSON.parse(readFileSync(resolve(ROOT, 'data/skill-map.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'data/work-manifest.json'), 'utf8'));
const MANIFEST_IDS = new Set();
for (const u of MANIFEST.units || []) {
  for (const l of u.lessons || []) for (const a of l.activities || []) for (const id of a.itemIds || []) MANIFEST_IDS.add(id);
  if (u.pc) for (const id of u.pc.itemIds || []) MANIFEST_IDS.add(id);
}

const WORKSHEETS = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

// ─── Structural sweep — every worksheet, no jsdom (fast) ─────────────────────
describe('DN2b: all-69 structural wiring sweep', () => {
  it(`audits exactly 69 worksheets`, () => {
    expect(WORKSHEETS.length).toBe(69);
  });

  for (const f of WORKSHEETS) {
    it(`${f}: feeder fully wired, form-agnostic, single-EOL`, () => {
      const h = readFileSync(resolve(ROOT, f), 'utf8');

      // 3 feeder script tags, correct order, sibling paths (not ../)
      const i1 = h.indexOf('src="roster_config.js"');
      const i2 = h.indexOf('src="roster-client.js"');
      const i3 = h.indexOf('src="gradebook-client.js"');
      expect(i1, 'roster_config.js tag').toBeGreaterThan(-1);
      expect(i2).toBeGreaterThan(i1);
      expect(i3).toBeGreaterThan(i2);
      expect(h).not.toContain('src="../roster_config.js"');
      expect(h).not.toContain('src="../gradebook-client.js"');

      // form-agnostic helper block (NOT the old DN2a UNIT_ID-only one)
      expect(h).toContain('function gbWsPrefix');
      expect(h).toContain('function recordBlankToGradebook');
      expect(h).toContain('function recordReflectionToGradebook');
      expect(h, 'old DN2a helper must be gone').not.toContain('function unitFromItemId');

      // hook call sites. recordBlankToGradebook(blank) now has TWO call sites:
      // the live blur/Enter feeder (handleLiveUpdate) AND the ledger heal
      // (healLocalAnswersToLedger, LEDGER_HEAL_BUILD.md, wired by
      // scripts/wire-ledger-heal.mjs). The reflection hooks remain single sites.
      const blankCalls = (h.match(/recordBlankToGradebook\(blank\);/g) || []).length;
      const enrCalls = (h.match(/recordReflectionToGradebook\(id, answer, 'E'\)/g) || []).length;
      const normCalls = (h.match(/recordReflectionToGradebook\(id, answer, result\.score\)/g) || []).length;
      expect(blankCalls, 'recordBlankToGradebook(blank) call sites (feeder + heal)').toBe(2);
      expect(enrCalls, "recordReflectionToGradebook 'E' call count").toBe(1);
      expect(normCalls, 'recordReflectionToGradebook result.score call count').toBe(1);

      // placement: each hook call sits AFTER its containing function's
      // declaration (catches a misplaced/hoisted hook, esp. the bespoke
      // u3_lesson6-7 hand-patches). gradeAllReflections is last; helper defs
      // (which contain the def names, not these call signatures) sit before it.
      const hluIdx = h.indexOf('function handleLiveUpdate(blank) {');
      const garIdx = h.indexOf('async function gradeAllReflections() {');
      expect(hluIdx).toBeGreaterThan(-1);
      expect(garIdx).toBeGreaterThan(-1);
      expect(h.indexOf('recordBlankToGradebook(blank);'), 'blank hook inside handleLiveUpdate').toBeGreaterThan(hluIdx);
      expect(h.indexOf("recordReflectionToGradebook(id, answer, 'E')"), 'enriched hook inside gradeAllReflections').toBeGreaterThan(garIdx);
      expect(h.indexOf('recordReflectionToGradebook(id, answer, result.score)'), 'normal hook inside gradeAllReflections').toBeGreaterThan(garIdx);

      // single consistent EOL (no mixed CRLF/LF from the rollout)
      const crlf = (h.match(/\r\n/g) || []).length;
      const loneLf = (h.match(/(?<!\r)\n/g) || []).length;
      expect(crlf === 0 || loneLf === 0, `mixed EOL (crlf=${crlf}, lf=${loneLf})`).toBe(true);

      // never leaks topic/skill/proctor in the record() body (comments may mention them)
      expect(h).not.toContain('x-proctor-secret');
    });
  }
});

// ─── Functional deep proof — both id-declaration forms ───────────────────────
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
  const dom = new JSDOM(readFileSync(htmlPath, 'utf8'), {
    url: pathToFileURL(htmlPath).href,
    runScripts: 'dangerously',
    resources: new LocalLoader(),
    pretendToBeVisual: true,
  });
  // Poll the REAL readiness condition instead of a fixed 3s sleep. Under the full
  // parallel run the heavy worksheet scripts can take >3s, and the old
  // `setTimeout(r, 3000)` fallback then resolved on a not-yet-initialised window
  // — the "empty blank" flake. Ready = document complete AND the feeder global the
  // tests read (gradebookClient.record) is installed. Bounded well under the 10s
  // hook timeout, and resolves the instant the page is ready (usually well under 1s).
  const win = dom.window;
  const ready = () => win.document.readyState === 'complete'
    && typeof win.gradebookClient?.record === 'function';
  const deadline = Date.now() + 8000;
  while (!ready() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return dom;
}

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
      get length() { return store.size; },
    },
  });
}

const seedRoster = (win, token = 'TEST-TOKEN') =>
  win.localStorage.setItem('apstats_roster.v1', JSON.stringify({ studentId: 'stu-test', username: 'tester', token }));

function captureFetch(win) {
  const calls = [];
  win.fetch = (url, options) => {
    calls.push({ url: String(url), options: options || {} });
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, ledgerId: 'L-TEST', evidenceTier: 'practice' }) });
  };
  return calls;
}

// wsPrefix = what gbWsPrefix() returns: 'WS-'+UNIT_ID, or the WORKSHEET_ID value verbatim.
const FUNCTIONAL = [
  { file: 'u4_lesson1-2_live.html', form: 'UNIT_ID', wsPrefix: 'WS-U4L1-2', unit: 'U4', reflections: ['reflect1', 'reflect2', 'exitTicket'] },
  { file: 'u8_lesson1_live.html', form: 'UNIT_ID', wsPrefix: 'WS-U8L1', unit: 'U8', reflections: ['reflect1', 'reflect2', 'exitTicket'] },
  { file: 'u3_lesson6-7_live.html', form: 'WORKSHEET_ID', wsPrefix: 'WS-U3L6-7', unit: 'U3', reflections: ['reflect53', 'reflect54a', 'reflect55'] },
];

for (const cfg of FUNCTIONAL) {
  describe(`DN2 feeder functional — ${cfg.file} [${cfg.form}]`, () => {
    let win, raw;

    beforeAll(async () => {
      const dom = await loadWorksheet(cfg.file);
      win = dom.window;
      installLocalStorage(win);
      raw = readFileSync(resolve(ROOT, cfg.file), 'utf8');
    });

    it('real roster + gradebook clients loaded', () => {
      expect(win.ROSTER_SERVICE_URL).toBe(ROSTER_URL);
      expect(typeof win.gradebookClient?.record).toBe('function');
      expect(typeof win.recordBlankToGradebook).toBe('function');
      expect(typeof win.recordReflectionToGradebook).toBe('function');
    });

    it('BLANK feeder emits dataset.questionId VERBATIM ∈ skill-map ∩ manifest', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      win.assignQuestionIds();
      const blank = win.document.querySelector('.blank');
      blank.value = '  a real answer  ';
      win.recordBlankToGradebook(blank);
      await new Promise((r) => setTimeout(r, 0));

      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record`);
      expect(rec).toBeTruthy();
      expect((rec.options.headers || {})).not.toHaveProperty('x-proctor-secret');
      const body = JSON.parse(rec.options.body);
      const expectedId = blank.dataset.questionId;
      expect(expectedId).toBe(`${cfg.wsPrefix}-Q1`);
      expect(body.itemId).toBe(expectedId); // VERBATIM
      expect(body.source).toBe('worksheet');
      expect(body.response).toBe('a real answer');
      expect(body.unit).toBe(cfg.unit);
      expect(body).not.toHaveProperty('topic');
      expect(body).not.toHaveProperty('skill');
      expect(SKILL_MAP).toHaveProperty(expectedId);
      expect(MANIFEST_IDS.has(expectedId)).toBe(true);
    });

    it('REFLECTION feeder emits <WS-prefix>-<id> ∈ skill-map ∩ manifest (form-agnostic)', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      for (const [tid, letter, score] of [
        [cfg.reflections[0], 'E', 1],
        [cfg.reflections[1], 'P', 0.5],
        [cfg.reflections[2], 'I', 0],
      ]) {
        win.recordReflectionToGradebook(tid, 'a sufficiently long reflection answer', letter);
        await new Promise((r) => setTimeout(r, 0));
        const expectedId = `${cfg.wsPrefix}-${tid}`;
        const rec = calls.find(
          (c) => c.url === `${ROSTER_URL}/ledger/record` && JSON.parse(c.options.body).itemId === expectedId
        );
        expect(rec, `${tid} → ${expectedId}`).toBeTruthy();
        const body = JSON.parse(rec.options.body);
        expect(body.source).toBe('frq');
        expect(body.score).toBe(score);
        expect(body.unit).toBe(cfg.unit);
        expect(body).not.toHaveProperty('skill');
        expect(body).not.toHaveProperty('topic');
        expect(SKILL_MAP).toHaveProperty(expectedId);
        expect(MANIFEST_IDS.has(expectedId)).toBe(true);
      }
    });

    it('uncoercible reflection score → no record, console.error logged (W3.2 Case 3)', async () => {
      // W3.2: an uncoercible non-null verdict (e.g. 'X' -- no E/P/I letter) must NOT
      // silently record score:undefined. It must log a console.error and skip the write.
      seedRoster(win);
      const calls = captureFetch(win);
      const errors = [];
      const origError = win.console.error;
      win.console.error = (...args) => errors.push(args);
      win.recordReflectionToGradebook(cfg.reflections[0], 'answer text here', 'X');
      await new Promise((r) => setTimeout(r, 0));
      win.console.error = origError;
      // Scope to THIS reflection's itemId: a background ledger heal (the new
      // healLocalAnswersToLedger) may re-record an UNRELATED blank, which must
      // not be mistaken for "the bad verdict got recorded."
      const badId = `${cfg.wsPrefix}-${cfg.reflections[0]}`;
      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record` && JSON.parse(c.options.body).itemId === badId);
      expect(rec, 'no record should be written for an uncoercible verdict').toBeUndefined();
      expect(errors.length, 'console.error should be called once').toBeGreaterThan(0);
    });

    it('null reflection verdict (AI returned no score) → no record, console.error (W3.2 graded sink)', async () => {
      // The graded path passes result.score; a malformed AI response makes it
      // null. recordReflectionToGradebook must NOT silently record that as a
      // no-score row -- it must console.error and skip the write.
      seedRoster(win);
      const calls = captureFetch(win);
      const errors = [];
      const origError = win.console.error;
      win.console.error = (...args) => errors.push(args);
      win.recordReflectionToGradebook(cfg.reflections[0], 'answer text here', null);
      await new Promise((r) => setTimeout(r, 0));
      win.console.error = origError;
      // Scope to THIS reflection's itemId (see uncoercible test above — the
      // background ledger heal may re-record an unrelated blank).
      const badId = `${cfg.wsPrefix}-${cfg.reflections[0]}`;
      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record` && JSON.parse(c.options.body).itemId === badId);
      expect(rec, 'no record for a null verdict').toBeUndefined();
      expect(errors.length, 'console.error called for a null verdict').toBeGreaterThan(0);
    });

    it('recordReflectionDraft records an frq draft with no score (W3.2 draft sink)', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      win.recordReflectionDraft(cfg.reflections[0], 'an in-progress draft answer');
      await new Promise((r) => setTimeout(r, 0));
      const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record`);
      expect(rec, 'the draft is recorded').toBeTruthy();
      const body = JSON.parse(rec.options.body);
      expect(body.source).toBe('frq');
      expect(body).not.toHaveProperty('score');
      expect(body.response).toBe('an in-progress draft answer');
    });

    it('no roster identity → fire-and-forget no-op, ZERO network', async () => {
      win.localStorage.removeItem('apstats_roster.v1');
      const calls = captureFetch(win);
      const blank = win.document.querySelector('.blank');
      blank.value = 'x';
      win.recordBlankToGradebook(blank);
      win.recordReflectionToGradebook(cfg.reflections[0], 'an answer', 'E');
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toHaveLength(0);
    });

    it('empty blank → not recorded', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      const blank = win.document.querySelector('.blank');
      blank.value = '   ';
      win.recordBlankToGradebook(blank);
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toHaveLength(0);
    });

    it('gradebook-client.js absent → no-op, never throws, ZERO network', async () => {
      seedRoster(win);
      const calls = captureFetch(win);
      const saved = win.gradebookClient;
      delete win.gradebookClient;
      try {
        const blank = win.document.querySelector('.blank');
        blank.value = 'an answer';
        expect(() => win.recordBlankToGradebook(blank)).not.toThrow();
        expect(() => win.recordReflectionToGradebook(cfg.reflections[0], 'an answer', 'E')).not.toThrow();
        await new Promise((r) => setTimeout(r, 0));
        expect(calls).toHaveLength(0);
      } finally {
        win.gradebookClient = saved;
      }
    });
  });
}

// ─── Bespoke proof: u3_lesson6-7 manual hook EXECUTES from its real call site ─
// Codex DN2b finding: prove the hand-patched hook is reachable, not just
// present. Drives the REAL handleLiveUpdate (different submit arch: getUsername
// gate + sendAnswer(username,id,val).then(); recordBlankToGradebook is the last
// statement) and asserts the ledger write actually fires.
describe('DN2b: u3_lesson6-7 bespoke blank hook executes from real handleLiveUpdate', () => {
  let win;
  beforeAll(async () => {
    const dom = await loadWorksheet('u3_lesson6-7_live.html');
    win = dom.window;
    installLocalStorage(win);
    seedRoster(win);
  });

  it('handleLiveUpdate(blank) → recordBlankToGradebook → POST /ledger/record', async () => {
    const u =
      win.document.getElementById('worksheetUsername') || win.document.getElementById('studentName');
    expect(u, 'username field for getUsername() gate').toBeTruthy();
    u.value = 'testuser';
    if (typeof win.assignQuestionIds === 'function') win.assignQuestionIds();
    const blank = win.document.querySelector('.blank');
    expect(blank).toBeTruthy();
    blank.value = 'a real answer';

    const calls = captureFetch(win); // stubs every fetch (railway submit + ledger)
    win.handleLiveUpdate(blank); // the REAL bespoke-patched call site
    await new Promise((r) => setTimeout(r, 30));

    const rec = calls.find((c) => c.url === `${ROSTER_URL}/ledger/record`);
    expect(rec, 'ledger write fired from real handleLiveUpdate').toBeTruthy();
    const body = JSON.parse(rec.options.body);
    expect(body.itemId).toBe(blank.dataset.questionId);
    expect(body.itemId).toMatch(/^WS-U3L6-7-Q\d+$/);
    expect(body.source).toBe('worksheet');
    expect(body).not.toHaveProperty('topic');
    expect(SKILL_MAP).toHaveProperty(body.itemId);
    expect(MANIFEST_IDS.has(body.itemId)).toBe(true);
  });
});
