/**
 * scripts/wire-worksheet-viewas.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of TWO fixes to every u*_lesson*_live.html:
 *
 *   (Bug 1) Teacher "view as student" → READ-ONLY worksheet showing the STUDENT's
 *           answers. When a worksheet is opened with ?viewAsUserId=<sid> AND the
 *           signed-in user is a teacher, the module points every prior-answer read
 *           at that student (window.__VIEW_AS_STUDENT_ID__, consumed by
 *           gradebook-client.js fetchPrior), neuters every write sink, disables
 *           all inputs, hides the grade/answer buttons, and shows a banner.
 *
 *   (Bug 2) The "Show Answers" cheat. The button now ships `hidden` and is revealed
 *           ONLY for a real teacher on their OWN worksheet — gated on the SIGNED
 *           roster session role (rosterClient.current().role === 'teacher'), never
 *           a forgeable localStorage flag. Students never see it; in view-as it
 *           stays hidden (read-only).
 *
 * Three transforms per file (all must apply, or the file is REPORTED as FAIL):
 *   T1  <button class="btn-show" onclick="showAnswers()">  → add id + hidden
 *   T2  function updateWorksheetCompletion() { try {       → read-only early-return
 *   T3  inject the WS-VIEWAS-MODULE <script> right before </body>
 *
 * EOL-preserving: each file is read, edited, and written in its OWN native EOL
 * (older U1–U3 / U8–U9 worksheets have been CRLF; the rest LF). Re-emit matches.
 *
 * Idempotency: a fully-wired file contains the marker `WS-VIEWAS-MODULE`.
 * Present → SKIP. Absent → wire it.
 *
 * Usage:
 *   node scripts/wire-worksheet-viewas.mjs            # dry-run report
 *   node scripts/wire-worksheet-viewas.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const MARKER = 'WS-VIEWAS-MODULE';

// ── T1: Show-Answers button — ship it hidden with a stable id ────────────────
const T1_FROM = '<button class="btn-show" onclick="showAnswers()">';
const T1_TO   = '<button class="btn-show" id="btn-show-answers" hidden onclick="showAnswers()">';

// ── T2: completion tracker — never record completion while read-only ─────────
const T2_FROM_LF =
`        function updateWorksheetCompletion() {
            try {`;
const T2_TO_LF =
`        function updateWorksheetCompletion() {
            if (window.__WS_READ_ONLY__) return;   // view-as: never record completion
            try {`;

// ── T3: the view-as read-only + Show-Answers-gate module ─────────────────────
// Authored with \n; re-emitted in each file's native EOL at apply time. Inserted
// immediately before </body>, so every client script (railway/roster/gradebook,
// loaded in <head>) and the main inline worksheet script already exist when it
// runs. It sets __VIEW_AS_STUDENT_ID__ synchronously (before DOMContentLoaded),
// so hydration + the AI floor both read the target student.
const MODULE_LF =
`    <!-- WS-VIEWAS-MODULE: teacher read-only "view as student" + Show-Answers gate.
         Injected by scripts/wire-worksheet-viewas.mjs. Do not hand-edit. -->
    <script>
    (function () {
      'use strict';

      // Reveal-gate signal: the roster SESSION role (rosterClient.current().role).
      // This is a CLIENT value — it lives in localStorage 'apstats_roster.v1' with
      // no server re-verification — so it is NOT a security boundary; a kid who can
      // edit localStorage could forge it. We use it anyway because the realistic
      // threat is a kid clicking an OBVIOUS visible button: shipping the button
      // hidden closes that. Forging the role (or just reading the data-answer
      // attributes in the DOM, or calling showAnswers() from the console) grants
      // nothing the page didn't already expose. We prefer the session role over the
      // legacy 'apstats_user_role' flag only because it is the cleaner signal.
      function _wsIsTeacher() {
        try {
          var who = (window.rosterClient && typeof window.rosterClient.current === 'function')
            ? window.rosterClient.current() : null;
          return !!(who && who.role === 'teacher');
        } catch (_) { return false; }
      }

      var _sid = null;
      try { _sid = new URLSearchParams(location.search).get('viewAsUserId'); } catch (_) { _sid = null; }
      var _isTeacher = _wsIsTeacher();
      var _viewAs = !!(_sid && _isTeacher);

      // ── Show-Answers gate (Bug 2): button ships hidden; reveal ONLY for a real
      //    teacher on their own worksheet (never a student, never view-as). ──
      function _gateShowAnswers() {
        try {
          var btn = document.getElementById('btn-show-answers');
          if (!btn) return;
          if (_isTeacher && !_viewAs) { btn.hidden = false; btn.removeAttribute('hidden'); }
          else { btn.hidden = true; btn.setAttribute('hidden', ''); }
        } catch (_) {}
      }

      if (!_viewAs) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', _gateShowAnswers);
        } else { _gateShowAnswers(); }
        // A teacher who signs in AFTER opening the worksheet (via the Desk in
        // another tab) should see Show Answers without a reload. Re-evaluate the
        // role + gate on a roster session change. Students are unaffected.
        try {
          window.addEventListener('storage', function (e) {
            if (e && e.key === 'apstats_roster.v1') {
              _isTeacher = _wsIsTeacher();
              _gateShowAnswers();
            }
          });
        } catch (_) {}
        return;
      }

      // ===== VIEW-AS READ-ONLY MODE (teacher impersonating a student) =====

      // (1) Point EVERY prior-answer read at the target student (hydration + AI floor).
      window.__VIEW_AS_STUDENT_ID__ = _sid;
      // (2) Hard read-only: neuter every write sink up front so a stray feeder can
      //     never write to a grade. Inputs are disabled below too (defense in depth).
      window.__WS_READ_ONLY__ = true;
      try {
        if (window.gradebookClient && typeof window.gradebookClient.record === 'function') {
          window.gradebookClient.record = function () {
            return Promise.resolve({ ok: false, reason: 'read-only' });
          };
        }
      } catch (_) {}
      try {
        if (window.railwayClient && typeof window.railwayClient.submitAnswer === 'function') {
          window.railwayClient.submitAnswer = function () { return Promise.resolve(); };
        }
      } catch (_) {}

      function _lockFields() {
        try {
          var fields = document.querySelectorAll('input, textarea, select');
          for (var i = 0; i < fields.length; i++) {
            fields[i].setAttribute('disabled', 'disabled');
            fields[i].style.cursor = 'not-allowed';
          }
          var hide = document.querySelectorAll('.btn-check, .btn-ai-recheck, .btn-show, .btn-reset, .btn-ai, .appeal-btn, .appeal-form, .appeal-section');
          for (var j = 0; j < hide.length; j++) { hide[j].style.display = 'none'; }
        } catch (_) {}
      }

      // Wipe any identity restoreSavedUser() filled (it runs first, with the
      // TEACHER's session) so the teacher's name never lingers in the header.
      // _banner() fills the STUDENT's identity on profile success; on a profile
      // fetch failure the fields stay blank (fail-safe — never the wrong person).
      function _clearIdentity() {
        try {
          ['worksheetName', 'worksheetUsername', 'worksheetPeriod'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
          });
        } catch (_) {}
      }

      function _banner(profile) {
        try {
          if (document.getElementById('ws-view-as-banner')) return;
          var name = (profile && (profile.realName || profile.real_name || profile.username)) || 'this student';
          var user = (profile && profile.username) ? ('@' + profile.username) : '';
          var bar = document.createElement('div');
          bar.id = 'ws-view-as-banner';
          bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#f2c94c;color:#3a2c00;font:bold 13px Geneva,Verdana,sans-serif;padding:9px 14px;display:flex;align-items:center;gap:12px;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);';
          var msg = document.createElement('span');
          msg.textContent = '\\uD83D\\uDC41 Viewing ' + name + (user ? ' ' + user : '') + ' \\u2014 READ ONLY (their answers)';
          bar.appendChild(msg);
          var x = document.createElement('button');
          x.type = 'button'; x.textContent = 'Close';
          x.style.cssText = 'background:#3a2c00;color:#fff;border:0;border-radius:4px;padding:3px 10px;cursor:pointer;font:bold 12px Geneva,sans-serif;';
          x.onclick = function () { try { window.close(); } catch (_) {} try { history.back(); } catch (_) {} };
          bar.appendChild(x);
          document.body.appendChild(bar);
          try { document.body.style.paddingTop = '40px'; } catch (_) {}
          // Reflect the student's identity in the worksheet header fields.
          try {
            var n = document.getElementById('worksheetName');
            var u = document.getElementById('worksheetUsername');
            var p = document.getElementById('worksheetPeriod');
            if (n && profile && (profile.realName || profile.real_name)) n.value = (profile.realName || profile.real_name);
            if (u && profile && profile.username) u.value = profile.username;
            if (p && profile && profile.section) p.value = String(profile.section).replace(/^Period\\s*/i, '');
          } catch (_) {}
        } catch (_) {}
      }

      async function _profile() {
        try {
          var base = window.ROSTER_SERVICE_URL;
          var token = (window.rosterClient && typeof window.rosterClient.token === 'function')
            ? window.rosterClient.token() : null;
          if (!base || !token) return null;
          var res = await fetch(base + '/teacher/student/' + encodeURIComponent(_sid) + '/profile', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!res || !res.ok) return null;
          var data = await res.json();
          return (data && (data.profile || data.student || data)) || null;
        } catch (_) { return null; }
      }

      function _boot() {
        _lockFields();
        _clearIdentity();          // wipe the teacher identity restoreSavedUser filled (same tick → no flash)
        _profile().then(_banner);  // fill the STUDENT's identity (or leave blank on failure)
        // Re-assert the lock after async hydration paints restored values/colors.
        setTimeout(_lockFields, 1200);
        setTimeout(_lockFields, 3000);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _boot);
      } else { _boot(); }
    })();
    </script>
