// wire-identity-clean.mjs — make the worksheet identity fields reflect the LIVE
// shared session instead of a stale 'worksheet-user' cache from a previous
// person on the device. Replaces restoreSavedUser() in every follow-along
// worksheet (^u\d+_lesson..._live.html — edgar/MIT excluded by the pattern).
//
// Priority: signed-in roster student > active guest alias > local cache.
// Field ids are resolved by EITHER convention (worksheetName/Period or
// studentName/studentClass) so the one divergent worksheet (u3_lesson6-7) is
// covered too. The anonymous-fallback cache key auto-detects LOCAL_USER_KEY.
//
// Usage:  node scripts/wire-identity-clean.mjs [--dry] [<file> ...]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const NEW_FN = [
  "        function restoreSavedUser() {",
  "            // IDENTITY (clean): the live shared session is AUTHORITATIVE so the",
  "            // fields never show a PREVIOUS person's name/period/username left on",
  "            // this device. Roster student wins; else an active guest alias; else",
  "            // (nobody signed in) the local cache. Mirrors getUsername()'s guest rule.",
  "            try {",
  "                var nameEl   = document.getElementById('worksheetName')   || document.getElementById('studentName');",
  "                var periodEl = document.getElementById('worksheetPeriod') || document.getElementById('studentClass');",
  "                var userEl   = document.getElementById('worksheetUsername');",
  "                var roster = null;",
  "                try { roster = (window.rosterClient && rosterClient.current) ? rosterClient.current() : null; } catch (_) {}",
  "                if (roster && roster.username) {",
  "                    if (userEl)   userEl.value   = roster.username;",
  "                    if (nameEl)   nameEl.value   = roster.realName || roster.username;",
  "                    if (periodEl && roster.section) periodEl.value = String(roster.section).replace(/^Period\\s*/i, '');",
  "                    if (typeof saveUser === 'function') saveUser();",
  "                    return;",
  "                }",
  "                var guestActive = false, guestAlias = '';",
  "                try { guestActive = localStorage.getItem('apstats_guest_active') === '1'; } catch (_) {}",
  "                // Read the guest alias straight from localStorage — getGuestIdentity()",
  "                // lives in railway_client.js, which 404s from a root worksheet's ../ path,",
  "                // so window.getGuestIdentity is undefined here. The alias is durable in LS.",
  "                try { var ga = localStorage.getItem('apstats_guest_identity'); if (ga && /^Guest_/i.test(ga)) guestAlias = ga; } catch (_) {}",
  "                if (guestActive) {",
  "                    if (userEl) userEl.value = guestAlias;   // the Guest_ alias (or blank) — never a prior person's",
  "                    if (nameEl) nameEl.value = guestAlias;",
  "                    if (periodEl) periodEl.value = '';",
  "                    if (typeof saveUser === 'function') saveUser();",
  "                    return;",
  "                }",
  "                var anonKey = (typeof LOCAL_USER_KEY !== 'undefined' && LOCAL_USER_KEY) ? LOCAL_USER_KEY : 'worksheet-user';",
  "                var saved = localStorage.getItem(anonKey);",
  "                if (saved) {",
  "                    var user = JSON.parse(saved);",
  "                    if (user.name && nameEl) nameEl.value = user.name;",
  "                    if (user.klass && periodEl) periodEl.value = user.klass;",
  "                    if (user.username && userEl) userEl.value = user.username;",
  "                }",
  "            } catch (e) { console.warn('Could not restore user', e); }",
  "        }",
].join("\n");

const MARKER = 'IDENTITY (clean): the live shared session is AUTHORITATIVE';
const PATTERN = /^u\d+_lesson.+_live\.html$/;

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const explicit = argv.filter((a) => !a.startsWith('--'));
const files = (explicit.length ? explicit : readdirSync('.').filter((f) => PATTERN.test(f))).sort();

let changed = 0;
const already = [];
const skipped = [];

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Always brace-match + replace restoreSavedUser (idempotent — re-running with
  // the same body is a no-op). 'already' is reported only when no change results.
  const sig = 'function restoreSavedUser()';
  const at = src.indexOf(sig);
  if (at < 0) { skipped.push(f + ' (no restoreSavedUser)'); continue; }
  const braceStart = src.indexOf('{', at);
  if (braceStart < 0) { skipped.push(f + ' (no body)'); continue; }
  let depth = 0, end = -1;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) { skipped.push(f + ' (unbalanced)'); continue; }
  const lineStart = src.lastIndexOf('\n', at) + 1; // capture leading indentation
  const out = src.slice(0, lineStart) + NEW_FN + src.slice(end + 1);
  if (out === src) { already.push(f); continue; }
  if (!dry) writeFileSync(f, out, 'utf8');
  changed++;
}

console.log(`${dry ? '[dry] ' : ''}restoreSavedUser rewritten: ${changed}  already: ${already.length}  skipped: ${skipped.length}  (of ${files.length})`);
if (skipped.length) console.log('SKIPPED:\n  ' + skipped.join('\n  '));
