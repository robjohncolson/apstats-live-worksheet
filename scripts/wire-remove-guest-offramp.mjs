#!/usr/bin/env node
// One-shot codemod (2026-06-25): remove the cross-app guest off-ramp line from every
// worksheet's inline sign-in wall (_wallAccessGranted), so a worksheet now requires a
// real roster session — guests are retired. EOL-preserving (some U1-U3 / U8-U9
// worksheets are CRLF), idempotent (re-running is a no-op on already-clean files).
//
// NOTE: this off-ramp line is NOT in scripts/wire-signin-wall.mjs or SIGNIN_WALL_BUILD.md
// (it was added by a later codemod that was never reflected back), so re-running the wire
// script will NOT remove it. This file is the canonical remover.
//
//   node scripts/wire-remove-guest-offramp.mjs            # dry run (default)
//   node scripts/wire-remove-guest-offramp.mjs --apply    # write changes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

// Worksheets only — mirrors the worksheet-rollout guard ^u\d+_lesson.+_live\.html$.
const WS_RE = /^u\d+_lesson.+_live\.html$/;
// The full physical off-ramp line (leading indent + statement + optional comment + EOL).
const GUEST_LINE = /^[^\S\r\n]*if \(localStorage\.getItem\('apstats_guest_active'\) === '1'\) return true;[^\r\n]*\r?\n/m;
// The statement core, used to detect a variant the line regex somehow missed.
const CORE = "apstats_guest_active') === '1') return true";

const files = fs.readdirSync(ROOT).filter(f => WS_RE.test(f)).sort();
let changed = 0, already = 0;
const missed = [];
for (const f of files) {
  const p = path.join(ROOT, f);
  const src = fs.readFileSync(p, 'utf8');
  if (GUEST_LINE.test(src)) {
    const out = src.replace(GUEST_LINE, '');
    if (out.includes(CORE)) missed.push(f + ' (>1 occurrence?)');
    if (apply) fs.writeFileSync(p, out, 'utf8');
    changed++;
  } else if (src.includes(CORE)) {
    missed.push(f);
  } else {
    already++;
  }
}

console.log(`worksheets scanned : ${files.length}`);
console.log(`${apply ? 'off-ramp REMOVED   ' : 'WOULD remove (dry) '}: ${changed}`);
console.log(`already clean      : ${already}`);
if (missed.length) console.log(`!! INSPECT (off-ramp present but line regex missed): ${missed.join(', ')}`);
if (!apply) console.log('(dry run — re-run with --apply to write)');
