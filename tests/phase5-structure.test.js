// phase5-structure.test.js — Phase 5 structure + jargon-ban guard.
// Asserts the Desk AI-tutor copy button is wired, start-here has the new
// AI-tutor section, study_guide_diagnostic.html loads the §6.4 shared
// clients and stamps student_id on both /api/ai/grade call sites, and the
// graded-FRQ path fires a gradebookClient.record('frq_studyguide', ...).
// Also asserts all 75 ai-tutor/u{u}_{l{N},pc}.md artifacts exist.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const startHerePath = resolve(repo, 'start-here.html');
const sgPath = resolve(repo, 'study_guide_diagnostic.html');
const tutorDir = resolve(repo, 'ai-tutor');

const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;
const START = existsSync(startHerePath) ? readFileSync(startHerePath, 'utf8') : null;
const SG = existsSync(sgPath) ? readFileSync(sgPath, 'utf8') : null;

// Same banned vocabulary as phase4 — the new AI-tutor card on start-here.html
// is also student-facing, so it must respect the §3 jargon ban.
const STUDENT_JARGON = [
  /\bBKT\b/i,
  /\btheta\b/i,
  /θ/,
  /\bpKnow\b/i,
  /\bposterior\b/i,
  /\bBayesian\b/i,
  /\bmastery probability\b/i,
  /\bweak skill\b/i,
];

// Extract the new "Your AI tutor" card block from start-here.html so the
// jargon ban scans ONLY the new card, not the whole page (the page has the
// untouched Unit-4 "Probability" mention in "You've already started" which
// is allowed pre-existing content).
function extractAiTutorCard(html) {
  const start = html.indexOf('Your AI tutor');
  expect(start, 'AI tutor card must exist on start-here.html').toBeGreaterThan(0);
  // Walk back to the enclosing <div class="tool"> opening tag.
  const cardStart = html.lastIndexOf('<div class="tool"', start);
  expect(cardStart, 'AI tutor card must be inside a <div class="tool">').toBeGreaterThan(0);
  // Walk forward to the matching </div> — the card is a flat single-level div.
  const cardEnd = html.indexOf('</div>', start);
  expect(cardEnd, 'AI tutor card must close').toBeGreaterThan(cardStart);
  return html.slice(cardStart, cardEnd + '</div>'.length);
}

