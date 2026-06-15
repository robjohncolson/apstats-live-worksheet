// desk-pacing-overview.test.js — the teacher pacing overview: teacher-dashboard
// shows each student's readiness COLOR (the same wallet_logic the student sees in
// My Ledger) + progress + last activity, fed by /class/grades' additive
// lastActivityAt. Structural pins so the shared-logic wiring stays intact.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');
const CLASS = readFileSync(resolve(repo, 'roster-server/class.js'), 'utf8');

describe('Teacher pacing overview — dashboard', () => {
  it('loads the shared wallet_logic.js and has a Pacing Overview section', () => {
    expect(DASH).toContain('js/wallet_logic.js');
    expect(DASH).toMatch(/Pacing Overview/);
    expect(DASH).toContain('pacing-tbody');
  });

  it('computes readiness via the SAME WalletLogic the students see', () => {
    expect(DASH).toContain('WalletLogic.summerReadiness');
    expect(DASH).toContain('WalletLogic.walletReadiness');
  });

  it("doneCount uses the same completion gate (Cws>=60 && blooket>=80)", () => {
    expect(DASH).toMatch(/cws\s*>=\s*60/i);
    expect(DASH).toMatch(/bl\s*>=\s*80/i);
  });

  it('fetches the same summer schedule the Desk uses', () => {
    expect(DASH).toContain("fetch('data/summer-schedule.json')");
  });

  it('renders in the load flow and sorts most-behind first', () => {
    expect(DASH).toContain('renderPacingOverview(gPayload)');
    expect(DASH).toMatch(/_PACING_ORDER/);
  });
});

describe('Teacher pacing overview — server data', () => {
  it('/class/grades exposes an additive per-student lastActivityAt', () => {
    expect(CLASS).toMatch(/lastActivityAt/);
    expect(CLASS).toMatch(/recorded_at/);
  });
});
