// desk-doge-wallet.test.js — Phase 1 of the DOGE Effort Wallet (DOGE_WALLET_SPEC):
// the My Ledger wallet shows a candy/DOGE preview panel — candy value of effort,
// the live candy→DOGE rate, and the "if DOGE → $1" projection. PREVIEW-GATED so
// it stays hidden from students on the live site until the teacher rolls it out.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('fn not found: ' + name);
  const i = DESK.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

describe('Desk DOGE wallet — Phase 1 preview panel', () => {
  it('is preview-gated (off by default) so it does not surprise students', () => {
    const gate = fnBody('_dogeWalletPreviewOn');
    expect(gate).toContain("'apstats_doge_wallet_preview'");
    const panel = fnBody('_walletDogePanel');
    expect(panel).toContain('_dogeWalletPreviewOn()');   // bails when off
  });

  it('renders candy value + live rate + the "if DOGE → $1" projection', () => {
    const panel = fnBody('_walletDogePanel');
    expect(panel).toContain('WalletLogic.candyFromPoints');
    expect(panel).toContain('WalletLogic.usdFromCandy');
    expect(panel).toContain('WalletLogic.candyPerDoge');
    expect(panel).toContain('WalletLogic.dogeFromCandy');
    expect(panel).toMatch(/If DOGE → \$1 by June/);
  });

  it('fetches the live DOGE price (CoinGecko) and caches it', () => {
    const fetchFn = fnBody('_fetchDogePrice');
    expect(fetchFn).toContain('api.coingecko.com');
    expect(fetchFn).toContain('ids=dogecoin');
    expect(fetchFn).toContain("'apstats_doge_price'");   // localStorage cache
  });

  it('is wired into the wallet paint (after the effort-points row)', () => {
    expect(DESK).toContain('_walletDogePanel(card, pts)');
  });

  it('is display-only in Phase 1 — no client-side spend/send of real DOGE', () => {
    const panel = fnBody('_walletDogePanel');
    expect(panel).not.toMatch(/privateKey|signTransaction|sendTransaction|broadcast/i);
  });
});
