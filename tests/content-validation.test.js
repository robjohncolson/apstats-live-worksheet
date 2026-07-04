// content-validation.test.js — TYPECHECK_HARDENING_SPEC.md §5 / P3: author-time
// validators for generated + authored content, run as tests (no new runtime).
//
// Four domains, each calibrated against the REAL corpus (measured 2026-07-04):
//   1. Deck files (77 *_blooket.csv): structural checks are STRICT (0 violations
//      today); character sanity uses a math-symbol whitelist (19 decks legitimately
//      carry μ/σ/√/≥/…, so §5's literal "ASCII-only" is calibrated to "no garbage");
//      correct-position balance is a RATCHET (19 decks are historically 100%
//      position-1 — harmless because Blooket AND flashcards.js shuffle at play —
//      but new decks must not grow the imbalanced set).
//   2. Deck RESOLUTION (the §5 "promote to a permanent guard" item): every roadmap
//      topic resolves through the REAL csvPathFromWorksheet to an existing,
//      parseable deck — the exact check that once caught the missing u3_l6_l7 deck
//      and the U4 alias gaps as one-off session work. Orphan CSVs are pinned so a
//      misnamed new deck can't silently fail to resolve.
//   3. Rubrics (69 in-scope ai-grading-prompts*.js — same scope as
//      grade-pipeline-w3-prompts.test.js): full structural validation of every
//      rubric entry, plus the missing §5 cross-check — every rubric key is a REAL
//      textarea id in the owning worksheet, and every reflection textarea has a
//      rubric (69/69 clean today; this makes it stay that way).
//   4. Generated data shapes: roadmap-data.json (shape only — Supabase lesson_urls
//      overrides it at runtime), data/blooket-difficulty.json (incl. tag→deck and
//      tag→question resolution: caught 2 live decks tagged only under alias
//      filenames + 25 dead tags for trimmed u4_l9 questions), data/skill-map.json
//      (the COMMITTED json — skill-map.js tests are CI-excluded for working-tree
//      reasons; this file is CI-safe).
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const REPO = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(REPO, f), 'utf8');
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

// The REAL deck engine — parsing/resolution must match what students run.
function loadFlashcards() {
  const win = {};
  runInContext(read('flashcards.js'), createContext({ window: win, Math, JSON }));
  return win.Flashcards;
}

let FC;
beforeAll(() => { FC = loadFlashcards(); });

const DECKS = readdirSync(REPO).filter((f) => /_blooket\.csv$/.test(f)).sort();
const WORKSHEETS = readdirSync(REPO).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

// Question rows only (numeric col 0); header/template rows are skipped, exactly
// like rowsToDeck does.
const questionRows = (rows) => rows.filter((r) => Number.isFinite(parseInt((r[0] || '').trim(), 10)));

// ── 1. Deck files ───────────────────────────────────────────────────────────────

