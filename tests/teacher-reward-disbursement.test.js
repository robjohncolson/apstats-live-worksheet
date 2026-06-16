// teacher-reward-disbursement.test.js — the teacher dashboard's 🍬 Reward
// Disbursement view: per-student effort → candy earned ($) + DOGE-equivalent at
// the live price, fed by /class/grades' server-computed `effort` field.
// (DOGE_WALLET_SPEC — the teacher's "how much candy to give / DOGE to deposit".)
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(resolve(repo, 'teacher-dashboard.html'), 'utf8');
const CLASS = readFileSync(resolve(repo, 'roster-server/class.js'), 'utf8');
const ECON = readFileSync(resolve(repo, 'roster-server/doge-econ.js'), 'utf8');

describe('Teacher reward disbursement — dashboard', () => {
  it('has a Reward Disbursement section + render function', () => {
    expect(DASH).toMatch(/Reward Disbursement/);
    expect(DASH).toContain('reward-tbody');
    expect(DASH).toContain('function renderRewardDisbursement');
    expect(DASH).toContain('renderRewardDisbursement(pPayload)');   // staff-inclusive payload
  });

  it('shows the REAL give/deposit from /class/wallets + mark-done + set-address', () => {
    expect(DASH).toContain('/class/wallets');
    expect(DASH).toContain("_rewardMark(s.studentId, 'mark-given'");
    expect(DASH).toContain("_rewardMark(s.studentId, 'mark-sent'");
    expect(DASH).toContain('_rewardSetAddress');
    expect(DASH).toContain("postJson('/wallet/' + action");
    expect(DASH).toContain("'/wallet/address'");
  });

  it('uses server-computed effort for "candy earned" + the live price', () => {
    const fn = DASH.slice(DASH.indexOf('function renderRewardDisbursement'), DASH.indexOf('function renderGradesTable'));
    expect(fn).toContain('s.effort');
    expect(DASH).toContain('api.coingecko.com');
    expect(DASH).toMatch(/Class total/);
  });

  it('degrades gracefully before migration 0019 (unprovisioned)', () => {
    expect(DASH).toContain("'unprovisioned'");
    expect(DASH).toMatch(/run migration 0019/);
  });

  it('includes teacher/test accounts (badged, sorted last) so the teacher can test redemption', () => {
    const fn = DASH.slice(DASH.indexOf('function renderRewardDisbursement'), DASH.indexOf('function renderGradesTable'));
    expect(fn).toContain('🧪');                       // teacher rows badged
    expect(fn).toMatch(/role === 'teacher'.*\? 1 : 0/); // teacher rows sort last
    expect(fn).not.toMatch(/filter\(function \(s\) \{ return !s \|\| s\.role !== 'teacher'/); // no longer filtered out
  });
});

describe('Teacher reward disbursement — server effort field', () => {
  it('/class/grades computes per-student effort → candy from receipt-carrying rows', () => {
    expect(CLASS).toContain("import { computeEffort } from './doge-econ.js'");
    expect(CLASS).toContain('effort: computeEffort(ledgerRows)');
    // the shared math lives in doge-econ.js (mirrors js/wallet_logic.js)
    expect(ECON).toContain('export function computeEffort');
    expect(ECON).toContain('r.receipt_compact');            // matches the wallet's durable set
    expect(ECON).toMatch(/POINTS_PER_CANDY\s*=\s*36/);      // frozen peg
  });
});
