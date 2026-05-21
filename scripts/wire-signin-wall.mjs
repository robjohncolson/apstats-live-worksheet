/**
 * scripts/wire-signin-wall.mjs
 *
 * Idempotent, EOL-PRESERVING rollout of the SIGNIN_WALL_BUILD.md §3 worksheet
 * sign-in wall to every u*_lesson*_live.html. Inserts a self-contained
 * `<script>` block immediately AFTER the existing
 * `<script src="gradebook-client.js"></script>` tag.
 *
 * Mirrors scripts/wire-hydration.mjs / scripts/wire-completion-tracker.mjs in
 * shape: each file is read, edited, and written in its OWN native EOL. Some
 * older U1-U3 / some U8-U9 worksheets have been CRLF in the past; the script
 * detects per-file and re-emits in the same EOL so the git diff stays minimal
 * and additive.
 *
 * Idempotency: a fully-wired file contains the wall block. The §3 block sets
 * the overlay id programmatically (`ov.id = 'ws-signin-wall'`), so the literal
 * attribute form `id="ws-signin-wall"` never appears in source — the reliable
 * sentinel is the wall's helper name `_wallAccessGranted` (the fallback the
 * build doc's rollout section names). The script also recognises a literal
 * `id="ws-signin-wall"` if some future hand-edit produces it. If either is
 * present → SKIP (already wired). The roster-client.js tag loads earlier in
 * the same head, so `window.rosterClient` is defined by the time the wall
 * block runs.
 *
 * Anchor: the byte-for-byte line `<script src="gradebook-client.js"></script>`.
 * This anchor is unique + present in all 69 worksheets (verified at write
 * time — any worksheet whose anchor count != 1 is REPORTED as FAIL, NOT
 * silently skipped).
 *
 * Usage:
 *   node scripts/wire-signin-wall.mjs            # dry-run report
 *   node scripts/wire-signin-wall.mjs --apply    # write files
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Idempotency sentinels — a wired file contains at least one of these. The §3
// block sets `ov.id = 'ws-signin-wall'` programmatically, so the helper name
// `_wallAccessGranted` is the substring that actually appears in source; the
// literal `id="ws-signin-wall"` is also matched defensively.
const SENTINELS = ['_wallAccessGranted', 'id="ws-signin-wall"'];

// Anchor is the gradebook-client.js script tag. Authored with \n so we can
// re-emit it in each file's native EOL when matching/replacing.
const ANCHOR_LF = `    <script src="gradebook-client.js"></script>`;

// The sign-in wall block to insert AFTER the anchor (separated by one EOL).
// Authored with \n; re-emitted in each file's native EOL at apply time.
const WALL_BLOCK_LF =
`    <script>
(function () {
    // No-guest-mode wall (SIGNIN_WALL_BUILD.md §3). A worksheet opened
    // without a signed-in roster session blocks until the student signs
    // in at the Desk. Fails OPEN — if rosterClient is unavailable, do
    // NOT wall (degrade, never brick).
    function _wallAccessGranted() {
        try {
            if (localStorage.getItem('apstats_user_role') === 'teacher') return true;
            return !!(window.rosterClient && typeof rosterClient.current === 'function'
                      && rosterClient.current());
        } catch (_) { return true; }
    }
    function _removeSigninWall() {
        var el = document.getElementById('ws-signin-wall');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    function _showSigninWall() {
        if (document.getElementById('ws-signin-wall')) return;
        if (!document.body) return;
        var ov = document.createElement('div');
        ov.id = 'ws-signin-wall';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;'
            + 'background:#eceff1;display:flex;align-items:center;'
            + 'justify-content:center;font-family:Geneva,Verdana,sans-serif;';
        var box = document.createElement('div');
        box.style.cssText = 'max-width:380px;margin:16px;padding:22px 26px;'
            + 'background:#fff;border:1px solid #999;border-radius:8px;'
            + 'text-align:center;box-shadow:0 6px 24px rgba(0,0,0,0.25);';
        var h = document.createElement('div');
        h.textContent = '🔒 Sign in to open this worksheet';
        h.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:10px;';
        var p = document.createElement('div');
        p.textContent = 'Your answers are only saved when you are signed in. '
            + 'Sign in at the Desk, then come back to this page.';
        p.style.cssText = 'font-size:12px;color:#444;margin-bottom:16px;line-height:1.5;';
        var a = document.createElement('a');
        a.href = 'ap_stats_roadmap_square_mode.html';
        a.textContent = 'Open the Desk to sign in';
        a.style.cssText = 'display:inline-block;padding:7px 16px;background:#0000cc;'
            + 'color:#fff;text-decoration:none;border-radius:5px;font-size:12px;';
        box.appendChild(h); box.appendChild(p); box.appendChild(a);
        ov.appendChild(box);
        document.body.appendChild(ov);
    }
    function _checkSigninWall() {
        if (_wallAccessGranted()) _removeSigninWall();
        else _showSigninWall();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _checkSigninWall);
    } else {
        _checkSigninWall();
    }
    // Self-dismiss / re-show: when sign-in state changes (often in another
    // Desk tab) the storage event fires here — re-check. Watches the roster
    // session key (student sign-in/out) AND the teacher-role key (standalone
    // teacher sign-in/out), since _wallAccessGranted keys off both.
    try {
        window.addEventListener('storage', function (e) {
            if (e && (e.key === 'apstats_roster.v1'
                      || e.key === 'apstats_user_role')) _checkSigninWall();
        });
    } catch (_) {}
})();
</script>`;

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

  // Already wired? Any sentinel present → SKIP.
  if (SENTINELS.some((s) => html.includes(s))) {
    line.state = 'SKIP';
    line.detail = 'already-wired';
    already++;
    report.push(line);
    continue;
  }

  // Resolve anchor in this file's native EOL.
  const anchor = eol === '\r\n' ? ANCHOR_LF.replace(/\n/g, '\r\n') : ANCHOR_LF;
  const anchorCount = occ(html, anchor);
  if (anchorCount !== 1) {
    line.state = 'FAIL';
    line.detail = `anchor×${anchorCount} (expected 1)`;
    failed++;
    report.push(line);
    continue;
  }

  // Resolve the wall block in this file's native EOL.
  const block = eol === '\r\n' ? WALL_BLOCK_LF.replace(/\n/g, '\r\n') : WALL_BLOCK_LF;

  // Insert AFTER the anchor: original anchor line + EOL + block. The anchor is
  // a single line (the gradebook-client.js script tag); the block opens with
  // its own `<script>` tag, so one EOL separates them — the result matches the
  // hand-piloted u4_lesson1-2 file exactly.
  const replacement = anchor + eol + block;
  html = html.replace(anchor, replacement);

  if (html === before) {
    line.state = 'FAIL';
    line.detail = 'replace was a no-op';
    failed++;
    report.push(line);
    continue;
  }

  if (APPLY) {
    writeFileSync(path, html, 'utf8');
  }
  line.state = 'OK';
  wired++;
  report.push(line);
}

console.log(`wire-signin-wall — ${APPLY ? 'APPLY (files written)' : 'DRY-RUN (no writes)'} — ${files.length} worksheets`);
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
  console.log('');
  console.log('FAIL — investigate the FAIL lines above. Re-run will not auto-fix.');
  process.exit(1);
}
console.log(APPLY ? '\nWritten. Re-run without --apply to confirm idempotent.' : '\nDry-run only. Re-run with --apply to write.');
