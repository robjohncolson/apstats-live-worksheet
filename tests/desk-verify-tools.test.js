// desk-verify-tools.test.js — the Desk surfaces the verification path: the
// teacher menu links the new scan-to-verify tool (teacher-verify.html), and the
// printed summary tells anyone they can scan to verify with no app/login.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

describe('Desk — verification tools surfaced', () => {
  it('teacher menu links the scan-to-verify tool (teacher-verify.html)', () => {
    expect(DESK).toContain('curriculum_render/teacher-verify.html');
    expect(DESK).toMatch(/Verify a record \(scan\)/);
  });

  it('keeps the existing paste/drag verifier entry too', () => {
    expect(DESK).toContain('curriculum_render/verify.html');
  });

  it('printed summary caption invites a no-login phone scan to verify', () => {
    expect(DESK).toMatch(/Scan this QR with any phone to verify — no app or login needed/);
  });
});
