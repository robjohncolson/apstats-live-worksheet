// mobile-home-submissions.test.js — pins the mobile launcher's Phase 2 wiring
// (OFFLINE_GRADING_MESH §3, §0.6-0.7): the submissions-lane scripts are loaded,
// Sync-Nearby runs BOTH lanes when the subs stack is present, and the subs lane
// gossips only grade-uncovered rows via SubmissionStore.rowsForGossip.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'mobile-home.html'), 'utf8');

describe('mobile-home — submissions lane wiring', () => {
  it('loads the Phase 1-2 mesh scripts', () => {
    for (const s of ['receipt-sign.js', 'secure-key.js', 'student-key.js', 'submission-store.js', 'submission-capture.js']) {
      expect(HOME, `missing <script src="${s}">`).toContain(`src="${s}"`);
    }
  });

  it('defines the submissions-lane verifier + readiness gate', () => {
    expect(HOME).toContain('function verifySubRow');
    expect(HOME).toContain('ReceiptVerify.verifySubmissionRow');
    expect(HOME).toContain('function subsLaneReady');
  });

  it('snapshots the grades set once for §0.7 suppression (offer + ingest agree)', () => {
    // coveredKeys is computed once from a grades snapshot and drives BOTH sides.
    expect(HOME).toContain('SubmissionStore.coveredKeys(gradesSnapshot)');
    expect(HOME).toContain('SubmissionStore.isCovered(r, covered)');           // offer side
    expect(HOME).toContain('SubmissionStore.suppressingVerify(verifySubRow, covered)'); // ingest side
  });

  it('runs two lanes when the subs stack is live, else the grades-only round', () => {
    expect(HOME).toContain('LedgerGossip.runLanes');
    expect(HOME).toContain("lane: 'grades'");
    expect(HOME).toContain("lane: 'subs'");
    // the grades-only fallback (unchanged shipped path) is still present
    expect(HOME).toContain('LedgerGossip.runRound');
  });

  it('the subs lane stores into SubmissionStore (never the grades store)', () => {
    const block = HOME.slice(HOME.indexOf("lane: 'subs'"), HOME.indexOf('durationMs: 45000', HOME.indexOf("lane: 'subs'")));
    expect(block).toContain('store: SubmissionStore');
    expect(block).not.toContain('store: LedgerStore');
  });
});