// ── ap_stats_roadmap_square_mode.html — Desk AI-tutor copy button ────────────
describe('ap_stats_roadmap_square_mode.html — Phase 5 AI-tutor wiring', () => {
  it('the Desk file exists', () => {
    expect(DESK, 'Desk file must exist at repo root').toBeTypeOf('string');
  });

  it('renders an AI-tutor copy button inside showResourcePanel', () => {
    // The button-render snippet uses the inf.t topic regex to derive unit/lesson.
    expect(DESK).toMatch(/copyTutorPrompt\(/);
    expect(DESK).toMatch(/Tutor prompt/);
    // The button must be inside the showResourcePanel branch that emits lessonHtml.
    const panelIdx = DESK.indexOf('function showResourcePanel');
    const btnIdx = DESK.indexOf('copyTutorPrompt');
    expect(panelIdx).toBeGreaterThan(0);
    expect(btnIdx).toBeGreaterThan(panelIdx);
    // The button-render path must extract (unit, lesson) from inf.t via dot-form regex.
    expect(DESK).toMatch(/\/\^\(\\d\+\)\\\.\(\\d\+\)\$\//);
  });

  it('declares copyTutorPrompt as an async function and fetches ai-tutor/u{N}_l{N}.md', () => {
    expect(DESK).toMatch(/async\s+function\s+copyTutorPrompt\s*\(/);
    // Path construction must use the lesson form.
    expect(DESK).toMatch(/['"`]ai-tutor\/u['"`]\s*\+/);
    expect(DESK).toMatch(/_l['"`]\s*\+/);
    expect(DESK).toMatch(/\.md['"`]/);
  });

  it('uses navigator.clipboard.writeText with a textarea fallback', () => {
    const fn = DESK.slice(DESK.indexOf('async function copyTutorPrompt'));
    expect(fn).toMatch(/navigator\.clipboard\s*\.\s*writeText/);
    expect(fn).toMatch(/document\.execCommand\(['"]copy['"]\)/);
  });

  it('copyTutorPrompt soft-fails: outer body wrapped in try/catch (never throws)', () => {
    // Slice the body of copyTutorPrompt and prove the entire async path is
    // protected. Without this, a 404 or a clipboard rejection could unhandled-
    // reject and surface in the browser console.
    const start = DESK.indexOf('async function copyTutorPrompt');
    expect(start).toBeGreaterThan(0);
    // Match up to the next top-level closing `}` followed by a newline +
    // top-level code (the next function decl or major block). A tighter slice
    // suffices — assert outer try/catch exists between fn-open and fn-end.
    const fnSlice = DESK.slice(start, start + 2500);
    // Outer try AND outer catch (allow either catch (_) or catch (e)).
    expect(fnSlice).toMatch(/\btry\s*\{/);
    expect(fnSlice).toMatch(/\bcatch\s*\(\s*_?\w*\s*\)\s*\{/);
    // And the rejection path writes the "not available" status text — never
    // throws / logs uncaught.
    expect(fnSlice).toMatch(/Tutor prompt not available/);
  });

  it('renders a status span with id="ai-tutor-status" for click feedback', () => {
    expect(DESK).toMatch(/id=["']ai-tutor-status["']/);
  });

  it('onclick path interpolates ONLY regex-captured digits — no raw inf.t', () => {
    // Locate the AI-tutor lessonHtml render line and prove the onclick is
    // built from _aitm[1] / _aitm[2] (the regex capture groups), NOT from
    // raw inf.t (which would be an XSS surface if a topic ever contained a
    // quote/backslash).
    const renderIdx = DESK.indexOf('onclick="copyTutorPrompt(');
    expect(renderIdx).toBeGreaterThan(0);
    const renderSlice = DESK.slice(renderIdx, renderIdx + 200);
    expect(renderSlice).toMatch(/_aitm\[1\]/);
    expect(renderSlice).toMatch(/_aitm\[2\]/);
    expect(renderSlice).not.toMatch(/\binf\.t\b/);
  });

  it('the existing rosterClient sign-in (DN2c) is NOT disturbed', () => {
    // Smoke that prior integration survives — sanity, not breadth.
    expect(DESK).toMatch(/window\.rosterClient/);
    expect(DESK).toMatch(/rosterClient\.signIn/);
  });

  it('never silently runs copyTutorPrompt on render — only on click', () => {
    // The render-time call would be a bare `copyTutorPrompt(` call site
    // outside an onclick=/event listener context. Allow the function decl
    // itself, the onclick attribute, and the closure inside listeners.
    const callSites = [...DESK.matchAll(/copyTutorPrompt\s*\(/g)];
    // Exactly: 1 in the function declaration, 1 in the onclick attr.
    expect(callSites.length).toBe(2);
  });
});

// ── start-here.html — new "Your AI tutor" card ───────────────────────────────
describe('start-here.html — Phase 5 AI-tutor card', () => {
  it('the file exists', () => {
    expect(START, 'start-here.html must exist at repo root').toBeTypeOf('string');
  });

  it('has the new "Your AI tutor" card', () => {
    expect(START).toMatch(/Your AI tutor/);
    expect(START).toMatch(/copy-to-clipboard/);
  });

  it('Phase 4a "Where you stand" section survives unchanged', () => {
    // Both id and the existing render-script entry point must remain.
    expect(START).toMatch(/id=["']where-you-stand["']/);
    expect(START).toMatch(/rosterClient\s*\.\s*token/);
  });

  it('the AI-tutor card contains NO BKT/θ/probability vocabulary (§3 student guard)', () => {
    const card = extractAiTutorCard(START);
    for (const pat of STUDENT_JARGON) {
      expect(card, `student-facing jargon "${pat}" must not appear in the AI-tutor card`).not.toMatch(pat);
    }
  });

  it('AI-tutor card sits inside the "Your toolkit" section, before the closing footer', () => {
    // "Your toolkit" is the section heading; the new card must appear AFTER it
    // and BEFORE the page footer (closing </section> then <footer>).
    // Note: "TI-84 Trainer" appears earlier in the file too (in the summer
    // on-ramp section at L345) — only `lastIndexOf` returns the toolkit-card
    // occurrence; use range checks instead.
    const toolkitIdx = START.indexOf('Your toolkit');
    const cardIdx = START.indexOf('Your AI tutor');
    const footerIdx = START.indexOf('<footer');
    expect(toolkitIdx, 'Your toolkit heading must exist').toBeGreaterThan(0);
    expect(cardIdx, 'Your AI tutor card must appear after the toolkit heading').toBeGreaterThan(toolkitIdx);
    expect(footerIdx, '<footer> must exist').toBeGreaterThan(0);
    expect(cardIdx, 'Your AI tutor card must appear before the page footer').toBeLessThan(footerIdx);
  });
});

// ── study_guide_diagnostic.html — §6.4 adoption ──────────────────────────────
describe('study_guide_diagnostic.html — Phase 5 §6.4 adoption', () => {
  it('the file exists', () => {
    expect(SG, 'study_guide_diagnostic.html must exist at repo root').toBeTypeOf('string');
  });

  it('loads roster_config.js + roster-client.js + gradebook-client.js, in order', () => {
    const cfg = SG.indexOf('roster_config.js');
    const cli = SG.indexOf('roster-client.js');
    const gb = SG.indexOf('gradebook-client.js');
    expect(cfg).toBeGreaterThan(0);
    expect(cli).toBeGreaterThan(cfg); // config must load BEFORE client
    expect(gb).toBeGreaterThan(cli);   // gradebook-client requires rosterClient
  });

  it('both /api/ai/grade call sites include student_id in the body', () => {
    const calls = [...SG.matchAll(/\/api\/ai\/grade[\s\S]{0,600}?student_id/g)];
    expect(calls.length, 'both /api/ai/grade fetches must stamp student_id').toBe(2);
  });

  it('student_id is read via window.rosterClient.studentId()', () => {
    expect(SG).toMatch(/window\.rosterClient\s*&&\s*typeof\s+window\.rosterClient\.studentId/);
  });

  it('graded-FRQ path fires a fire-and-forget gradebookClient.record({ source: "frq_studyguide", ... })', () => {
    expect(SG).toMatch(/window\.gradebookClient\s*\.\s*record/);
    expect(SG).toMatch(/source\s*:\s*['"]frq_studyguide['"]/);
  });

  it('the new record call is wrapped in try/catch AND chains .catch on the returned promise', () => {
    // Slice from the source: 'frq_studyguide' marker outward so we test the
    // exact new call site (not the unrelated railwayClient.submitAnswer block).
    const sourceIdx = SG.indexOf("source:'frq_studyguide'");
    const sourceIdxAlt = SG.indexOf('source: "frq_studyguide"');
    const recordIdx = sourceIdx >= 0 ? sourceIdx : sourceIdxAlt;
    expect(recordIdx, 'gradebookClient.record call site must exist').toBeGreaterThan(0);
    // Look backward up to ~400 chars for the enclosing try { … and forward
    // up to ~400 chars for the matching catch + .catch promise drop.
    const before = SG.slice(Math.max(0, recordIdx - 400), recordIdx);
    const after = SG.slice(recordIdx, recordIdx + 600);
    expect(before, 'record call must be inside a try { ... }').toMatch(/try\s*\{/);
    expect(after, 'record call must close with catch (...){}').toMatch(/\}\s*catch\s*(?:\(\s*\w*\s*\))?\s*\{/);
    expect(after, 'record promise must be chained with .catch(() => {})').toMatch(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/);
  });

  it('focus-synthesis (non-graded) does NOT call gradebookClient.record (no item_ledger pollution)', () => {
    // The /api/ai/grade with topic 'AP Statistics Diagnostic Focus Synthesis'
    // is the focus-synthesis call. Slice from there to the next function or
    // the next /api/ai/grade and confirm no gradebookClient.record appears.
    const focusStart = SG.indexOf('Diagnostic Focus Synthesis');
    expect(focusStart).toBeGreaterThan(0);
    const focusEnd = SG.indexOf('function ', focusStart);
    const focusBlock = SG.slice(focusStart, focusEnd > 0 ? focusEnd : SG.length);
    expect(focusBlock).not.toMatch(/gradebookClient\s*\.\s*record/);
  });

  it('gradebookClient.record uses gateId(unit) as itemId (canonical study-guide question id)', () => {
    expect(SG).toMatch(/itemId\s*:\s*gateId\s*\(\s*unit\s*\)/);
  });
});

// ── ai-tutor artifacts inventory ─────────────────────────────────────────────
// Exact-set enumeration per AI_TUTOR_FANOUT_BUILD.md (inventory verified vs
// curriculum.js 2026-05-18). A missing-but-replaced artifact would slip past
// a count-only check; we require set equality + the canonical header.
const EXPECTED_ARTIFACTS = (() => {
  const list = [];
  const lessons = {
    1: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    2: [2, 3, 4, 5, 6, 7, 8, 9],
    3: [2, 3, 4, 5, 6, 7],
    4: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    5: [2, 3, 4, 5, 7, 8], // no L1, no L6
    6: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    7: [2, 3, 4, 5, 6, 7, 8, 9],
    8: [2, 3, 4, 5, 6],
    9: [2, 4, 5], // no L1, no L3
  };
  for (const u of Object.keys(lessons)) {
    for (const l of lessons[u]) list.push(`u${u}_l${l}.md`);
    list.push(`u${u}_pc.md`);
  }
  return list.sort();
})();

// Canonical full header line per AI_TUTOR_U1_BUILD.md / FANOUT.md §1.
// Lesson form: <!-- AI Tutor · AP Stats Topic {u}.{L} · generated from ...
// PC form:     <!-- AI Tutor · AP Stats Unit {u} Progress Check · ...
function expectedHeaderPrefixFor(filename) {
  const mLesson = /^u(\d+)_l(\d+)\.md$/.exec(filename);
  const mPc = /^u(\d+)_pc\.md$/.exec(filename);
  if (mLesson) {
    return `<!-- AI Tutor · AP Stats Topic ${mLesson[1]}.${mLesson[2]} ·`;
  }
  if (mPc) {
    return `<!-- AI Tutor · AP Stats Unit ${mPc[1]} Progress Check ·`;
  }
  return null;
}

describe('ai-tutor/ artifact inventory — exact 75-file set', () => {
  it('the ai-tutor directory exists', () => {
    expect(existsSync(tutorDir), 'ai-tutor/ directory must exist').toBe(true);
  });

  it('count is exactly 75 (the inventory baseline)', () => {
    const files = readdirSync(tutorDir).filter(f => f.endsWith('.md'));
    expect(files.length).toBe(75);
  });

  it('the set on disk matches the AI_TUTOR_FANOUT_BUILD.md inventory EXACTLY', () => {
    const onDisk = readdirSync(tutorDir).filter(f => f.endsWith('.md')).sort();
    // Equality check — neither a missing nor an extra file is acceptable.
    expect(onDisk).toEqual(EXPECTED_ARTIFACTS);
  });

  it('every artifact starts with the canonical AI Tutor header marker (topic-aware)', () => {
    const files = readdirSync(tutorDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const text = readFileSync(resolve(tutorDir, f), 'utf8');
      const expected = expectedHeaderPrefixFor(f);
      expect(expected, `${f} must match the lesson or PC naming convention`).not.toBeNull();
      // Allow any trailing header text after the prefix (generator inserts
      // the source path), but the lesson/PC anchor + topic id must be exact.
      expect(
        text.startsWith(expected),
        `${f} header must start with: ${expected}`
      ).toBe(true);
    }
  });
});
