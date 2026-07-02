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

describe('mobile-home — native self-signup (§2.5 port)', () => {
  it('_nfCreate renders a signup form in the launcher instead of redirecting to the Desk', () => {
    // the old redirect is gone
    expect(HOME).not.toContain("location.href = 'ap_stats_roadmap_square_mode.html'");
    const block = HOME.slice(HOME.indexOf('function _nfCreate'), HOME.indexOf('window._nfCreate = _nfCreate'));
    expect(block).toContain('Create your account');
    expect(block).toContain('nf-su-name');
    expect(block).toContain('nf-su-pin');
    expect(block).toContain('_nfSpin()');   // client-side re-roll
  });

  it('spins a fruit_animal username client-side', () => {
    expect(HOME).toContain('var _SU_FRUITS');
    expect(HOME).toContain('var _SU_ANIMALS');
    expect(HOME).toMatch(/_suPick\(_SU_FRUITS\) \+ '_' \+ _suPick\(_SU_ANIMALS\)/);
  });

  it('claims via rosterClient, re-rolls on username-taken, and runs the post-sign-in flow', () => {
    const block = HOME.slice(HOME.indexOf('function _nfSubmitSignup'), HOME.indexOf('window._nfSubmitSignup'));
    expect(block).toContain('rosterClient.claim({ realName: realName, section: _suSection, username: _suUsername, pin: pin }');
    expect(block).toMatch(/code === 'username-taken'.*_suSpin\(\)/s);   // re-roll + retry
    expect(block).toContain('meshKeyBoot()');                          // mesh key (silent) on signup
    expect(block).toContain('LedgerStore.pull');
    expect(block).toContain('loadGrade()');
    expect(block).toMatch(/\^\\d\{4\}\$/);                             // 4-digit PIN validation
  });

  it('renders a period PICKER for multi-section signup (no silent section[0]) — Desk parity', () => {
    expect(HOME).toContain('function _nfRenderPeriod');
    expect(HOME).toContain('id="nf-su-period-row"');
    const block = HOME.slice(HOME.indexOf('function _nfRenderPeriod'), HOME.indexOf('function _nfSubmitSignup'));
    // 1 section → read-only label; >1 → a real <select> bound to _suSection
    expect(block).toMatch(/secs\.length === 1/);
    expect(block).toContain("createElement('select')");
    expect(block).toContain('_suSection = sel.value');
    expect(block).toContain('o.textContent = s.label');   // labels via textContent (XSS-safe)
  });
});
