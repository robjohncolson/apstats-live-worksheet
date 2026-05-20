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

  it('Phase 5.1: renders a parallel Progress-Check tutor button on each lesson tile', () => {
    // Per-unit PC tutor button alongside the per-lesson one. Uses the same
    // regex-captured unit number, so the XSS argument carries over.
    expect(DESK).toMatch(/copyTutorPromptPc\(/);
    expect(DESK).toMatch(/PC tutor/);
    // The PC button must use a distinct status span so its message doesn't
    // overwrite the lesson tutor's status.
    expect(DESK).toMatch(/id=["']ai-tutor-pc-status["']/);
  });

  it('Phase 5.1: PC button is rendered in the lesson-regex branch, AFTER the lesson button, with onclick=copyTutorPromptPc(_aitm[1]) only (Codex MINOR-2 fold)', () => {
    // Slice the if-block governing both buttons. The lesson regex match is
    // `var _aitm = /^(\d+)\.(\d+)$/.exec(inf.t || '');` followed by
    // `if (_aitm) { ... }`. We extract the if-body and assert layout/XSS.
    const guardIdx = DESK.indexOf("var _aitm = /^(\\d+)\\.(\\d+)$/.exec(inf.t || '');");
    expect(guardIdx, 'the inf.t regex guard must exist').toBeGreaterThan(0);
    const ifOpen = DESK.indexOf('if (_aitm) {', guardIdx);
    expect(ifOpen, 'the if (_aitm) block must follow the regex').toBeGreaterThan(0);
    // Walk forward to the matching closing brace at the same nesting level.
    // The block is short (two button-render lines + comments) — a 1500-char
    // window is more than enough and we close at the first line that begins
    // with a } at the same column as the if-open.
    const ifBody = DESK.slice(ifOpen, ifOpen + 1500);
    const closeIdx = ifBody.indexOf('\n        }');
    expect(closeIdx, 'the if (_aitm) block must close').toBeGreaterThan(0);
    const block = ifBody.slice(0, closeIdx);

    // Lesson button is FIRST, PC button is SECOND.
    const lessonCall = block.indexOf('copyTutorPrompt(');
    const pcCall = block.indexOf('copyTutorPromptPc(');
    expect(lessonCall, 'lesson onclick must appear inside the if-block').toBeGreaterThan(0);
    expect(pcCall, 'PC onclick must appear inside the if-block').toBeGreaterThan(0);
    expect(pcCall, 'PC button must come AFTER lesson button').toBeGreaterThan(lessonCall);

    // PC onclick takes ONLY _aitm[1] (XSS-safety: same regex-captured numeric
    // group as the lesson button). The onclick attribute is built via string
    // concatenation, so we look for the canonical pattern with no other
    // dynamic insertions between the open-paren and the close-paren.
    const pcOnclickMatch = block.match(/copyTutorPromptPc\(\\'\s*'\s*\+\s*([^)]+?)\s*\+\s*'\\'\)/);
    expect(pcOnclickMatch, 'PC onclick must use string-concat form with _aitm[1]').toBeTruthy();
    expect(pcOnclickMatch[1].trim()).toBe('_aitm[1]');
  });

  it('Phase 5.1: copyTutorPromptPc is an async helper fetching ai-tutor/u{N}_pc.md', () => {
    expect(DESK).toMatch(/async\s+function\s+copyTutorPromptPc\s*\(/);
    // The PC path construction must end with _pc.md, not _l{N}.md.
    const fnSlice = DESK.slice(DESK.indexOf('async function copyTutorPromptPc'));
    expect(fnSlice).toMatch(/['"`]ai-tutor\/u['"`]\s*\+/);
    expect(fnSlice).toMatch(/_pc\.md['"`]/);
  });

  it('declares copyTutorPrompt as an async function and fetches ai-tutor/u{N}_l{N}.md', () => {
    expect(DESK).toMatch(/async\s+function\s+copyTutorPrompt\s*\(/);
    // Path construction must use the lesson form.
    expect(DESK).toMatch(/['"`]ai-tutor\/u['"`]\s*\+/);
    expect(DESK).toMatch(/_l['"`]\s*\+/);
    expect(DESK).toMatch(/\.md['"`]/);
  });

  it('uses navigator.clipboard.writeText with a textarea fallback', () => {
    // Phase 5.1 refactored the clipboard logic into _copyTutorPromptByPath
    // (shared between lesson + PC buttons). The contract is unchanged: both
    // primary path + textarea fallback still exist.
    const fn = DESK.slice(DESK.indexOf('async function _copyTutorPromptByPath'));
    expect(fn).toMatch(/navigator\.clipboard\s*\.\s*writeText/);
    expect(fn).toMatch(/document\.execCommand\(['"]copy['"]\)/);
  });

  it('copyTutorPrompt soft-fails: outer body wrapped in try/catch (never throws)', () => {
    // Phase 5.1: the soft-fail / outer try/catch lives in
    // _copyTutorPromptByPath (the shared helper). Both copyTutorPrompt and
    // copyTutorPromptPc delegate to it, so the protection is shared.
    const start = DESK.indexOf('async function _copyTutorPromptByPath');
    expect(start, 'helper must exist').toBeGreaterThan(0);
    const fnSlice = DESK.slice(start, start + 2500);
    // Outer try AND outer catch (allow either catch (_) or catch (e)).
    expect(fnSlice).toMatch(/\btry\s*\{/);
    expect(fnSlice).toMatch(/\bcatch\s*\(\s*_?\w*\s*\)\s*\{/);
    // And the rejection path writes the "not available" status text — never
    // throws / logs uncaught.
    expect(fnSlice).toMatch(/Tutor prompt not available/);
  });

  it('Phase 5.1: lesson + PC functions are TRULY thin delegates to the shared helper (Codex MINOR-1 fold)', () => {
    // The Phase-5 contract is that the soft-fail / clipboard logic lives
    // EXACTLY ONCE — in _copyTutorPromptByPath. A regression that
    // re-inlined navigator.clipboard.writeText or document.execCommand
    // inside copyTutorPrompt or copyTutorPromptPc would let the two paths
    // silently desync (e.g., a Phase-5 fix not propagating to the PC
    // sibling). We prove THIN-ness by extracting each wrapper's body
    // and asserting (a) the body length is small and (b) the body
    // contains no clipboard / fetch / execCommand calls — only the
    // delegate.

    function bodyOf(declStart) {
      // The wrappers are short single-await functions. We slice from `{`
      // after the signature to the first top-level `}` (which is line-
      // start `}` for our formatting).
      const openBrace = DESK.indexOf('{', declStart);
      expect(openBrace).toBeGreaterThan(declStart);
      // Find the closing `}` at column 0 (top-level function close, given
      // the file's flat formatting of these helpers).
      const closeBrace = DESK.indexOf('\n}', openBrace);
      expect(closeBrace).toBeGreaterThan(openBrace);
      return DESK.slice(openBrace + 1, closeBrace);
    }

    const lessonStart = DESK.indexOf('async function copyTutorPrompt(unit, lesson)');
    expect(lessonStart).toBeGreaterThan(0);
    const lessonBody = bodyOf(lessonStart);

    const pcStart = DESK.indexOf('async function copyTutorPromptPc(unit)');
    expect(pcStart).toBeGreaterThan(0);
    const pcBody = bodyOf(pcStart);

    // Both bodies must delegate to the shared helper exactly once.
    expect(lessonBody.match(/_copyTutorPromptByPath\s*\(/g) || []).toHaveLength(1);
    expect(pcBody.match(/_copyTutorPromptByPath\s*\(/g) || []).toHaveLength(1);

    // Neither body may contain clipboard / fetch / fallback logic — that
    // ONLY lives in _copyTutorPromptByPath.
    for (const banned of [
      /\bnavigator\s*\.\s*clipboard\b/,
      /\bdocument\.execCommand\b/,
      /\bawait\s+fetch\b/,
      /Tutor prompt not available/,
    ]) {
      expect(lessonBody, `lesson wrapper must not inline ${banned}`).not.toMatch(banned);
      expect(pcBody, `PC wrapper must not inline ${banned}`).not.toMatch(banned);
    }

    // And each body must be short — guarding against a future edit that
    // bloats either wrapper. ~250 chars is generous (mine are ~140).
    expect(lessonBody.length).toBeLessThan(250);
    expect(pcBody.length).toBeLessThan(250);
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
    // itself and the onclick attribute. Use a word-boundary to exclude the
    // Phase-5.1 sibling `copyTutorPromptPc(` from this lesson-only count.
    const callSites = [...DESK.matchAll(/copyTutorPrompt\b\s*\(/g)];
    // Exactly: 1 in the function declaration, 1 in the onclick attr.
    expect(callSites.length).toBe(2);
  });

  it('Phase 5.1: copyTutorPromptPc has exactly 2 call sites (decl + onclick)', () => {
    const pcSites = [...DESK.matchAll(/copyTutorPromptPc\s*\(/g)];
    expect(pcSites.length).toBe(2);
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
