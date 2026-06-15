// desk-wallet-sessions-only.test.js — the wallet (My Ledger) receipt feed is
// Sessions-only by request: the Lessons/Types/Days tab strip was removed to
// keep the screen clean. Structural pins so the tabs don't creep back.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

describe('Wallet receipt feed — Sessions-only (no Lessons/Types/Days tabs)', () => {
  it('no tab-strip renderer remains', () => {
    expect(DESK).not.toContain('_walletRenderReceiptTabs');
  });

  it('the Lessons/Types/Days tab definitions are gone', () => {
    expect(DESK).not.toMatch(/dim:\s*'lesson',\s*label:\s*'Lessons'/);
    expect(DESK).not.toMatch(/dim:\s*'type',\s*label:\s*'Types'/);
    expect(DESK).not.toMatch(/dim:\s*'day',\s*label:\s*'Days'/);
  });

  it('the receipt feed stays fixed to session grouping', () => {
    expect(DESK).toMatch(/_walletReceiptFeedTab\s*=\s*'session'/);
  });
});
