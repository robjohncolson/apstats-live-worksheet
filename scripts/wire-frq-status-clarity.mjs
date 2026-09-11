#!/usr/bin/env node
/**
 * wire-frq-status-clarity.mjs — W2.7 rollout to every u*_lesson*_live.html.
 *
 * Why (2026-09-11): the teacher saw, under one written response, BOTH the live server
 * verdict ("✓ Graded: Incorrect") AND the W2.6 restore note ("Graded: I (not yet)"),
 * read "(not yet)" as "not graded yet", pressed Grade with AI, got the toast
 * "no new credit this time" while the server was still grading, and concluded the
 * written work was never graded. Root causes were all wording/flow, not grading:
 *
 *   1. "I (not yet)" means "no credit yet" but reads as "ungraded".
 *   2. The restore note never went away when the live feedback card rendered the
 *      same grade (its self-removal only fires on a grade-class CHANGE), so two
 *      verdicts sat under one box.
 *   3. The note showed the grader's feedback but not the rubric elements still
 *      missing — the one thing a student needs to raise the grade.
 *   4. In server-authoritative mode Grade with AI only QUEUES the written responses
 *      (the server grades them seconds later) but the toast said nothing about it.
 *
 * What (4 string-anchored edits, all display-only, no grading/ledger change):
 *   E1  words map: I → 'I (no credit yet)'.
 *   E2  the note lists "Still missing: …" from the stored result, its tip says
 *       "Add the missing points…", and it removes itself as soon as the live
 *       feedback card (.ai-feedback) appears for the same textarea.
 *   E3  _aiGradeFrqs records how many written responses it sent to the server
 *       (window._aiFrqSentCount); both Grade-with-AI toasts append
 *       "· N written response(s) sent for grading — results appear under each box in ~10 s".
 *
 * Idempotent (MARKER), EOL-preserving, pattern-guarded to ^u\d+_lesson.+_live\.html$.
 *   node scripts/wire-frq-status-clarity.mjs            # dry run (report only)
 *   node scripts/wire-frq-status-clarity.mjs --apply    # write
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
export const MARKER = '// W2.7: frq status clarity';

// Each edit: [anchor (must occur exactly once), replacement]. LF-normalized.
export const EDITS = [
  // E1 — wording
  [
    `var words = { E: 'E (full credit)', P: 'P (partial)', I: 'I (not yet)' };`,
    `var words = { E: 'E (full credit)', P: 'P (partial)', I: 'I (no credit yet)' };   ${MARKER}`,
  ],
  // E2a — signature carries the stored "missing" list
  [
    `function _markAutoGraded(ta, gradeClass, feedback, gradedAt, provider) {`,
    `function _markAutoGraded(ta, gradeClass, feedback, gradedAt, provider, missing) {`,
  ],
  // E2b — call site passes it
  [
    `_markAutoGraded(ta, gradeClass, storedFb, entry.gradedAt, entry.result && entry.result.provider);`,
    `_markAutoGraded(ta, gradeClass, storedFb, entry.gradedAt, entry.result && entry.result.provider, entry.result && entry.result.missing);`,
  ],
  // E2c — "Still missing" line + actionable tip
  [
    `                if (gradeClass !== 'E') {
                    var tip = document.createElement('div');
                    tip.style.cssText = 'margin-top:3px;color:#555;';
                    tip.textContent = 'Revise your answer, then press Grade with AI — regrading only ever raises your score.';
                    note.appendChild(tip);
                }`,
    `                if (gradeClass !== 'E' && Array.isArray(missing) && missing.length) {
                    // W2.7: the rubric elements still missing are the only thing a student can act on.
                    var miss = document.createElement('div');
                    miss.style.cssText = 'margin-top:3px;';
                    miss.textContent = 'Still missing: ' + missing.map(function (m) { return String(m); }).join('; ');
                    note.appendChild(miss);
                }
                if (gradeClass !== 'E') {
                    var tip = document.createElement('div');
                    tip.style.cssText = 'margin-top:3px;color:#555;';
                    tip.textContent = 'Add the missing points above, then press Grade with AI — a regrade never lowers your score.';
                    note.appendChild(tip);
                }`,
  ],
  // E2d — the note yields to the live feedback card for the same box
  [
    `                ta.parentNode.insertBefore(note, after);
                // Self-removal: an edit (W2.2 clears the grade) or a grade-class change (regrade)
                // makes the note stale — drop it. Other class changes (restored badge) are ignored.`,
    `                ta.parentNode.insertBefore(note, after);
                // W2.7: one verdict per box — when the live feedback card (.ai-feedback, rendered by
                // showFeedback on the server's verdict) appears for this textarea, this note is
                // redundant and could disagree with it, so it removes itself.
                try {
                    var liveHost = document.getElementById(ta.id + '-feedback');
                    if (liveHost) {
                        if (liveHost.querySelector('.ai-feedback')) { note.parentNode.removeChild(note); return; }
                        if (typeof MutationObserver === 'function') {
                            var liveObs = new MutationObserver(function () {
                                if (liveHost.querySelector('.ai-feedback')) {
                                    try { if (note.parentNode) note.parentNode.removeChild(note); } catch (_) {}
                                    try { liveObs.disconnect(); } catch (_) {}
                                }
                            });
                            liveObs.observe(liveHost, { childList: true, subtree: true });
                        }
                    }
                } catch (_) {}
                // Self-removal: an edit (W2.2 clears the grade) or a grade-class change (regrade)
                // makes the note stale — drop it. Other class changes (restored badge) are ignored.`,
  ],
  // E3a — count what was sent to the server
  [
    `                    await _aiRequestAllFrqGrades(!!manual);
                    return 0;`,
    `                    window._aiFrqSentCount = await _aiRequestAllFrqGrades(!!manual);   // W2.7: surfaced in the toast
                    return 0;`,
  ],
  // E3b — reset before the FRQ pass
  [
    `                    try { frqUpgraded = (await _aiGradeFrqs(manual)) || 0; } catch (_) {}`,
    `                    window._aiFrqSentCount = 0;
                    try { frqUpgraded = (await _aiGradeFrqs(manual)) || 0; } catch (_) {}
                    // W2.7: in server-authoritative mode the written responses were SENT, not graded here —
                    // say so, or "no new credit" reads as "your writing was skipped".
                    var _sentN = window._aiFrqSentCount || 0;
                    var _sentNote = _sentN > 0
                        ? ' · ' + _sentN + ' written response' + (_sentN > 1 ? 's' : '') + ' sent for grading — results appear under each box in ~10 s'
                        : '';`,
  ],
  // E3c — both toasts carry it
  [
    `_aiToast('✨ AI ' + parts.join(' and ') + scorePart);`,
    `_aiToast('✨ AI ' + parts.join(' and ') + scorePart + _sentNote);`,
  ],
  [
    `_aiToast('✨ AI check complete — no new credit this time.');`,
    `_aiToast('✨ AI check complete — no new credit this time.' + _sentNote);`,
  ],
];

export function applyEdits(src) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let lf = src.replace(/\r\n/g, '\n');
  if (lf.includes(MARKER)) return { changed: false, reason: 'already applied', out: src };
  for (const [from, to] of EDITS) {
    const first = lf.indexOf(from);
    if (first < 0) return { changed: false, reason: 'anchor missing: ' + from.slice(0, 60), out: src };
    if (lf.indexOf(from, first + 1) >= 0) return { changed: false, reason: 'anchor not unique: ' + from.slice(0, 60), out: src };
    lf = lf.slice(0, first) + to + lf.slice(first + from.length);
  }
  return { changed: true, reason: 'ok', out: eol === '\n' ? lf : lf.replace(/\n/g, '\r\n') };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();
  let changed = 0, skipped = 0, failed = 0;
  for (const f of files) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    const r = applyEdits(src);
    if (r.changed) {
      changed++;
      if (APPLY) writeFileSync(resolve(ROOT, f), r.out);
      console.log((APPLY ? 'WROTE   ' : 'WOULD   ') + f);
    } else if (r.reason === 'already applied') {
      skipped++;
    } else {
      failed++;
      console.log('FAILED  ' + f + ' — ' + r.reason);
    }
  }
  console.log(`${APPLY ? 'applied' : 'dry run'}: ${changed} changed, ${skipped} already applied, ${failed} failed of ${files.length}`);
  if (failed) process.exit(1);
}
