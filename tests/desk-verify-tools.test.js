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
  it('teacher menu opens the phone QR-bridge for the scan-to-verify tool', () => {
    expect(DESK).toMatch(/Verify a record \(scan\)/);
    expect(DESK).toMatch(/onclick="closeMenus\(\);openVerifyQR\(\)"/);
  });

  it('openVerifyQR shows a QR of the cr teacher-verify URL (phone bridge)', () => {
    expect(DESK).toMatch(/function openVerifyQR/);
    expect(DESK).toContain('curriculum_render/teacher-verify.html');
    // builds a QR for that url (mirrors openReconcileQR)
    expect(DESK).toMatch(/new QRCode\(host, \{ text: url/);
  });

  it('does NOT bridge the teacher token through the QR (security)', () => {
    // the QR encodes only the bare tool URL — no token query param
    expect(DESK).not.toMatch(/teacher-verify\.html\?[^'"]*token/);
  });

  it('keeps the existing paste/drag verifier entry too', () => {
    expect(DESK).toContain('curriculum_render/verify.html');
  });

  it('printed summary caption invites a no-login phone scan to verify', () => {
    expect(DESK).toMatch(/Scan this QR with any phone to verify — no app or login needed/);
  });
});
