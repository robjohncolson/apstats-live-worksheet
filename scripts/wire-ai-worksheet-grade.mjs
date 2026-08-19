#!/usr/bin/env node
/**
 * wire-ai-worksheet-grade.mjs — AI_WORKSHEET_GRADING_BUILD.md rollout.
 *
 * Injects the AI worksheet-grading client flow (aiGradeWorksheet + helpers) and
 * a "✨ AI re-check" button into every live worksheet. The flow is a SECOND
 * layer on top of the verbatim check:
 *   - blanks whose answer MEANS the same as the key are upgraded to full credit
 *   - the FRQ section is re-graded E/P/I, UPGRADE-ONLY
 * It is anti-spam by design: ONE batched call for all blanks + hash dedup +
 * single-flight + the server's rate-limited gradingQueue. It NEVER downgrades:
 * the verbatim grade and the original FRQ grade are the floor. Soft-fails to the
 * verbatim grade if the AI server is down.
 *
 * Properties:
 *   - Targets ^u\d+_lesson.+_live\.html$ only (Edgar driller etc. excluded).
 *   - EOL-preserving (worksheets are CRLF; injected content matches the file).
 *   - Idempotent: the SENTINEL guards re-injection; re-running is a no-op.
 *   - Additive: appends a <script> before </body> and one button after the
 *     "Check Answers" button. Touches no existing worksheet code.
 *
 * Usage:
 *   node scripts/wire-ai-worksheet-grade.mjs                 # dry-run, ALL targets
 *   node scripts/wire-ai-worksheet-grade.mjs --apply         # write ALL targets
 *   node scripts/wire-ai-worksheet-grade.mjs u6_lesson1-2_live.html --apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const SENTINEL = 'AI_WORKSHEET_GRADING_WIRED';
export const TARGET_RE = /^u\d+_lesson.+_live\.html$/;

// The single "✨ Grade with AI" button (manual trigger) — replaces BOTH the old
// "AI re-check" and the legacy "Grade My Reflections" button. Inserted right
// after the worksheet's unique "Check Answers" button.
export const AI_BUTTON_LABEL = '&#10024; Grade with AI';
export const RECHECK_BUTTON =
  '<button class="btn-ai-recheck" onclick="aiGradeWorksheet({manual:true})" ' +
  'title="Grade everything with AI — accepts blanks that mean the same thing, grades + polishes your written answers, and only ever raises your grade">' +
  AI_BUTTON_LABEL + '</button>';

// ---------------------------------------------------------------------------
// The injected client flow. Self-contained IIFE. Reads the worksheet's existing
// globals (checkAnswer, gradeReflection, showFeedback, recordReflectionToGradebook,
// gradingState, gbUnitFromItemId, _wsReflectionTextareas, updateWorksheetCompletion,
// UNIT_ID/WORKSHEET_ID, window.gradebookClient, window.RAILWAY_SERVER_URL) — all
// defined in the earlier worksheet <script>, so they are in scope here.
// ---------------------------------------------------------------------------
export const INJECTED_JS = String.raw`        // ==================== AI WORKSHEET GRADING (semantic blanks + folded FRQ) ====================
        // ${SENTINEL} — AI_WORKSHEET_GRADING_BUILD.md.
        // A SECOND layer on top of the verbatim check. A blank whose answer MEANS
        // the same thing as the key is upgraded to FULL credit; the FRQ section is
        // re-graded E/P/I UPGRADE-ONLY. ONE batched call for all blanks + hash
        // dedup + single-flight = anti-spam. AI NEVER downgrades (verbatim grade +
        // original FRQ grade are the floor). Soft-fails to the verbatim grade.
        (function () {
            if (window.__aiWorksheetGradeWired) return;     // runtime idempotency
            window.__aiWorksheetGradeWired = true;

            // -- scenario: unit/lesson for framework grounding ----------------
            function _aiUnitLesson() {
                if (typeof UNIT_ID !== 'undefined' && UNIT_ID) return String(UNIT_ID);
                if (typeof WORKSHEET_ID !== 'undefined' && WORKSHEET_ID) return String(WORKSHEET_ID);
                return '';
            }
            function _aiFindLessonContext() {
                try {
                    for (var k in window) {
                        if (k.indexOf('LESSON_CONTEXT_') === 0 && typeof window[k] === 'string') return window[k];
                    }
                } catch (_) {}
                return '';
            }
            function _aiScenario() {
                var ul = _aiUnitLesson();
                var unit = null, lessons = [];
                var um = /(\d+)/.exec(ul);
                if (um) unit = parseInt(um[1], 10);
                var after = ul.replace(/^[^0-9]*\d+/, '');
                var lm = after.match(/\d+/g);
                if (lm) lessons = lm.map(function (n) { return parseInt(n, 10); });
                return {
                    topic: (document.title || 'AP Statistics worksheet'),
                    unitLesson: ul,
                    unit: (unit == null || isNaN(unit)) ? null : unit,
                    lessons: lessons,
                    lessonContext: _aiFindLessonContext()
                };
            }

            // -- per-blank question prose (a blank carries no question text).
            //    ~60 blanks across 12 worksheets live in tables / lists / concept
            //    boxes with NO .question ancestor; widen the host to a meaningful
            //    container (and, for a table cell, prepend the row + column labels)
            //    so the AI still gets usable context instead of a bare fragment.
            function _aiExtractQuestion(blank) {
                try {
                    var host = (blank.closest ? (blank.closest('.question')
                        || blank.closest('li, td, th, p, .concept-box, .model-box, .note-box, .step, .question-box')) : null)
                        || blank.parentElement;
                    if (!host) return '';
                    var prefix = '';
                    // Table cell: prepend the row's first cell + the column header so
                    // a numeric/short cell is self-describing (e.g. "Expected | A").
                    try {
                        var cell = blank.closest ? blank.closest('td, th') : null;
                        if (cell) {
                            var row = cell.closest ? cell.closest('tr') : null;
                            var rowLabel = row ? (row.querySelector('th, td') || {}).textContent : '';
                            var table = cell.closest ? cell.closest('table') : null;
                            var headRow = table ? table.querySelector('tr') : null;
                            var colLabel = '';
                            if (headRow && row) {
                                var cells = Array.prototype.slice.call(row.children);
                                var idx = cells.indexOf(cell);
                                var heads = Array.prototype.slice.call(headRow.children);
                                if (idx >= 0 && heads[idx]) colLabel = heads[idx].textContent || '';
                            }
                            var lbl = [String(rowLabel || '').trim(), String(colLabel || '').trim()]
                                .filter(Boolean).join(' / ');
                            if (lbl) prefix = '[' + lbl.replace(/\s+/g, ' ').slice(0, 80) + '] ';
                        }
                    } catch (_) {}
                    var clone = host.cloneNode(true);
                    clone.querySelectorAll('.save-indicator, .restored-badge, .ai-credit-badge, button, .aggregate-btn, .aggregate-trigger')
                        .forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
                    return (prefix + (clone.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 600);
                } catch (_) { return ''; }
            }

            var _AI_BLANK_SCORE = { correct: 1, partial: 0.5, incorrect: 0 };
            function _aiBlankScore(blank) {
                if (typeof checkAnswer !== 'function') return 0;
                var v = checkAnswer(blank);
                return (v in _AI_BLANK_SCORE) ? _AI_BLANK_SCORE[v] : 0;
            }

            function _aiReflectionTextareas() {
                if (typeof _wsReflectionTextareas === 'function') return _wsReflectionTextareas();
                return Array.prototype.slice.call(document.querySelectorAll('textarea[id]'));
            }

            // -- dedup key: every blank + FRQ answer --------------------------
            function _aiHash() {
                var parts = [];
                document.querySelectorAll('.blank').forEach(function (b) {
                    parts.push((b.dataset.questionId || '') + '=' + ((b.value || '').trim()));
                });
                _aiReflectionTextareas().forEach(function (t) {
                    parts.push((t.id || '') + '=' + ((t.value || '').trim()));
                });
                return parts.join('|');
            }

            // -- persisted ledger scores = the FLOOR (so a re-grade can never
            //    write BELOW what is already recorded, even after the student
            //    edits an FRQ — which clears gradingState). Self-fetch via the
            //    existing gradebookClient.fetchPrior; no-ops when not signed in.
            async function _aiFetchPriorScores() {
                try {
                    if (!window.gradebookClient || !window.gradebookClient.fetchPrior) return new Map();
                    var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                    if (!prefix) return new Map();
                    var m = await window.gradebookClient.fetchPrior(prefix);
                    return (m && typeof m.get === 'function') ? m : new Map();
                } catch (_) { return new Map(); }
            }
            function _aiLedgerRank(score) {
                if (score === 1) return 2;      // E
                if (score === 0.5) return 1;    // P
                if (score === 0) return 0;      // I
                return -1;                      // no recorded grade
            }

            // -- central FRQ floor: best rank ever recorded for an FRQ item this
            //    session, seeded from the ledger on load. The recordReflectionToGradebook
            //    wrap below consults this so NO FRQ record path (the new pass, the
            //    legacy "Grade My Reflections" button, or an appeal) can ever write
            //    BELOW the recorded grade. itemId = gbWsPrefix + '-' + textareaId.
            var _AI_FRQ_RANK = { I: 0, P: 1, E: 2 };
            var _aiFrqFloor = {};
            function _aiVerdictRank(scoreLetter) {
                var c = (scoreLetter == null) ? '' : String(scoreLetter).trim().charAt(0).toUpperCase();
                return (c in _AI_FRQ_RANK) ? _AI_FRQ_RANK[c] : undefined;
            }
            function _aiFrqItemId(taId) {
                var p = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                return p ? p + '-' + taId : null;
            }
            function _aiSeedFrqFloor(prior) {
                try {
                    if (!prior || typeof prior.get !== 'function') return;
                    _aiReflectionTextareas().forEach(function (ta) {
                        if (!ta || !ta.id) return;
                        var itemId = _aiFrqItemId(ta.id);
                        if (!itemId) return;
                        var led = prior.get(itemId);
                        if (!led) return;
                        var r = _aiLedgerRank(led.score);
                        if (r > (itemId in _aiFrqFloor ? _aiFrqFloor[itemId] : -1)) _aiFrqFloor[itemId] = r;
                    });
                } catch (_) {}
            }

            // -- apply AI credit to one blank: FORCE full credit (upgrade-only) -
            function _aiRecordBlankFull(blank) {
                if (!window.gradebookClient || !window.gradebookClient.record) return;
                var itemId = blank && blank.dataset ? blank.dataset.questionId : null;
                if (!itemId) return;
                var value = (blank.value || '').trim();
                if (!value) return;
                // Same source/itemId as the verbatim write (WS-...-Q{n}, source
                // 'worksheet') — latest-wins, so this 1.0 supersedes the verbatim
                // score. No new ledger source / no migration.
                window.gradebookClient.record({
                    source: 'worksheet', itemId: itemId,
                    unit: (typeof gbUnitFromItemId === 'function' ? gbUnitFromItemId(itemId) : undefined),
                    response: value, score: 1, attempt: 1
                });
            }
            // UI only: green class + the data-ai-credit flag (+ value) + badge.
            // NO ledger write — used both when the AI grants credit (paired with
            // _aiRecordBlankFull) and when restoring credit from the ledger.
            function _aiApplyCreditUi(blank, reason) {
                try {
                    blank.classList.remove('incorrect', 'partial');
                    blank.classList.add('correct');
                    blank.dataset.aiCredit = '1';
                    blank.dataset.aiCreditValue = (blank.value || '').trim();
                    var label = '✨ AI-accepted' + (reason ? ': ' + reason : '');
                    var sib = blank.nextSibling;
                    if (sib && sib.nodeType === 1 && sib.className === 'ai-credit-badge') {
                        sib.textContent = label; return;
                    }
                    if (!blank.parentNode) return;
                    var b = document.createElement('span');
                    b.className = 'ai-credit-badge';
                    b.textContent = label;
                    b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                        'font-size:0.75em;background:#e8f5e9;border:1px solid #66bb6a;' +
                        'border-radius:4px;color:#2e7d32;';
                    blank.parentNode.insertBefore(b, blank.nextSibling);
                } catch (_) {}
            }
            function _aiApplyBlankCredit(blank, reason) {
                _aiApplyCreditUi(blank, reason);
                _aiRecordBlankFull(blank);         // upgrade-only: writes score 1
            }
            // Re-assert AI greens after a verbatim "Check Answers" wipes them.
            // Drops the credit if the student edited the blank since it was earned.
            function _aiReassertCredits() {
                try {
                    document.querySelectorAll('.blank[data-ai-credit="1"]').forEach(function (b) {
                        var val = (b.value || '').trim();
                        if (val && val === (b.dataset.aiCreditValue || '')) {
                            b.classList.remove('incorrect', 'partial');
                            b.classList.add('correct');
                        } else {
                            delete b.dataset.aiCredit;
                            var sib = b.nextSibling;
                            if (sib && sib.nodeType === 1 && sib.className === 'ai-credit-badge' && sib.parentNode) {
                                sib.parentNode.removeChild(sib);
                            }
                        }
                    });
                } catch (_) {}
            }
            // After a RELOAD the DOM is fresh: hydration re-fills an AI-credited
            // blank from the ledger and checkAnswer repaints it RED (verbatim ≠
            // key), and the data-ai-credit flag is gone — so a stray blur would
            // clobber the persisted 1.0. Re-establish the AI-credit flag + green
            // from the ledger: a filled blank whose LEDGER score is 1 but whose
            // VERBATIM verdict is not 'correct' was AI-credited. No re-record —
            // the ledger already holds 1.0; this only restores the UI + the flag
            // that the recordBlankToGradebook wrap relies on.
            async function _aiRestoreBlankCredits() {
                try {
                    var prior = await _aiFetchPriorScores();
                    if (!prior || typeof prior.get !== 'function' || !prior.size) return;
                    document.querySelectorAll('.blank[data-question-id]').forEach(function (b) {
                        try {
                            if (b.dataset.aiCredit === '1') return;          // already flagged
                            var val = (b.value || '').trim();
                            if (!val) return;
                            var led = prior.get(b.dataset.questionId);
                            if (!led || led.score !== 1) return;             // ledger isn't full credit
                            if (String(led.response || '').trim() !== val) return; // value changed since
                            var verdict = (typeof checkAnswer === 'function') ? checkAnswer(b) : null;
                            if (verdict === 'correct') return;               // verbatim-correct, not AI credit
                            _aiApplyCreditUi(b, '');                         // restore green + flag, NO re-record
                        } catch (_) {}
                    });
                } catch (_) {}
            }

            // -- FRQ fold: re-grade ungraded/changed reflections, UPGRADE ONLY.
            //    The recordReflectionToGradebook wrap enforces the persisted
            //    ledger floor, so this can never write below the recorded grade
            //    even after an edit clears gradingState. Extra guards here:
            //    in-session floor, per-text dedup (no wasted re-calls), and — on
            //    the AUTO (Done) path — never PERSIST a fresh "I" for an FRQ the
            //    student never asked to grade (manual still records everything).
            function _aiRememberFrqText(taId, answer) {
                if (typeof gradingState === 'undefined' || !gradingState) return;
                var keep = gradingState.get(taId) || {};
                keep.originalAnswer = answer;          // so the next pass dedups
                gradingState.set(taId, keep);
            }
            // Returns the number of FRQs whose grade was RAISED (for the toast).
            // Uniform grader: most worksheets expose a global gradeReflection(id, text);
            // the inline-grader worksheets (u3_lesson6-7) expose a ReflectionGrader
            // instance instead — same call shape, same {score, feedback, matched, missing}.
            function _aiGraderFn() {
                if (typeof gradeReflection === 'function') return gradeReflection;
                try {
                    var inst = (typeof reflectionGrader !== 'undefined' && reflectionGrader) ? reflectionGrader
                        : (window.reflectionGrader || null);
                    if (inst && typeof inst.gradeReflection === 'function') return inst.gradeReflection.bind(inst);
                } catch (_) {}
                return null;
            }
            // -- BATCH grading (2026-08-19): one model call for all reflections
            //    (POST /api/ai/grade-batch) when the page's own prompt builder is
            //    discoverable — window.buildReflectionPrompt<SUFFIX> + LESSON_CONTEXT_<SUFFIX>
            //    + the 'topic' string inside the page's gradeReflection. Otherwise the
            //    per-item path below runs unchanged. Results are cached per (id, answer)
            //    and consumed by the per-item loop, so every guard stays in one place.
            function _aiBatchBits() {
                try {
                    if (!window.RAILWAY_SERVER_URL || typeof fetch !== 'function') return null;
                    var builderKey = null, ctxKey = null, topic = null;
                    var keys = Object.keys(window);
                    for (var i = 0; i < keys.length; i++) {
                        if (/^buildReflectionPrompt[A-Za-z0-9_]*$/.test(keys[i]) && typeof window[keys[i]] === 'function') { if (builderKey) return null; builderKey = keys[i]; }
                        if (/^LESSON_CONTEXT_[A-Za-z0-9_]+$/.test(keys[i])) { if (ctxKey) return null; ctxKey = keys[i]; }
                    }
                    if (!builderKey) return null;
                    if (typeof gradeReflection === 'function') {
                        var m = /topic:\s*'([^']*)'/.exec(String(gradeReflection));
                        if (m) topic = m[1];
                    }
                    if (!topic) return null;
                    return { builder: window[builderKey], lessonContext: ctxKey ? window[ctxKey] : undefined, topic: topic };
                } catch (_) { return null; }
            }
            var _aiBatchCache = {};   // id → { answer, result }
            async function _aiBatchGrade(items) {
                var bits = _aiBatchBits();
                if (!bits || !items || items.length < 2) return false;
                var payload = [];
                for (var i = 0; i < items.length; i++) {
                    var prompt = null;
                    try { prompt = bits.builder(items[i].id, items[i].answer); } catch (_) { prompt = null; }
                    if (!prompt) return false;   // any unbuildable prompt → per-item path for all
                    payload.push({ questionId: items[i].id, prompt: prompt, answer: items[i].answer });
                }
                try {
                    var r = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/grade-batch', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scenario: { topic: bits.topic, lessonContext: bits.lessonContext }, items: payload })
                    });
                    if (!r.ok) return false;
                    var j = await r.json();
                    var results = (j && j.results) || {};
                    var got = 0;
                    for (var k = 0; k < items.length; k++) {
                        var res = results[items[k].id];
                        if (res && !res.error && _aiVerdictRank(res.score) !== undefined) { _aiBatchCache[items[k].id] = { answer: items[k].answer, result: res }; got++; }
                    }
                    return got > 0;
                } catch (_) { return false; }
            }
            async function _aiGradeFrqs(manual) {
                if (!_aiGraderFn()) return 0;   // no grader available on this worksheet
                var refs = _aiReflectionTextareas();
                var gradable = refs.filter(function (ta) {
                    return ta && ta.id && (ta.value || '').trim().length >= 20;
                });
                if (!gradable.length) return 0;
                var prior = await _aiFetchPriorScores();             // the persisted floor
                _aiSeedFrqFloor(prior);
                var upgrades = 0;
                // Pre-pass: which of these actually need a grader call (same dedup
                // rule as the loop) → one batch call, results cached for the loop.
                var candidates = [];
                for (var c = 0; c < gradable.length; c++) {
                    var cta = gradable[c];
                    var cAnswer = (cta.value || '').trim();
                    var cPrev = (typeof gradingState !== 'undefined' && gradingState) ? gradingState.get(cta.id) : null;
                    if (cPrev && cPrev.result && cPrev.result.score && (cPrev.originalAnswer || '').trim() === cAnswer) continue;
                    candidates.push({ id: cta.id, answer: cAnswer });
                }
                if (candidates.length >= 2) {
                    for (var b = 0; b < candidates.length; b++) _aiShowWaiting(candidates[b].id);
                    try { await _aiBatchGrade(candidates); } catch (_) {}
                }
                for (var i = 0; i < gradable.length; i++) {
                    var ta = gradable[i];
                    var answer = (ta.value || '').trim();
                    var prev = (typeof gradingState !== 'undefined' && gradingState) ? gradingState.get(ta.id) : null;
                    // Dedup: already graded THIS exact answer → skip (no re-call).
                    if (prev && prev.result && prev.result.score && (prev.originalAnswer || '').trim() === answer) continue;
                    var itemId = _aiFrqItemId(ta.id);
                    // floor = max(in-session grade, persisted ledger grade).
                    var prevScore = (prev && prev.result && prev.result.score) ? prev.result.score : null;
                    var floor = (prevScore && _AI_FRQ_RANK[prevScore] !== undefined) ? _AI_FRQ_RANK[prevScore] : -1;
                    if (itemId && (itemId in _aiFrqFloor)) floor = Math.max(floor, _aiFrqFloor[itemId]);
                    _aiShowWaiting(ta.id);
                    try {
                        var cached = _aiBatchCache[ta.id];
                        var result = (cached && cached.answer === answer) ? cached.result : null;
                        if (cached) delete _aiBatchCache[ta.id];
                        if (!result) result = await _aiGradeWithRetry(ta.id, answer);
                        if (!result || !result.score) {
                            _aiRememberUngraded(ta.id, true);
                            _aiClearWaiting(ta.id, '⚠️ Couldn’t reach the grader — saved; it will be graded automatically (we retry, and a background check runs every hour).');
                            continue;
                        }
                        _aiClearWaiting(ta.id);
                        // Stale verdict: the student kept typing while we waited. Do not
                        // show or record a grade for text that no longer exists; a
                        // trailing pass will grade the current text.
                        if ((ta.value || '').trim() !== answer) { _aiClearWaiting(ta.id); _aiScheduleAutoGrade(1500); continue; }
                        _aiRememberUngraded(ta.id, false);
                        // The worksheet's "enriched pass" rule: a P with nothing
                        // missing is really an E.
                        if (result.score === 'P' && Array.isArray(result.missing) && result.missing.length === 0) {
                            result = Object.assign({}, result, { score: 'E', feedback: 'Nice work — you covered the key ideas.' });
                        }
                        // POLISH (manual only): a close-P answer gets rewritten into
                        // a full-credit E with the missing pieces highlighted for the
                        // student's notes — the old "Grade My Reflections" nicety,
                        // now folded into the one button. Only when E would actually
                        // raise the grade (floor below E) and the helpers exist.
                        if (manual && result.score === 'P' && floor < 2 &&
                            typeof fetchEnrichedAnswer === 'function' && typeof renderEnrichedPass === 'function') {
                            var matchedCount = (result.matched || []).length;
                            var missingCount = (result.missing || []).length;
                            var hitRate = (matchedCount + missingCount) > 0 ? matchedCount / (matchedCount + missingCount) : 0;
                            if (hitRate >= 0.3 && missingCount > 0) {
                                try {
                                    var enriched = await fetchEnrichedAnswer(ta.id, answer, result.missing);
                                    if (enriched && enriched.score === 'E' && enriched.suggestion) {
                                        if (typeof gradingState !== 'undefined' && gradingState) {
                                            gradingState.set(ta.id, {
                                                result: Object.assign({}, result, { score: 'E' }), originalAnswer: answer,
                                                appealCount: prev ? prev.appealCount : 0, history: prev ? (prev.history || []) : []
                                            });
                                        }
                                        renderEnrichedPass(ta.id, enriched);
                                        if (typeof recordReflectionToGradebook === 'function') recordReflectionToGradebook(ta.id, answer, 'E');
                                        upgrades++;
                                        continue;
                                    }
                                } catch (_) { /* polish is best-effort; fall through to the plain grade */ }
                            }
                        }
                        var newRank = _aiVerdictRank(result.score);
                        if (newRank === undefined) continue;
                        if (newRank <= floor) { _aiRememberFrqText(ta.id, answer); continue; }   // never downgrade; remember text so we don't re-call
                        // 2026-08-19 (FRQ coverage): a FIRST-EVER "I" IS persisted on
                        // the auto path too. Every FRQ record path is floored (a later
                        // pass can only RAISE), so recording it is grade-safe — while
                        // not recording it left the row ungraded (score null) forever:
                        // 44% of all worksheet FRQ rows in the 2026-08-17 snapshot.
                        if (typeof gradingState !== 'undefined' && gradingState) {
                            gradingState.set(ta.id, {
                                result: result, originalAnswer: answer,
                                appealCount: prev ? prev.appealCount : 0,
                                history: prev ? (prev.history || []) : []
                            });
                        }
                        if (typeof showFeedback === 'function') showFeedback(ta.id, result);
                        if (typeof recordReflectionToGradebook === 'function') recordReflectionToGradebook(ta.id, answer, result.score);
                        if (floor >= 0) upgrades++;   // an actual RAISE over a prior grade (not a first-ever grade)
                    } catch (_) { _aiClearWaiting(ta.id, '⚠️ Grading hit an error — saved; it will be retried automatically.'); }
                }
                return upgrades;
            }

            // -- UI: button busy state + toast -------------------------------
            // -- honest wait status (2026-08-19): the grader is a shared queue; while a
            //    reflection waits, show "Queued · N ahead · ~Xs" / "Grading…" under it
            //    (from the server's /api/ai/status estimatedWaitMs), so a 30–60 s wait
            //    during class reads as expected, not broken. Removed when the verdict
            //    (or a failure note) lands.
            var _aiEtaCache = { at: 0, waitMs: null, ahead: 0 };
            async function _aiFetchEta() {
                try {
                    if (!window.RAILWAY_SERVER_URL || typeof fetch !== 'function') return null;
                    if (Date.now() - _aiEtaCache.at < 4000) return _aiEtaCache;
                    var r = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/status', { cache: 'no-store' });
                    if (!r.ok) return null;
                    var j = await r.json();
                    var q = (j && j.queue) || {};
                    _aiEtaCache = {
                        at: Date.now(),
                        waitMs: (typeof q.estimatedWaitMs === 'number') ? q.estimatedWaitMs : null,
                        ahead: ((q.queueLength || 0) + (q.inFlight || 0))
                    };
                    return _aiEtaCache;
                } catch (_) { return null; }
            }
            function _aiEtaText(eta) {
                if (!eta || eta.waitMs == null) return 'Grading…';
                var s = Math.max(3, Math.round(eta.waitMs / 1000));
                var ahead = eta.ahead > 0 ? (eta.ahead + ' ahead · ') : '';
                return (eta.ahead > 0 ? 'Queued · ' : 'Grading… ') + ahead + '~' + s + ' s';
            }
            function _aiStatusEl(taId, create) {
                var ta = document.getElementById(taId);
                if (!ta) return null;
                var id = taId + '-ai-status';
                var el = document.getElementById(id);
                if (!el && create) {
                    el = document.createElement('div');
                    el.id = id;
                    el.className = 'ai-wait-status';
                    el.setAttribute('aria-live', 'polite');
                    el.style.cssText = 'font-size:12px;color:#555;margin:4px 0 2px;display:flex;gap:6px;align-items:center';
                    ta.insertAdjacentElement('afterend', el);
                }
                return el;
            }
            var _aiStatusTimers = {};
            function _aiShowWaiting(taId) {
                var el = _aiStatusEl(taId, true);
                if (!el) return;
                function paint(eta) { el.textContent = '⏳ ' + _aiEtaText(eta); }
                paint(_aiEtaCache.waitMs != null ? _aiEtaCache : null);
                _aiFetchEta().then(paint).catch(function () {});
                if (_aiStatusTimers[taId]) clearInterval(_aiStatusTimers[taId]);
                _aiStatusTimers[taId] = setInterval(function () {
                    _aiFetchEta().then(function (eta) { if (eta) paint(eta); }).catch(function () {});
                }, 5000);
            }
            function _aiClearWaiting(taId, note) {
                if (_aiStatusTimers[taId]) { clearInterval(_aiStatusTimers[taId]); delete _aiStatusTimers[taId]; }
                var el = _aiStatusEl(taId, false);
                if (!el) return;
                if (note) { el.textContent = note; return; }
                try { el.remove(); } catch (_) {}
            }

            function _aiSetBusy(busy) {
                try {
                    var btn = document.querySelector('.btn-ai-recheck');
                    if (!btn) return;
                    btn.disabled = busy;
                    btn.innerHTML = busy ? '✨ grading…' : '✨ Grade with AI';
                    if (busy) {
                        _aiFetchEta().then(function (eta) {
                            if (eta && eta.waitMs != null && btn.disabled) btn.innerHTML = '✨ grading… ~' + Math.max(3, Math.round(eta.waitMs / 1000)) + ' s';
                        }).catch(function () {});
                    }
                } catch (_) {}
            }

            // Local worksheet "Score: X/Y (Z%)" — counts blanks the AI accepted
            // (the .correct class) alongside verbatim-correct ones, so the visible
            // score reflects the AI credit (it otherwise shows only the verbatim
            // count from checkAnswers).
            function _aiBlankStats() {
                var filled = 0, correct = 0, partial = 0;
                document.querySelectorAll('.blank').forEach(function (b) {
                    if (b.classList && b.classList.contains('revealed')) return;
                    if (!(b.value || '').trim()) return;
                    filled++;
                    if (b.classList && b.classList.contains('correct')) correct++;
                    else if (b.classList && b.classList.contains('partial')) partial++;
                });
                return { filled: filled, correct: correct, partial: partial };
            }
            function _aiUpdateScoreDisplay() {
                try {
                    var el = document.getElementById('scoreDisplay');
                    if (!el) return;
                    var s = _aiBlankStats();
                    if (s.filled > 0) {
                        // Grade-equivalent %: a partial is HALF credit (matches the
                        // gradebook). Relabelled so it's clearly THIS page's blanks,
                        // not the student's class grade (which lives on the Desk).
                        var pct = Math.round(((s.correct + 0.5 * s.partial) / s.filled) * 100);
                        el.textContent = "This worksheet's blanks: " + pct + '% — ' + s.correct + ' correct' +
                            (s.partial > 0 ? ', ' + s.partial + ' partial' : '') + ' of ' + s.filled;
                        el.title = "Just this page's fill-in-the-blanks (a partial counts as half). " +
                            'Your real class grade is on the Desk.';
                        el.classList.add('visible');
                    }
                } catch (_) {}
            }
            function _aiToast(msg) {
                try {
                    var t = document.createElement('div');
                    t.textContent = msg;
                    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
                        'z-index:99999;background:#323232;color:#fff;font-size:13px;padding:10px 16px;' +
                        'border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:Geneva,Verdana,sans-serif;';
                    document.body.appendChild(t);
                    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
                } catch (_) {}
            }

            // -- main pass ----------------------------------------------------
            window.aiGradeWorksheet = async function (opts) {
                opts = opts || {};
                var manual = !!opts.manual;
                if (window._aiGradeBusy) { if (manual) _aiToast('AI grading is already running…'); return; }
                var hash = _aiHash();
                if (hash === window._aiLastGradedHash) { if (manual) _aiToast('No changes since the last AI check.'); return; }

                // Collect filled blanks. Send ALL (coherent context); ACT only on
                // those below full credit (upgrade-only).
                var send = [];
                var actMap = {};
                var preCorrect = 0;             // verbatim-correct count (for the win toast)
                document.querySelectorAll('.blank').forEach(function (b) {
                    if (!b.dataset || !b.dataset.questionId) return;
                    if (b.classList && b.classList.contains('revealed')) return;   // Show-Answers, not the student's
                    var val = (b.value || '').trim();
                    if (!val) return;
                    var cur = _aiBlankScore(b);
                    if (cur === 1) preCorrect++;
                    send.push({
                        id: b.dataset.questionId,
                        question: _aiExtractQuestion(b),
                        acceptedAnswers: (b.dataset.answer || '').split('|'),
                        studentAnswer: val,
                        currentScore: cur
                    });
                    if (cur < 1) actMap[b.dataset.questionId] = b;
                });
                var filledTotal = send.length;

                window._aiGradeBusy = true;
                _aiSetBusy(true);
                var aiAccepted = 0, frqUpgraded = 0;
                try {
                    // BLANKS pass — one batched call, but ONLY when at least one
                    // blank is actually upgradeable (below full verbatim credit).
                    // No upgradeable blank ⇒ no API call (anti-spam). Soft-fail
                    // keeps the verbatim grade.
                    if (send.length && Object.keys(actMap).length && window.RAILWAY_SERVER_URL) {
                        try {
                            var resp = await fetch(window.RAILWAY_SERVER_URL + '/api/ai/grade-worksheet', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ scenario: _aiScenario(), blanks: send })
                            });
                            if (resp.ok) {
                                var data = await resp.json();
                                var graded = (data && Array.isArray(data.blanks)) ? data.blanks : [];
                                graded.forEach(function (g) {
                                    if (!g || g.credit !== true) return;         // strict: only explicit true
                                    var b = actMap[g.id];
                                    if (!b) return;                              // already full credit / unknown id
                                    _aiApplyBlankCredit(b, g.reason);
                                    aiAccepted++;
                                });
                            }
                        } catch (_) { /* soft-fail: verbatim grade stands */ }
                    }
                    // FRQ pass (upgrade-only; auto path won't persist a fresh "I").
                    try { frqUpgraded = (await _aiGradeFrqs(manual)) || 0; } catch (_) {}
                    window._aiLastGradedHash = hash;
                    if (manual) {
                        var parts = [];
                        if (aiAccepted > 0) parts.push('accepted ' + aiAccepted + ' more answer' + (aiAccepted > 1 ? 's' : ''));
                        if (frqUpgraded > 0) parts.push('polished ' + frqUpgraded + ' written response' + (frqUpgraded > 1 ? 's' : ''));
                        if (parts.length) {
                            var scorePart = '';
                            if (aiAccepted > 0 && filledTotal > 0) {
                                var pre = Math.round(preCorrect / filledTotal * 100);
                                var post = Math.round((preCorrect + aiAccepted) / filledTotal * 100);
                                scorePart = ' — Score ' + pre + '% → ' + post + '%';
                            }
                            _aiToast('✨ AI ' + parts.join(' and ') + scorePart);
                        } else {
                            _aiToast('✨ AI check complete — no new credit this time.');
                        }
                    }
                } finally {
                    window._aiGradeBusy = false;
                    _aiSetBusy(false);
                    _aiUpdateScoreDisplay();   // visible score now counts the AI-accepted blanks
                    try { if (typeof updateWorksheetCompletion === 'function') updateWorksheetCompletion(); } catch (_) {}
                }
            };

            // -- GUARD 1 (blanks never downgrade): the verbatim blur/Enter feeder
            //    (handleLiveUpdate → recordBlankToGradebook) recomputes the score
            //    purely from value-vs-key and would clobber an AI-credited 1.0 on
            //    a routine re-blur (no edit). Wrap it: if the blank still holds its
            //    AI-credited value, record the full credit instead of the verbatim
            //    score. Editing the blank drops data-ai-credit (via _aiReassertCredits
            //    / the value mismatch), so a genuinely changed answer is graded normally.
            if (typeof window.recordBlankToGradebook === 'function') {
                var _aiOrigRecordBlank = window.recordBlankToGradebook;
                window.recordBlankToGradebook = function (blank) {
                    try {
                        if (blank && blank.dataset && blank.dataset.aiCredit === '1') {
                            var v = (blank.value || '').trim();
                            if (v && v === (blank.dataset.aiCreditValue || '')) {
                                _aiRecordBlankFull(blank);     // honor the earned AI credit
                                return;
                            }
                        }
                    } catch (_) {}
                    return _aiOrigRecordBlank.apply(this, arguments);
                };
            }

            // -- GUARD 2 (FRQs never downgrade): wrap the single graded-FRQ sink so
            //    EVERY caller — the new AI pass, the legacy "Grade My Reflections"
            //    button, and the per-question appeal — is upgrade-only against the
            //    session+ledger floor (_aiFrqFloor). A verdict at-or-below the floor
            //    is not written; the recorded grade is the floor.
            if (typeof window.recordReflectionToGradebook === 'function') {
                var _aiOrigRecordReflection = window.recordReflectionToGradebook;
                window.recordReflectionToGradebook = function (taId, answer, scoreLetter) {
                    try {
                        var itemId = _aiFrqItemId(taId);
                        var nr = _aiVerdictRank(scoreLetter);
                        if (itemId && nr !== undefined) {
                            var floor = (itemId in _aiFrqFloor) ? _aiFrqFloor[itemId] : -1;
                            if (nr <= floor) return;           // never downgrade a recorded FRQ
                            _aiFrqFloor[itemId] = nr;          // remember the new best
                        }
                    } catch (_) {}
                    return _aiOrigRecordReflection.apply(this, arguments);
                };
            }

            // -- FRQ coverage (2026-08-19): every answered reflection must end up
            //    graded. Three leaks closed here: (1) grading only ran on a button
            //    press → also grade on textarea BLUR / 10 s idle / page hide;
            //    (2) failures were swallowed → bounded retry + remembered in
            //    localStorage so the next load re-runs them; (3) on load, any
            //    prior FRQ row with text but no score is graded automatically.
            var _AI_FRQ_RETRY_DELAYS = [5000];   // one bounded retry — the grader is a shared serialized queue
            async function _aiGradeWithRetry(taId, answer) {
                var lastErr = null;
                var grader = _aiGraderFn();
                if (!grader) return null;
                for (var attempt = 0; attempt <= _AI_FRQ_RETRY_DELAYS.length; attempt++) {
                    try {
                        var r = await grader(taId, answer);
                        // Success ONLY for a valid E/P/I verdict (a truthy junk score must not
                        // clear the pending state and then be silently skipped downstream).
                        if (r && _aiVerdictRank(r.score) !== undefined) return r;
                        lastErr = new Error('invalid verdict: ' + (r && r.score));
                    } catch (e) { lastErr = e; }
                    if (attempt < _AI_FRQ_RETRY_DELAYS.length) {
                        await new Promise(function (res) { setTimeout(res, _AI_FRQ_RETRY_DELAYS[attempt]); });
                    }
                }
                if (lastErr) console.warn('[ai-frq] grading failed after retries:', taId, lastErr && lastErr.message);
                return null;
            }
            // Scoped to the signed-in student (shared devices) — no identity → no memory.
            function _aiStudentKey() {
                try {
                    var who = (window.rosterClient && typeof window.rosterClient.current === 'function') ? window.rosterClient.current() : null;
                    if (who && who.username) return String(who.username);
                    var legacy = localStorage.getItem('apstats_desk_student_email');
                    return legacy ? String(legacy) : null;
                } catch (_) { return null; }
            }
            function _aiUngradedKey() {
                var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : null;
                var who = _aiStudentKey();
                return (prefix && who) ? ('apstats_frq_ungraded_' + who + '_' + prefix) : null;
            }
            function _aiRememberUngraded(taId, pending) {
                try {
                    var k = _aiUngradedKey(); if (!k) return;
                    var list = JSON.parse(localStorage.getItem(k) || '[]');
                    if (!Array.isArray(list)) list = [];
                    var i = list.indexOf(taId);
                    if (pending && i < 0) list.push(taId);
                    if (!pending && i >= 0) list.splice(i, 1);
                    if (list.length) localStorage.setItem(k, JSON.stringify(list)); else localStorage.removeItem(k);
                } catch (_) {}
            }
            function _aiHasUngradedPending() {
                try { var k = _aiUngradedKey(); return !!(k && JSON.parse(localStorage.getItem(k) || '[]').length); } catch (_) { return false; }
            }
            var _aiIdleTimer = null;
            // Auto-pass budget: at most 6 automatic passes per 10 minutes per page
            // (manual passes are never budgeted). Keeps a whole class from stampeding
            // the shared grader; the hash guard already skips unchanged content.
            var _AI_AUTO_BUDGET = { max: 6, windowMs: 600000, stamps: [] };
            function _aiAutoBudgetOk() {
                var now = Date.now();
                _AI_AUTO_BUDGET.stamps = _AI_AUTO_BUDGET.stamps.filter(function (t) { return now - t < _AI_AUTO_BUDGET.windowMs; });
                if (_AI_AUTO_BUDGET.stamps.length >= _AI_AUTO_BUDGET.max) return false;
                _AI_AUTO_BUDGET.stamps.push(now);
                return true;
            }
            function _aiScheduleAutoGrade(delayMs) {
                if (_aiIdleTimer) clearTimeout(_aiIdleTimer);
                _aiIdleTimer = setTimeout(function () {
                    _aiIdleTimer = null;
                    // A pass is already running → trail: try again shortly (content
                    // that changed mid-pass must not be left ungraded).
                    if (window._aiGradeBusy) { _aiScheduleAutoGrade(3000); return; }
                    if (!_aiAutoBudgetOk()) return;
                    try { if (window.aiGradeWorksheet) window.aiGradeWorksheet({ manual: false }); } catch (_) {}
                }, delayMs);
            }
            function _aiWireFrqTriggers() {
                _aiReflectionTextareas().forEach(function (ta) {
                    if (!ta || ta.dataset.aiFrqWired === '1') return;
                    ta.dataset.aiFrqWired = '1';
                    ta.addEventListener('input', function () {
                        if ((ta.value || '').trim().length >= 20) _aiScheduleAutoGrade(20000);   // 20 s idle
                    });
                    ta.addEventListener('blur', function () {
                        if ((ta.value || '').trim().length >= 20) _aiScheduleAutoGrade(800);     // leaving the box
                    });
                });
                try {
                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'hidden') _aiScheduleAutoGrade(0);
                    });
                    window.addEventListener('pagehide', function () { _aiScheduleAutoGrade(0); });
                } catch (_) {}
            }
            // On load: any prior FRQ row with text but no score (or a remembered
            // failure) → grade it now (hash/single-flight guarded like every pass).
            function _aiRegradeUngradedPrior(prior) {
                try {
                    var need = _aiHasUngradedPending();
                    if (!need && prior && typeof prior.forEach === 'function') {
                        var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : '';
                        prior.forEach(function (entry, itemId) {
                            if (need) return;
                            if (!prefix || String(itemId).indexOf(prefix + '-') !== 0) return;
                            var taId = String(itemId).slice(prefix.length + 1);
                            var ta = document.getElementById(taId);
                            if (!ta || ta.tagName !== 'TEXTAREA') return;
                            var text = (entry && typeof entry.response === 'string') ? entry.response : '';
                            if (text.trim().length >= 20 && (entry.score === null || entry.score === undefined)) need = true;
                        });
                    }
                    if (need) _aiScheduleWhenHydrated(prior, 0);
                } catch (_) {}
            }
            // Grade only when the DOM holds the exact prior text (hydration finished);
            // re-check a few times, then give up quietly (the next blur/idle covers it).
            function _aiScheduleWhenHydrated(prior, tries) {
                setTimeout(function () {
                    var ready = true;
                    try {
                        var prefix = (typeof gbWsPrefix === 'function') ? gbWsPrefix() : '';
                        if (prior && typeof prior.forEach === 'function') {
                            prior.forEach(function (entry, itemId) {
                                if (!prefix || String(itemId).indexOf(prefix + '-') !== 0) return;
                                if (!entry || (entry.score !== null && entry.score !== undefined)) return;
                                var ta = document.getElementById(String(itemId).slice(prefix.length + 1));
                                if (!ta || ta.tagName !== 'TEXTAREA') return;
                                var text = (typeof entry.response === 'string') ? entry.response.trim() : '';
                                if (text.length >= 20 && (ta.value || '').trim() !== text) ready = false;
                            });
                        }
                    } catch (_) {}
                    if (ready) { _aiScheduleAutoGrade(0); return; }
                    if (tries < 3) _aiScheduleWhenHydrated(prior, tries + 1);
                }, 1500);
            }

            // -- on load: restore AI-credit flags + greens from the ledger (so a
            //    post-reload blur can't clobber them) and seed the FRQ floor (so
            //    the legacy button can't downgrade before any AI pass runs).
            function _aiOnLoad() {
                try { _aiRestoreBlankCredits(); } catch (_) {}
                try { _aiWireFrqTriggers(); } catch (_) {}
                try {
                    _aiFetchPriorScores().then(function (prior) {
                        _aiSeedFrqFloor(prior);
                        _aiRegradeUngradedPrior(prior);
                    });
                } catch (_) {}
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () { setTimeout(_aiOnLoad, 600); });
            } else {
                setTimeout(_aiOnLoad, 600);   // let hydration settle first
            }
            try {
                window.addEventListener('storage', function (e) {
                    if (e && e.key === 'apstats_roster.v1') setTimeout(_aiOnLoad, 600);
                });
            } catch (_) {}

            // ==================== CLASS VIEW (named dotplot / frequency table) ===
            // Upgrades the "📊 Class" drawer. When SIGNED IN, show this student's
            // SECTION's actual answers to each blank as a dotplot (≤10 distinct
            // answers) or a frequency table (more), each tagged with a friendly
            // first-name + last-initial (from roster-server /class/blank), with the
            // key answer highlighted. NOT signed in → the original anonymous count
            // view is kept (soft fallback).
            function _aiClassEsc(s) {
                return String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            }
            function _aiClassToken() {
                try { return (window.rosterClient && typeof rosterClient.token === 'function') ? rosterClient.token() : null; }
                catch (_) { return null; }
            }
            async function _aiFetchClassNamed(itemId) {
                try {
                    var base = window.ROSTER_SERVICE_URL, token = _aiClassToken();
                    if (!base || !token) return null;
                    var res = await fetch(base + '/class/blank/' + encodeURIComponent(itemId),
                        { headers: { 'Authorization': 'Bearer ' + token } });
                    if (!res.ok) return null;
                    var data = await res.json();
                    return (data && data.ok && Array.isArray(data.responses)) ? data : null;
                } catch (_) { return null; }
            }
            function _aiNormAns(s) {
                if (typeof normalize === 'function') { try { return normalize(s); } catch (_) {} }
                return String(s == null ? '' : s).toLowerCase().trim();
            }
            function _aiBlankAccepted(blank) {
                var set = {}, raw = (blank && blank.dataset && blank.dataset.answer) ? blank.dataset.answer : '';
                raw.split('|').forEach(function (a) { var n = _aiNormAns(a); if (n) set[n] = true; });
                return set;
            }
            function _aiClassPrompt(blank, itemId) {
                var q = (typeof _aiExtractQuestion === 'function') ? _aiExtractQuestion(blank) : '';
                q = (q || '').slice(0, 90);
                return q || itemId;
            }
            function _aiGroupResponses(responses) {
                var groups = {}, order = [];
                responses.forEach(function (r) {
                    var a = String(r && r.answer != null ? r.answer : '');
                    if (!(a in groups)) { groups[a] = []; order.push(a); }
                    groups[a].push((r && r.label) ? r.label : 'Someone');
                });
                order.sort(function (a, b) { return groups[b].length - groups[a].length; });
                return { groups: groups, order: order };
            }
            function _aiRenderClassNamed(blank, itemId, responses) {
                var g = _aiGroupResponses(responses);
                var accepted = _aiBlankAccepted(blank);
                var total = responses.length, distinct = g.order.length;
                var head = '<div class="class-view"><div class="class-view-head"><strong>' +
                    _aiClassEsc(_aiClassPrompt(blank, itemId)) + '</strong> <span class="class-view-meta">' +
                    total + ' answer' + (total === 1 ? '' : 's') + ' · your class</span></div>';
                if (distinct <= 10) {
                    // DOTPLOT: one column per distinct answer, a stacked dot per student.
                    var cols = g.order.map(function (a) {
                        var who = g.groups[a], n = who.length, correct = !!accepted[_aiNormAns(a)];
                        var shown = Math.min(n, 40), dots = '';
                        for (var k = 0; k < shown; k++) dots += '●';
                        if (n > shown) dots += '…';
                        return '<div class="dot-col">' +
                            '<div class="dot-stack" title="' + _aiClassEsc(who.join(', ')) + '">' + dots + '</div>' +
                            '<div class="dot-count">' + n + '</div>' +
                            '<div class="dot-label' + (correct ? ' correct' : '') + '" title="' + _aiClassEsc(a) + '">' +
                            _aiClassEsc(a) + (correct ? ' ✓' : '') + '</div>' +
                            '<div class="dot-who">' + _aiClassEsc(who.join(', ')) + '</div>' +
                            '</div>';
                    }).join('');
                    return head + '<div class="dotplot">' + cols + '</div></div>';
                }
                // FREQUENCY TABLE: too many distinct / free-text answers for a dotplot.
                var rows = g.order.map(function (a) {
                    var who = g.groups[a], correct = !!accepted[_aiNormAns(a)];
                    return '<tr><td class="freq-ans' + (correct ? ' correct' : '') + '">' + _aiClassEsc(a) +
                        (correct ? ' ✓' : '') + '</td><td class="freq-n">' + who.length +
                        '</td><td class="freq-who">' + _aiClassEsc(who.join(', ')) + '</td></tr>';
                }).join('');
                return head + '<table class="freq-table"><thead><tr><th>Answer</th><th>#</th><th>Who</th></tr></thead><tbody>' +
                    rows + '</tbody></table></div>';
            }
            function _aiRenderClassEmpty(blank, itemId) {
                return '<div class="class-view"><div class="class-view-head"><strong>' +
                    _aiClassEsc(_aiClassPrompt(blank, itemId)) + '</strong></div>' +
                    '<p class="class-empty">No one in your class has answered this yet.</p></div>';
            }
            function _aiInjectClassStyles() {
                if (document.getElementById('ai-class-view-styles')) return;
                var s = document.createElement('style');
                s.id = 'ai-class-view-styles';
                s.textContent = [
                    '.class-view{margin:0 0 16px 0;padding:8px;border:1px solid #d7ddea;border-radius:8px;background:#fbfcff}',
                    '.class-view-head{font-size:0.92em;margin-bottom:6px;color:#243}',
                    '.class-view-meta{color:#789;font-weight:normal;font-size:0.85em}',
                    '.class-empty{color:#789;font-size:0.85em;margin:4px 2px}',
                    '.dotplot{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;padding:4px 2px}',
                    '.dot-col{display:flex;flex-direction:column;align-items:center;min-width:46px;max-width:130px}',
                    '.dot-stack{font-size:12px;line-height:1.05;color:#6b7a99;letter-spacing:1px;word-break:break-all;text-align:center;min-height:14px}',
                    '.dot-count{font-weight:bold;font-size:0.85em;margin-top:2px;color:#334}',
                    '.dot-label{font-size:0.78em;margin-top:2px;text-align:center;overflow-wrap:anywhere}',
                    '.dot-label.correct,.freq-ans.correct{color:#2e7d32;font-weight:bold}',
                    '.dot-who{font-size:0.72em;color:#667;margin-top:3px;text-align:center;overflow-wrap:anywhere}',
                    '.freq-table{width:100%;border-collapse:collapse;font-size:0.82em}',
                    '.freq-table th,.freq-table td{border:1px solid #e2e6f0;padding:3px 6px;text-align:left;vertical-align:top}',
                    '.freq-table td.freq-n{text-align:center;font-weight:bold;width:34px}',
                    '.freq-who{color:#667}'
                ].join('');
                (document.head || document.documentElement).appendChild(s);
            }
            // Override the drawer loader: named class view when signed in, else the
            // original anonymous bars.
            if (typeof window.loadAggregateData === 'function') {
                var _aiOrigLoadAggregate = window.loadAggregateData;
                window.loadAggregateData = async function () {
                    try {
                        if (!_aiClassToken() || !window.ROSTER_SERVICE_URL) return _aiOrigLoadAggregate.apply(this, arguments);
                        var content = document.getElementById('drawerContent');
                        var blanks = (typeof currentQuestionBlanks !== 'undefined' && currentQuestionBlanks) ? currentQuestionBlanks : [];
                        if (!content || !blanks.length) return _aiOrigLoadAggregate.apply(this, arguments);
                        _aiInjectClassStyles();
                        var html = '';
                        for (var i = 0; i < blanks.length; i++) {
                            var blank = blanks[i];
                            var itemId = (blank && blank.dataset) ? blank.dataset.questionId : null;
                            if (!itemId) continue;
                            var named = await _aiFetchClassNamed(itemId);
                            html += (named && named.responses && named.responses.length)
                                ? _aiRenderClassNamed(blank, itemId, named.responses)
                                : _aiRenderClassEmpty(blank, itemId);
                        }
                        content.innerHTML = html || '<p>No responses yet.</p>';
                        if (typeof spawnPeerSnow === 'function') { try { spawnPeerSnow(); } catch (_) {} }
                    } catch (_) {
                        try { return _aiOrigLoadAggregate.apply(this, arguments); } catch (__) {}
                    }
                };
            }

            // -- auto-on-Done: "Check Answers" IS the worksheet's grade/done
            //    action. Wrap it so a check also kicks the AI pass — guarded by
            //    hash dedup + single-flight, so repeat checks don't spam the API.
            //    _aiReassertCredits keeps earned greens stable when the verbatim
            //    pass re-paints (the AI pass skips on an unchanged hash).
            if (typeof window.checkAnswers === 'function') {
                var _aiOrigCheckAnswers = window.checkAnswers;
                window.checkAnswers = function () {
                    var r = _aiOrigCheckAnswers.apply(this, arguments);
                    _aiReassertCredits();
                    _aiUpdateScoreDisplay();   // keep the visible Score counting AI greens
                    try { window.aiGradeWorksheet({ manual: false }); } catch (_) {}
                    return r;
                };
            }
        })();`;

// Build the full <script> block (EOL-normalized to the target file).
export function buildScriptBlock(eol) {
  const block = '    <script>\n' + INJECTED_JS + '\n    </script>';
  return block.split('\n').join(eol || '\n');
}

// Replace an already-wired block with the CURRENT INJECTED_JS (idempotent:
// returns changed:false when the block is already current). The block is the
// exact `<script>` + INJECTED_JS + `</script>` buildScriptBlock emits, so we
// locate it by its first line and the next `</script>`.
export const BLOCK_FIRST_LINE = '// ==================== AI WORKSHEET GRADING (semantic blanks + folded FRQ) ====================';
export function rewireHtml(raw) {
  if (typeof raw !== 'string') return { changed: false, html: raw, reason: 'not-a-string' };
  if (!raw.includes(SENTINEL)) return { changed: false, html: raw, reason: 'not-wired' };
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const first = raw.indexOf(BLOCK_FIRST_LINE);
  if (first < 0) return { changed: false, html: raw, reason: 'block-start-not-found' };
  const scriptOpen = raw.lastIndexOf('<script>', first);
  const scriptClose = raw.indexOf('</script>', first);
  if (scriptOpen < 0 || scriptClose < 0) return { changed: false, html: raw, reason: 'block-bounds-not-found' };
  const lineStart = raw.lastIndexOf('\n', scriptOpen) + 1;
  const before = raw.slice(0, lineStart);
  const after = raw.slice(scriptClose + '</script>'.length);
  const fresh = buildScriptBlock(eol);
  const html = before + fresh + after;
  if (html === raw) return { changed: false, html: raw, reason: 'already-current' };
  return { changed: true, html, reason: 'rewired' };
}

// ---------------------------------------------------------------------------
// Pure wiring of one HTML string. Returns { changed, html, reason }.
// ---------------------------------------------------------------------------
export function wireHtml(raw) {
  if (typeof raw !== 'string') return { changed: false, html: raw, reason: 'not-a-string' };
  if (raw.includes(SENTINEL)) return { changed: false, html: raw, reason: 'already-wired' };

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let html = raw;

  // 1) Button — insert the single "Grade with AI" button right after the unique
  // "Check Answers" button.
  if (!html.includes('btn-ai-recheck')) {
    const btnRe = /<button class="btn-check" onclick="checkAnswers\(\)">[\s\S]*?<\/button>/;
    const m = html.match(btnRe);
    if (m) {
      const matchStart = html.indexOf(m[0]);
      // Reuse the button's own line indentation.
      const lineStart = html.lastIndexOf('\n', matchStart) + 1;
      const indent = (html.slice(lineStart, matchStart).match(/^[ \t]*/) || [''])[0];
      const insertion = m[0] + eol + indent + RECHECK_BUTTON;
      html = html.replace(m[0], insertion);
    }
  }

  // 1b) Remove the legacy "Grade My Reflections" button — the unified button now
  // grades reflections too (with the same polish pass). SKIP worksheets that grade
  // FRQs inline (no `function gradeReflection`): there the legacy button is the
  // ONLY way to grade the reflections, so we leave it in place.
  if (/function gradeReflection\b/.test(html)) {
    html = html.replace(
      /\r?\n[ \t]*<button class="btn-ai"[^>]*onclick="gradeAllReflections\(\)"[^>]*>[\s\S]*?<\/button>/,
      ''
    );
  }

  // 2) Script — append before the LAST </body>.
  const scriptBlock = buildScriptBlock(eol);
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) {
    return { changed: false, html: raw, reason: 'no-body-close' };
  }
  html = html.slice(0, bodyClose) + scriptBlock + eol + html.slice(bodyClose);

  return { changed: true, html, reason: 'wired' };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(argv) {
  const apply = argv.includes('--apply');
  const rewire = argv.includes('--rewire');
  const named = argv.filter((a) => !a.startsWith('--'));

  let files;
  if (named.length) {
    files = named.map((f) => path.basename(f)).filter((f) => TARGET_RE.test(f));
    const skipped = named.map((f) => path.basename(f)).filter((f) => !TARGET_RE.test(f));
    skipped.forEach((f) => console.log(`  SKIP (not a worksheet): ${f}`));
  } else {
    files = fs.readdirSync(ROOT).filter((f) => TARGET_RE.test(f));
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${files.length} worksheet(s)\n`);

  let wired = 0, already = 0, problem = 0;
  for (const f of files) {
    const p = path.join(ROOT, f);
    const raw = fs.readFileSync(p, 'utf8');
    // --rewire: replace an existing block with the current INJECTED_JS (used
    // whenever the block source changes; idempotent).
    const res = rewire ? rewireHtml(raw) : wireHtml(raw);
    if (res.reason === 'already-wired' || res.reason === 'already-current') {
      already++;
      console.log(`  = ${res.reason}: ${f}`);
      continue;
    }
    if (!res.changed) {
      problem++;
      console.log(`  ! PROBLEM (${res.reason}): ${f}`);
      continue;
    }
    const hasButton = res.html.includes('btn-ai-recheck');
    wired++;
    console.log(`  ${apply ? '+' : '~'} ${f}  (button=${hasButton ? 'yes' : 'NO'})`);
    if (apply) fs.writeFileSync(p, res.html);
  }

  console.log(`\nDone. wired=${wired} already=${already} problem=${problem}${apply ? '' : '  (dry-run — pass --apply to write)'}`);
}

const _invokedDirectly = (() => {
  try { return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href; }
  catch (_) { return false; }
})();
if (_invokedDirectly) {
  main(process.argv.slice(2));
}
