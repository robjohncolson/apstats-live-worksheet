#!/usr/bin/env node
// Dry-run by default; --apply writes only after every worksheet passes preflight.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const MARKER = '// LR1: hydrateLocalAnswers';
const FINALLY = '            finally { if (window.worksheetDiagnostics) window.worksheetDiagnostics.finish(diagnosticRun, prior); }';
const HELPER = '        function _markRestored(el) {';
const TRIGGER = `        // Hydration trigger: fire on DOMContentLoaded + on any roster-client signin event.
        (function () {`;
const WALL = `            return !!(window.rosterClient && typeof rosterClient.current === 'function'
                      && rosterClient.current());`;
const WALL_HELPER = '    function _wallAccessGranted() {';
const NAME = '                    if (nameEl)   nameEl.value   = roster.realName || roster.username;';

const HELPERS = `        var _lrHydratedOwner = null;

        function _lrResetForeignRestores(currentSid) {
            document.querySelectorAll('[data-restored="1"]').forEach(function (el) {
                if (!el.dataset.restoredOwner || el.dataset.restoredOwner === currentSid) return;
                el.value = '';
                Array.from(el.classList).forEach(function (name) {
                    if (['correct', 'partial', 'incorrect', 'revealed'].includes(name) || name.indexOf('graded-') === 0) el.classList.remove(name);
                });
                ['restored', 'localOnly', 'localKey', 'localSeq', 'restoredOwner'].forEach(function (key) { delete el.dataset[key]; });
                var badge = el.nextElementSibling;
                if (badge && badge.classList.contains('restored-badge')) badge.remove();
            });
            if (_lrHydratedOwner !== currentSid) _lrHydratedOwner = null;
        }

        function _markLocalRestored(el) {
            try {
                if (!el || !el.parentNode) return;
                var sib = el.nextSibling;
                var b = sib && sib.nodeType === 1 && sib.classList.contains('restored-badge') ? sib : null;
                if (!b) {
                    b = document.createElement('span');
                    el.parentNode.insertBefore(b, el.nextSibling);
                }
                b.className = 'restored-badge local-only';
                b.textContent = '↻ kept on this device — not saved to your grade yet';
                b.title = 'Kept on this device. Sign in on the Desk to save it to your grade.';
                b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                                  'font-size:0.75em;background:#fde7ea;border:1px solid #b00020;' +
                                  'border-radius:4px;color:#b00020;';
            } catch (_) {}
        }

        function _markLocalSaved(el) {
            try {
                if (!el) return;
                delete el.dataset.localOnly;
                var sib = el.nextSibling;
                if (!sib || sib.nodeType !== 1 || !sib.classList.contains('restored-badge')) return;
                sib.className = 'restored-badge';
                sib.textContent = '↻ restored';
                sib.title = 'Filled from your prior submission. Edit freely to overwrite.';
                sib.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 6px;' +
                                    'font-size:0.75em;background:#fff7d6;border:1px solid #d9b800;' +
                                    'border-radius:4px;color:#7a5a00;';
            } catch (_) {}
        }

        async function hydrateLocalAnswers() {
            try {
                if (window.__WS_READ_ONLY__ || window.__VIEW_AS_STUDENT_ID__) return;
                var sid = window.rosterClient && rosterClient.studentId ? rosterClient.studentId() : null;
                _lrResetForeignRestores(sid);
                if (!window.OfflineQueue || !OfflineQueue.all || !OfflineQueue.keyOf) return;
                var prefix = gbWsPrefix();
                if (!sid || !prefix) return;
                var rows = await OfflineQueue.all();
                // Identity can change while IndexedDB is reading.
                if (rosterClient.studentId() !== sid) return;
                var latest = new Map();
                var sequence = function (row) {
                    if (typeof row.transportSequence === 'number' && isFinite(row.transportSequence)) return row.transportSequence;
                    return typeof row.ts === 'number' && isFinite(row.ts) ? row.ts : 0;
                };
                rows.forEach(function (row) {
                    if (!row || row.studentId !== sid || String(row.itemId).indexOf(prefix + '-') !== 0) return;
                    if (row.kind === 'appeal' || typeof row.response !== 'string' || !row.response.trim()) return;
                    var key = OfflineQueue.keyOf(row);
                    var prev = latest.get(key);
                    if (!prev || sequence(row) >= sequence(prev)) latest.set(key, row);
                });
                latest.forEach(function (row, key) {
                    var el = null;
                    if (row.source === 'worksheet') {
                        el = Array.from(document.querySelectorAll('.blank[data-question-id]')).find(function (blank) {
                            return blank.dataset.questionId === String(row.itemId);
                        });
                    } else if (row.source === 'frq') {
                        el = document.getElementById(String(row.itemId).slice(prefix.length + 1));
                        if (el && el.tagName !== 'TEXTAREA') return;
                    }
                    if (!el || el.dataset.gbEdited === '1' || (el.value && el.value.trim())) return;
                    el.value = row.response;
                    el.dataset.restored = '1';
                    el.dataset.localOnly = '1';
                    el.dataset.localKey = key;
                    el.dataset.localSeq = String(sequence(row));
                    el.dataset.restoredOwner = sid;
                    _lrHydratedOwner = sid;
                    if (row.source === 'worksheet' && typeof checkAnswer === 'function') checkAnswer(el);
                    _markLocalRestored(el);
                });
            } catch (_) {}
        }

`;

