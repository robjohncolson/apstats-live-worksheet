#!/usr/bin/env node
/**
 * wire-frq-graded-note.mjs — W2.6 rollout to every u*_lesson*_live.html.
 *
 * Why (2026-09-09): the hourly auto-grader grades saved-but-ungraded written answers
 * overnight. A student then saw a lower lesson grade with NO explanation on the
 * worksheet — the hydrate path restored the E/P/I colour but dropped the feedback and
 * said nothing about WHEN or HOW the grade was applied ("my grade was at like 98").
 *
 * What: inside hydratePriorAnswers(), the W2.4/W2.5 block now (1) carries the stored
 * feedback into gradingState and (2) appends a visible note under the textarea:
 * "Graded <date> from your saved answer: P — <feedback>. Revise and press Grade with AI
 * (it only raises)." Adds the _markAutoGraded helper next to _markRestored.
 *
 * Idempotent (MARKER), EOL-preserving, pattern-guarded to ^u\d+_lesson.+_live\.html$.
 *   node scripts/wire-frq-graded-note.mjs            # dry run (report only)
 *   node scripts/wire-frq-graded-note.mjs --apply    # write
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const MARKER = '// W2.6: carry the stored feedback';

const FROM_LF = `                            // W2.5: rebuild gradingState so a post-reload edit clears the stale grade.
                            if (typeof gradingState !== 'undefined' && gradingState && typeof gradingState.set === 'function') {
                                gradingState.set(ta.id, { result: { score: gradeClass, feedback: '' }, originalAnswer: v, appealCount: 0, history: [] });
                            }
                        }
                    }
                    _markRestored(ta);`;

const TO_LF = `                            // W2.5: rebuild gradingState so a post-reload edit clears the stale grade.
                            // W2.6: carry the stored feedback (the hourly auto-grader saves it now) and
                            // say WHEN the grade was applied to the saved answer — an overnight grade
                            // with no explanation is what "my grade dropped" looked like to students.
                            var storedFb = (entry.result && typeof entry.result.feedback === 'string') ? entry.result.feedback : '';
                            if (typeof gradingState !== 'undefined' && gradingState && typeof gradingState.set === 'function') {
                                gradingState.set(ta.id, { result: { score: gradeClass, feedback: storedFb }, originalAnswer: v, appealCount: 0, history: [] });
                            }
                            _markAutoGraded(ta, gradeClass, storedFb, entry.gradedAt, entry.result && entry.result.provider);
                        }
                    }
                    _markRestored(ta);`;

const HELPER_ANCHOR_LF = `        function _markRestored(el) {`;
const HELPER_LF = `        // W2.6: a grade restored from the ledger gets a plain-language note (date, grader,
        // grade, feedback, what to do). Dedup per textarea. The note removes itself the
        // moment the student edits the answer or the grade class changes (a regrade), so it
        // can never contradict the live grade. Never throws; never blocks.
        function _markAutoGraded(ta, gradeClass, feedback, gradedAt, provider) {
            try {
                if (!ta || !ta.parentNode) return;
                if (ta.parentNode.querySelector('.frq-graded-note[data-for="' + ta.id + '"]')) return;
                var when = '';
                try { if (gradedAt) when = new Date(gradedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) {}
                var words = { E: 'E (full credit)', P: 'P (partial)', I: 'I (not yet)' };
                var note = document.createElement('div');
                note.className = 'frq-graded-note';
                note.setAttribute('data-for', ta.id);
                note.setAttribute('role', 'status');
                note.style.cssText = 'margin:4px 0 8px;padding:6px 8px;font-size:0.85em;line-height:1.35;' +
                                     'background:#f4f6fb;border-left:3px solid ' + (gradeClass === 'E' ? '#2a7' : gradeClass === 'P' ? '#d9b800' : '#c33') + ';' +
                                     'color:#333;border-radius:0 4px 4px 0;';
                var head = document.createElement('strong');
                var sweep = provider === 'ai-batch' || provider === 'teacher';   // graded from the SAVED answer, not in-session
                var who = provider === 'ai-batch' ? 'Auto-graded' : provider === 'teacher' ? 'Graded by your teacher' : 'Graded';
                head.textContent = who + (when ? ' ' + when : '') + (sweep ? ' from your saved answer' : '') + ': ' + (words[gradeClass] || gradeClass);
                note.appendChild(head);
                if (feedback) {
                    var fb = document.createElement('div');
                    fb.textContent = feedback;
                    note.appendChild(fb);
                }
                if (gradeClass !== 'E') {
                    var tip = document.createElement('div');
                    tip.style.cssText = 'margin-top:3px;color:#555;';
                    tip.textContent = 'Revise your answer, then press Grade with AI — regrading only ever raises your score.';
                    note.appendChild(tip);
                }
                var after = ta.nextSibling;
                if (after && after.nodeType === 1 && after.className === 'restored-badge') after = after.nextSibling;
                ta.parentNode.insertBefore(note, after);
                // Self-removal: an edit (W2.2 clears the grade) or a grade-class change (regrade)
                // makes the note stale — drop it. Other class changes (restored badge) are ignored.
                var gradedOf = function () { var m = /graded-[EPI]/.exec(ta.className || ''); return m ? m[0] : ''; };
                var startGrade = gradedOf();
                var obs = null;
                var remove = function () {
                    try { if (note.parentNode) note.parentNode.removeChild(note); } catch (_) {}
                    try { if (obs) obs.disconnect(); } catch (_) {}
                };
                ta.addEventListener('input', remove, { once: true });
                try {
                    if (typeof MutationObserver === 'function') {
                        obs = new MutationObserver(function () { if (gradedOf() !== startGrade) remove(); });
                        obs.observe(ta, { attributes: true, attributeFilter: ['class'] });
                    }
                } catch (_) {}
            } catch (_) {}
        }
`;

function count(haystack, needle) {
  let c = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
  return c;
}

const files = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();
let changed = 0, skipped = 0, failed = 0;
for (const f of files) {
  const path = resolve(ROOT, f);
  const html = readFileSync(path, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const conv = (s) => (eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s);
  if (html.includes(MARKER)) { skipped++; continue; }
  const from = conv(FROM_LF), to = conv(TO_LF), anchor = conv(HELPER_ANCHOR_LF), helper = conv(HELPER_LF);
  if (count(html, from) !== 1 || count(html, anchor) !== 1) {
    failed++;
    console.error(`  ${f}: anchor mismatch (block=${count(html, from)}, helper anchor=${count(html, anchor)})`);
    continue;
  }
  const out = html.replace(from, to).replace(anchor, helper + anchor);
  if (APPLY) writeFileSync(path, out, 'utf8');
  changed++;
}
console.log(`${APPLY ? 'applied' : 'dry-run'}: ${changed} changed, ${skipped} already wired, ${failed} failed (of ${files.length})`);
process.exit(failed ? 1 : 0);
