// desk-donow-ledger.test.js — the Do Now card is now colored by the SAME
// readiness the My Ledger uses and is itself a one-tap entry into My Ledger; the
// redundant chips (My Ledger / Class Gradebook) were removed and "how grades
// work" moved to a Help menu. (My Gradebook stays until it folds into the Ledger.)
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const paintFn = DESK.slice(DESK.indexOf('function _paintDoNowReadiness'), DESK.indexOf('async function renderDoNowGrades'));

describe('Do Now card — readiness color + single My Ledger entry', () => {
  it('paints the card with the SAME wallet readiness hue', () => {
    expect(DESK).toMatch(/function _paintDoNowReadiness/);
    expect(paintFn).toContain('_walletDisplayReadiness()');
    expect(paintFn).toMatch(/card\.style\.background = 'hsl\(' \+ rd\.hue/);
    expect(DESK).toContain('_paintDoNowReadiness()'); // actually called
  });

  it('makes the whole card open My Ledger (openWallet) on click', () => {
    expect(paintFn).toContain('openWallet()');
    expect(paintFn).toContain("card.setAttribute('role', 'button')");
    // doesn't hijack clicks on interactive children (the My Gradebook chip etc.)
    expect(paintFn).toMatch(/closest\('a,button,\[role="button"\]/);
  });

  it('removed the redundant Do Now chips (My Ledger / Class Gradebook)', () => {
    expect(DESK).not.toContain('receiptsChip');
    expect(DESK).not.toContain('cgChip');
  });

  it('moved "how grades work" to a Help menu', () => {
    expect(DESK).toMatch(/data-menu="help"/);
    expect(DESK).toMatch(/menu-help[\s\S]{0,200}openGradeHelp/);
  });
});