const LISTENERS = `
            var savedHydrateTimer = null;
            window.addEventListener('roster-session-changed', function () {
                _lrResetForeignRestores(window.rosterClient && rosterClient.studentId ? rosterClient.studentId() : null);
                hydratePriorAnswers();
            });
            window.addEventListener('gb-row-saved', function (e) {
                if (!e || !e.detail || typeof e.detail.key !== 'string') return;
                var matched = false;
                document.querySelectorAll('[data-local-only="1"][data-local-key]').forEach(function (el) {
                    if (el.dataset.localKey !== e.detail.key) return;
                    matched = true;
                    if (e.detail.studentId === el.dataset.restoredOwner &&
                        Number(e.detail.transportSequence) >= Number(el.dataset.localSeq)) _markLocalSaved(el);
                });
                if (!matched) {
                    if (savedHydrateTimer !== null) clearTimeout(savedHydrateTimer);
                    savedHydrateTimer = setTimeout(function () {
                        savedHydrateTimer = null;
                        hydratePriorAnswers();
                    }, 1500);
                }
            });`;

const BANNER = `    // LR2: expired wall
    function _lrShowExpiredBanner() {
        try {
            if (!document.body || document.getElementById('gb-no-identity-nudge')) return;
            var bar = document.createElement('div');
            bar.id = 'gb-no-identity-nudge';
            bar.setAttribute('role', 'alert');
            bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;'
                + 'background:#b00020;color:#fff;font-family:Geneva,Verdana,sans-serif;'
                + 'font-size:13px;padding:10px 14px;display:flex;align-items:center;'
                + 'gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
            var msg = document.createElement('span');
            msg.textContent = '⚠️ Your sign-in expired — your answers are being kept on this device. Sign in again on the Desk (one click) to save them to your grade.';
            bar.appendChild(msg);
            var link = document.createElement('a');
            link.href = 'ap_stats_roadmap_square_mode.html';
            link.textContent = 'Open the Desk and sign in again';
            link.style.cssText = 'color:#fff;font-weight:bold;text-decoration:underline;white-space:nowrap;';
            bar.appendChild(link);
            var x = document.createElement('button');
            x.type = 'button';
            x.textContent = '×';
            x.setAttribute('aria-label', 'Dismiss');
            x.style.cssText = 'background:transparent;border:0;color:#fff;font-size:18px;'
                + 'line-height:1;cursor:pointer;padding:0 4px;';
            x.onclick = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
            bar.appendChild(x);
            document.body.appendChild(bar);
        } catch (_) {}
    }
`;

const replacements = [
    ["                    if (e && e.key === 'apstats_roster.v1') hydratePriorAnswers();",
     "                    if (e && e.key === 'apstats_roster.v1') {\n                        _lrResetForeignRestores(window.rosterClient && rosterClient.studentId ? rosterClient.studentId() : null);\n                        hydratePriorAnswers();\n                    }"],
    ["                    blank.dataset.restored = '1';", "                    blank.dataset.restored = '1';\n                    blank.dataset.restoredOwner = sid;"],
    ["                    ta.dataset.restored = '1';", "                    ta.dataset.restored = '1';\n                    ta.dataset.restoredOwner = sid;"],
    ['        async function hydratePriorAnswers() {', `        async function hydratePriorAnswers() {
            var sid = window.__VIEW_AS_STUDENT_ID__ || (window.rosterClient && rosterClient.studentId ? rosterClient.studentId() : null);
            _lrResetForeignRestores(sid);`],
    ['                prior = await window.gradebookClient.fetchPrior(prefix, { restore: true });', `                prior = await window.gradebookClient.fetchPrior(prefix, { restore: true });
                if (sid !== (window.__VIEW_AS_STUDENT_ID__ || (window.rosterClient && rosterClient.studentId ? rosterClient.studentId() : null))) return;`],
    [FINALLY, FINALLY.replace(' prior); }', ' prior); hydrateLocalAnswers(); } ' + MARKER)],
    [HELPER, HELPERS + HELPER],
    [TRIGGER, TRIGGER + LISTENERS],
    [WALL_HELPER, BANNER + WALL_HELPER],
    [WALL, `            var session = window.rosterClient && typeof rosterClient.current === 'function'
                ? rosterClient.current() : null;
            if (session && session.expired === true) _lrShowExpiredBanner();
            return !!session;`],
    [NAME, "                    if (nameEl)   nameEl.value   = (roster.realName || roster.username) + (roster.expired === true ? ' (expired — sign in again)' : '');"],
];

const files = readdirSync(ROOT).filter(f => /^u\d+_lesson.+_live\.html$/.test(f)).sort();
let changed = 0, skipped = 0, failed = 0;
const pending = [];
for (const file of files) {
    const path = resolve(ROOT, file);
    const html = readFileSync(path, 'utf8');
    if (html.includes(MARKER)) {
        console.log(file + ': already');
        skipped++;
        continue;
    }
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    const convert = text => text.replace(/\n/g, eol);
    const missing = replacements.filter(([anchor]) => html.split(convert(anchor)).length !== 2).length;
    if (missing) {
        console.error(file + ': anchor-missing:' + missing);
        failed++;
        continue;
    }
    let out = html;
    for (const [anchor, replacement] of replacements) out = out.replace(convert(anchor), convert(replacement));
    pending.push([path, out]); // Keeping the original string also preserves its BOM.
    changed++;
    console.log(file + ': ok');
}
if (APPLY && !failed) {
    for (const [path, out] of pending) writeFileSync(path, out, 'utf8');
}
console.log(`${APPLY ? (failed ? 'blocked' : 'applied') : 'dry-run'}: ${changed} changed, ${skipped} already wired, ${failed} failed (of ${files.length})`);
process.exitCode = failed ? 1 : 0;