`;

const BODY_CLOSE = '</body>';

function occ(haystack, needle) {
  let c = 0, i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
  return c;
}

const files = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

const report = [];
let wired = 0;
let already = 0;
let failed = 0;

for (const f of files) {
  const path = resolve(ROOT, f);
  let html = readFileSync(path, 'utf8');
  const before = html;
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const line = { f, eol: eol === '\r\n' ? 'CRLF' : 'LF', state: '', detail: '' };

  if (html.includes(MARKER)) {
    line.state = 'SKIP'; line.detail = 'already-wired'; already++; report.push(line); continue;
  }

  // Resolve EOL-native variants.
  const t2From = eol === '\r\n' ? T2_FROM_LF.replace(/\n/g, '\r\n') : T2_FROM_LF;
  const t2To   = eol === '\r\n' ? T2_TO_LF.replace(/\n/g, '\r\n')   : T2_TO_LF;
  const module = eol === '\r\n' ? MODULE_LF.replace(/\n/g, '\r\n')  : MODULE_LF;

  // Each anchor must appear EXACTLY once.
  const c1 = occ(html, T1_FROM);
  const c2 = occ(html, t2From);
  const c3 = occ(html, BODY_CLOSE);
  if (c1 !== 1 || c2 !== 1 || c3 !== 1) {
    line.state = 'FAIL';
    line.detail = `anchors: btn-show×${c1}, completion×${c2}, </body>×${c3} (each expected 1)`;
    failed++; report.push(line); continue;
  }

  html = html.replace(T1_FROM, T1_TO);
  html = html.replace(t2From, t2To);
  html = html.replace(BODY_CLOSE, module + BODY_CLOSE);

  if (html === before) {
    line.state = 'FAIL'; line.detail = 'replace was a no-op'; failed++; report.push(line); continue;
  }
  // Post-condition: marker now present exactly once.
  if (occ(html, MARKER) !== 1) {
    line.state = 'FAIL'; line.detail = `post-marker×${occ(html, MARKER)}`; failed++; report.push(line); continue;
  }

  if (APPLY) writeFileSync(path, html, 'utf8');
  line.state = 'OK'; wired++; report.push(line);
}

console.log(`wire-worksheet-viewas — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
console.log('');
for (const r of report) {
  const tag = r.state.padEnd(4);
  const eol = r.eol.padEnd(4);
  const name = r.f.padEnd(38);
  const detail = r.detail ? `  ${r.detail}` : '';
  console.log(`[${tag}] ${name} (${eol})${detail}`);
}
console.log('');
console.log(`Summary: ${wired} wired, ${already} already, ${failed} failed.`);
if (failed > 0) {
  console.log('\nFAIL — investigate the FAIL lines above. Re-run will not auto-fix.');
  process.exit(1);
}
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');
