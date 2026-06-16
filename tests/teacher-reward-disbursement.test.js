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

describe('Teacher reward disbursement — dashboard', () => {
  it('has a Reward Disbursement section + render function', () => {
    expect(DASH).toMatch(/Reward Disbursement/);
    expect(DASH).toContain('reward-tbody');
    expect(DASH).toContain('function renderRewardDisbursement');
    expect(DASH).toContain('renderRewardDisbursement(gPayload)');   // wired into load
  });

  it('uses the server-computed effort + the shared WalletLogic conversions', () => {
    const fn = DASH.slice(DASH.indexOf('function renderRewardDisbursement'), DASH.indexOf('function renderGradesTable'));
    expect(fn).toContain('s.effort');                 // server-computed candy/points
    expect(fn).toContain('W.usdFromCandy');
    expect(fn).toContain('W.candyPerDoge');
    expect(fn).toContain('W.dogeFromCandy');           // candy→DOGE at the live price
  });

  it('fetches the live DOGE price and shows a class total', () => {
    expect(DASH).toContain('api.coingecko.com');
    expect(DASH).toMatch(/Class total/);
  });

  it('excludes teacher/test accounts from disbursement', () => {
    const fn = DASH.slice(DASH.indexOf('function renderRewardDisbursement'), DASH.indexOf('function renderGradesTable'));
    expect(fn).toMatch(/role !== 'teacher'/);
  });

  it('is honest that the eat/bank split + addresses come next', () => {
    expect(DASH).toMatch(/per their\s+'\s*\+\s*'choice|next phase/);
  });
});

describe('Teacher reward disbursement — server effort field', () => {
  it('/class/grades computes per-student effort → candy from receipt-carrying rows', () => {
    expect(CLASS).toContain('function computeEffort');
    expect(CLASS).toContain('effort: computeEffort(ledgerRows)');
    expect(CLASS).toContain('r.receipt_compact');           // matches the wallet's durable set
    expect(CLASS).toMatch(/POINTS_PER_CANDY\s*=\s*36/);     // frozen peg, mirrors wallet_logic
  });
});