describe('§5 decks — structural validity of all Blooket CSVs', () => {
  it('there are decks to validate (corpus present)', () => {
    expect(DECKS.length).toBeGreaterThanOrEqual(77);
  });

  it('every question row has ≥2 non-empty choices and exactly one in-range correct index pointing at a non-empty answer', () => {
    const problems = [];
    for (const f of DECKS) {
      for (const r of questionRows(FC.parseCsv(read(f)))) {
        const qnum = (r[0] || '').trim();
        const answers = [r[2], r[3], r[4], r[5]].map((a) => String(a == null ? '' : a).trim());
        const filled = answers.filter((a) => a !== '').length;
        if (filled < 2) problems.push(`${f} q${qnum}: only ${filled} non-empty choice(s)`);
        const correctRaw = String(r[7] == null ? '' : r[7]).trim();
        if (!/^[1-4]$/.test(correctRaw)) { problems.push(`${f} q${qnum}: correct column is "${correctRaw}" (need one integer 1-4)`); continue; }
        if (answers[Number(correctRaw) - 1] === '') problems.push(`${f} q${qnum}: correct index ${correctRaw} points at an empty answer`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every deck builds ≥1 playable card through the real engine', () => {
    for (const f of DECKS) {
      const deck = FC.rowsToDeck(FC.parseCsv(read(f)));
      expect(deck.length, `${f} builds an empty deck`).toBeGreaterThan(0);
    }
  });

  // §5 says "ASCII-only", but 19 decks legitimately carry stats-math glyphs
  // (μ, σ, √, ≥, em-dash, x̄, p̂ …). The calibrated intent: no CONTROL characters,
  // no U+FFFD mojibake, and nothing outside a deliberate whitelist — extending the
  // whitelist is an intentional act, not an accident.
  const MATH_OK = new Set([...'—–−·×≈≥≤≠∩√²³₁₂±°…÷μσΣπαβγχ' + '̂̄' + '‘’“”']);
  it('deck text is printable: no control chars, no U+FFFD, no characters outside the math whitelist', () => {
    const problems = [];
    for (const f of DECKS) {
      const text = read(f);
      for (const ch of new Set(text)) {
        const code = ch.codePointAt(0);
        if (ch === '\n' || ch === '\r' || ch === '\t') continue;
        if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) { problems.push(`${f}: control char U+${code.toString(16)}`); continue; }
        if (code === 0xfffd) { problems.push(`${f}: U+FFFD replacement char (mojibake)`); continue; }
        if (code > 0x7e && !MATH_OK.has(ch)) problems.push(`${f}: "${ch}" (U+${code.toString(16).toUpperCase()}) not in the math whitelist — add it deliberately if legitimate`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  // RATCHET, not a hard rule: these 24 legacy decks put >60% of correct answers in
  // one position (19 are 100% position-1). Harmless at play time — Blooket and
  // flashcards.js shuffle choices — but new decks must be authored balanced. The
  // set is pinned by FILENAME (shrink-only): fixing an old deck removes it here;
  // a NEW imbalanced deck cannot hide behind an old one being fixed (Codex review
  // of the count-only v1).
  const LEGACY_IMBALANCED = new Set([
    'u4_l1_l2_blooket.csv', 'u4_l6_blooket.csv', 'u4_l7_blooket.csv', 'u4_l7_l8_blooket.csv',
    'u4_l8_blooket.csv', 'u4_l9_blooket.csv', 'u4_l10_blooket.csv', 'u4_l10_l11_l12_blooket.csv',
    'u4_l10_l12_blooket.csv', 'u4_l11_blooket.csv', 'u4_l12_blooket.csv', 'u4_lesson6_blooket.csv',
    'u5_l1_blooket.csv', 'u5_l1_l2_blooket.csv', 'u5_l2_blooket.csv', 'u5_l3_blooket.csv',
    'u5_l4_blooket.csv', 'u5_l5_blooket.csv', 'u5_l6_blooket.csv', 'u5_l7_blooket.csv',
    'u5_l8_blooket.csv', 'u6_l1_l2_blooket.csv', 'u6_l3_blooket.csv', 'u6_l6_blooket.csv',
  ]);
  it('no NEW heavily-imbalanced deck (>60% one correct position) outside the pinned legacy set', () => {
    const offenders = [];
    for (const f of DECKS) {
      const counts = [0, 0, 0, 0];
      const rows = questionRows(FC.parseCsv(read(f)));
      for (const r of rows) {
        const c = parseInt(String(r[7] == null ? '' : r[7]).trim(), 10);
        if (c >= 1 && c <= 4) counts[c - 1] += 1;
      }
      if (rows.length >= 5 && Math.max(...counts) / rows.length > 0.6 && !LEGACY_IMBALANCED.has(f)) {
        offenders.push(f);
      }
    }
    expect(offenders, `new imbalanced deck(s): ${offenders.join(', ')}`).toEqual([]);
  });
});

// ── 2. Deck resolution — the promoted permanent guard ───────────────────────────

const roadmap = () => JSON.parse(read('roadmap-data.json'));

// CSVs no roadmap topic resolves to: superseded singles + alias-named combined
// decks, kept on disk deliberately. A NEW orphan almost always means a misnamed
// deck (the u3_l6_l7 / U4-alias failure class) — pin the known set.
const KNOWN_ORPHANS = new Set([
  'u4_l7_blooket.csv', 'u4_l8_blooket.csv', 'u4_l10_blooket.csv', 'u4_l11_blooket.csv',
  'u4_l12_blooket.csv', 'u4_l10_l11_l12_blooket.csv', 'u4_lesson6_blooket.csv',
  'u5_l1_blooket.csv', 'u5_l2_blooket.csv',
]);

describe('§5 deck resolution — every roadmap topic reaches a real, playable deck', () => {
  it('all roadmap topics with a blooket URL resolve through the REAL csvPathFromWorksheet to an existing CSV with ≥1 card', () => {
    const lessons = roadmap().lessons;
    const problems = [];
    const resolved = new Set();
    for (const [id, entry] of Object.entries(lessons)) {
      if (!entry || !entry.urls || !entry.urls.blooket) continue;
      const csv = FC.csvPathFromWorksheet(entry.urls.worksheet);
      if (!csv) { problems.push(`topic ${id}: worksheet URL "${entry.urls.worksheet}" does not derive a deck path`); continue; }
      resolved.add(csv);
      if (!existsSync(resolve(REPO, csv))) { problems.push(`topic ${id}: resolved deck ${csv} DOES NOT EXIST (the u3_l6_l7 failure class)`); continue; }
      const deck = FC.rowsToDeck(FC.parseCsv(read(csv)));
      if (!deck.length) problems.push(`topic ${id}: resolved deck ${csv} builds 0 cards`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
    expect(resolved.size).toBeGreaterThanOrEqual(60);   // 77 topics share combined decks
  });

  it('no NEW orphan decks: every CSV either resolves from some topic or is in the pinned legacy set', () => {
    const lessons = roadmap().lessons;
    const resolved = new Set();
    for (const entry of Object.values(lessons)) {
      if (!entry || !entry.urls || !entry.urls.blooket) continue;
      const csv = FC.csvPathFromWorksheet(entry.urls.worksheet);
      if (csv) resolved.add(csv);
    }
    const newOrphans = DECKS.filter((f) => !resolved.has(f) && !KNOWN_ORPHANS.has(f));
    expect(newOrphans, `unresolvable deck(s) — misnamed? ${newOrphans.join(', ')}`).toEqual([]);
  });
});

// ── 3. Rubrics — structure + worksheet cross-resolution ─────────────────────────

// Same scope as grade-pipeline-w3-prompts.test.js (the wire-script contract).
const RUBRIC_RE = /^ai-grading-prompts(-u[1-9].*|)\.js$/;
const RUBRIC_EXCLUDED = new Set([
  'ai-grading-prompts-edgar-u6.js',
  'ai-grading-prompts-mit6001.js',
  'ai-grading-prompts-mit6001-lec2.js',
  'ai-grading-prompts-study-guide.js',
]);
const RUBRIC_FILES = readdirSync(REPO).filter((f) => RUBRIC_RE.test(f) && !RUBRIC_EXCLUDED.has(f)).sort();

// Evaluate a rubric file and return its rubric map. Two authoring families exist:
// window.RUBRICS_U{u}L{l} / REFLECTION_RUBRICS* assignments, and top-level consts
// only reachable via the exported getRubric* (u5-l1-2 style) — the probe collects
// those. 37 files carry a UTF-8 BOM; strip before eval.
function loadRubrics(file) {
  const src = stripBom(read(file));
  const win = {};
  const collected = [];
  const m = src.match(/(?:const|var|let)\s+(REFLECTION_RUBRICS\w*|RUBRICS_\w+)\s*=/);
  const probe = m ? `\n;__collect(typeof ${m[1]} !== 'undefined' ? ${m[1]} : null);` : '';
  const ctx = createContext({ window: win, module: { exports: {} }, console, __collect: (o) => collected.push(o) });
  runInContext(src + probe, ctx);
  const out = {};
  for (const k of Object.keys(win)) {
    if (/^RUBRICS_|^REFLECTION_RUBRICS/.test(k)) Object.assign(out, win[k]);
  }
  for (const o of collected) if (o) Object.assign(out, o);
  return out;
}

describe('§5 rubrics — every in-scope grading-prompt file is structurally sound', () => {
  it('the in-scope set matches the wire-script contract (69 files)', () => {
    expect(RUBRIC_FILES.length).toBe(69);
  });

  it('every rubric entry has questionText, well-formed expectedElements with UNIQUE ids, scoringGuide E/P/I, commonMistakes, contextFromVideo', () => {
    const problems = [];
    for (const f of RUBRIC_FILES) {
      let rubrics;
      try { rubrics = loadRubrics(f); } catch (e) { problems.push(`${f}: eval failed — ${e.message}`); continue; }
      const keys = Object.keys(rubrics);
      if (!keys.length) { problems.push(`${f}: no rubric entries found`); continue; }
      for (const key of keys) {
        const r = rubrics[key] || {};
        const at = `${f}#${key}`;
        if (typeof r.questionText !== 'string' || r.questionText.length < 10) problems.push(`${at}: questionText missing/short`);
        if (!Array.isArray(r.expectedElements) || !r.expectedElements.length) { problems.push(`${at}: expectedElements missing/empty`); continue; }
        const ids = r.expectedElements.map((e) => e && e.id);
        for (const [i, e] of r.expectedElements.entries()) {
          if (!e || typeof e.id !== 'string' || !e.id) problems.push(`${at}: element[${i}] has no id`);
          if (!e || typeof e.description !== 'string' || !e.description) problems.push(`${at}: element[${i}] has no description`);
          if (!e || typeof e.required !== 'boolean') problems.push(`${at}: element[${i}].required is not boolean`);
        }
        if (new Set(ids).size !== ids.length) problems.push(`${at}: duplicate expectedElements ids [${ids.join(',')}]`);
        for (const g of ['E', 'P', 'I']) {
          if (!r.scoringGuide || typeof r.scoringGuide[g] !== 'string' || !r.scoringGuide[g]) problems.push(`${at}: scoringGuide.${g} missing`);
        }
        if (!Array.isArray(r.commonMistakes)) problems.push(`${at}: commonMistakes not an array`);
        if (typeof r.contextFromVideo !== 'string' || !r.contextFromVideo) problems.push(`${at}: contextFromVideo missing`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every rubric key is a real textarea id in its owning worksheet, and every static textarea resolves to a rubric (no silent ungraded boxes)', () => {
    const problems = [];
    for (const ws of WORKSHEETS) {
      const html = read(ws);
      const srcs = [...html.matchAll(/<script[^>]+src=["'](ai-grading-prompts[^"']*)["']/g)].map((m) => m[1]);
      if (!srcs.length) { problems.push(`${ws}: loads no grading-prompt file`); continue; }
      // Static DOM textarea ids (both quote styles); JS-template ids (appeal forms
      // built at runtime, `${...}`) are not static DOM and are excluded.
      const taIds = [...html.matchAll(/<textarea[^>]*\bid=["']([^"']+)["']/g)]
        .map((m) => m[1]).filter((id) => !id.includes('${'));
      const keys = new Set();
      for (const s of srcs) {
        if (!existsSync(resolve(REPO, s))) { problems.push(`${ws}: rubric file MISSING: ${s}`); continue; }
        try { Object.keys(loadRubrics(s)).forEach((k) => keys.add(k)); }
        catch (e) { problems.push(`${ws}: rubric ${s} eval failed — ${e.message}`); }
      }
      const dangling = [...keys].filter((k) => !taIds.includes(k));
      const ungraded = taIds.filter((id) => !keys.has(id));
      if (dangling.length) problems.push(`${ws}: rubric keys with NO textarea: [${dangling.join(',')}]`);
      if (ungraded.length) problems.push(`${ws}: textareas with NO rubric: [${ungraded.join(',')}]`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

// ── 4. Generated data shapes ─────────────────────────────────────────────────────

describe('§5 roadmap-data.json — baked registry shape (runtime-overridden by Supabase; validate shape, not liveness)', () => {
  it('has the expected top level and 77 well-shaped lessons', () => {
    const rd = roadmap();
    for (const k of ['generatedAt', 'registryVersion', 'lessons']) expect(rd, `missing top-level ${k}`).toHaveProperty(k);
    const lessons = rd.lessons;
    expect(Object.keys(lessons).length).toBeGreaterThanOrEqual(77);
    const problems = [];
    for (const [id, e] of Object.entries(lessons)) {
      if (!/^\d+\.[\d-]+$/.test(id)) problems.push(`lesson key "${id}" breaks the topic-id pattern`);
      if (!e || typeof e !== 'object') { problems.push(`${id}: not an object`); continue; }
      if (!(typeof e.topic === 'string' || e.topic === null)) problems.push(`${id}: topic must be string|null`);
      if (!e.urls || typeof e.urls !== 'object') { problems.push(`${id}: urls missing`); continue; }
      if (typeof e.urls.worksheet !== 'string' || !e.urls.worksheet) problems.push(`${id}: urls.worksheet missing (deck resolution + the Desk depend on it)`);
      if (typeof e.urls.blooket !== 'string' || !e.urls.blooket) problems.push(`${id}: urls.blooket missing`);
      if (!(typeof e.urls.quiz === 'string' || e.urls.quiz === null)) problems.push(`${id}: urls.quiz must be string|null`);
      if (!Array.isArray(e.urls.videos)) problems.push(`${id}: urls.videos must be an array`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

describe('§5 data/blooket-difficulty.json — tag coverage resolves to real decks and real questions', () => {
  const diff = () => JSON.parse(read('data/blooket-difficulty.json'));

  it('schema: version ≥ 2; every tag is {difficulty: easy|med|hard, rationale: non-empty}', () => {
    const d = diff();
    expect(d.version).toBeGreaterThanOrEqual(2);
    const problems = [];
    for (const [csv, qmap] of Object.entries(d.tags)) {
      for (const [q, t] of Object.entries(qmap)) {
        if (!t || !['easy', 'med', 'hard'].includes(t.difficulty)) problems.push(`${csv} q${q}: bad difficulty ${t && t.difficulty}`);
        if (!t || typeof t.rationale !== 'string' || !t.rationale.trim()) problems.push(`${csv} q${q}: empty rationale`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every tag key names an existing deck, and every tagged question EXISTS in that deck (no dead tags)', () => {
    const problems = [];
    for (const [csv, qmap] of Object.entries(diff().tags)) {
      if (!existsSync(resolve(REPO, csv))) { problems.push(`tags for nonexistent deck: ${csv}`); continue; }
      const qnums = new Set(questionRows(FC.parseCsv(read(csv))).map((r) => String(parseInt(r[0], 10))));
      for (const q of Object.keys(qmap)) {
        if (!qnums.has(q)) problems.push(`${csv}: dead tag q${q} (deck has ${qnums.size} questions)`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every roadmap-RESOLVED deck has difficulty tags (the alias-only-tagging hole: u4_l6 / u4_l10_l12 were live with zero tags)', () => {
    const d = diff();
    const untagged = [];
    for (const [id, e] of Object.entries(roadmap().lessons)) {
      if (!e || !e.urls || !e.urls.blooket) continue;
      const csv = FC.csvPathFromWorksheet(e.urls.worksheet);
      if (!csv || !existsSync(resolve(REPO, csv))) continue;   // the resolution suite owns that failure
      if (!d.tags[csv] || !Object.keys(d.tags[csv]).length) untagged.push(`topic ${id} → ${csv}`);
    }
    expect(untagged, untagged.join('\n')).toEqual([]);
  });
});

describe('§5 data/skill-map.json — committed skill-map schema (CI-safe: the .js twin is validated by CI-excluded suites)', () => {
  it('every entry is {skill: string|null, candidates[], confidence: number, provenance: known} under a known key family', () => {
    const map = JSON.parse(read('data/skill-map.json'));
    const entries = Object.entries(map);
    expect(entries.length).toBeGreaterThanOrEqual(3000);
    const PROVENANCE = new Set(['topic-inherit', 'formula-map', 'frq-xref', 'unresolved', 'ai-constrained', 'teacher']);
    const problems = [];
    for (const [key, e] of entries) {
      // three key families: U{n}-L…​ (curriculum items), WS-… (worksheet feeder ids),
      // u{n}-frq-… (lowercase FRQ aliases)
      if (!/^(U\d+-|WS-|u\d+-)/.test(key)) problems.push(`key "${key}" is outside the known key families`);
      if (!e || typeof e !== 'object') { problems.push(`${key}: not an object`); continue; }
      if (!(typeof e.skill === 'string' || e.skill === null)) problems.push(`${key}: skill must be string|null`);
      if (!Array.isArray(e.candidates)) problems.push(`${key}: candidates must be an array`);
      if (typeof e.confidence !== 'number' || !isFinite(e.confidence)) problems.push(`${key}: confidence must be a finite number`);
      if (!PROVENANCE.has(e.provenance)) problems.push(`${key}: unknown provenance "${e.provenance}"`);
    }
    expect(problems.slice(0, 20), problems.slice(0, 20).join('\n')).toEqual([]);
  });
});
