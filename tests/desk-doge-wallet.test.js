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
  it('is preview-gated: teachers always see it, students only when the flag is set', () => {
    const gate = fnBody('_dogeWalletPreviewOn');
    expect(gate).toContain('_deskIsTeacher()');                 // teachers always
    expect(gate).toContain("'apstats_doge_wallet_preview'");    // students via flag
    const panel = fnBody('_walletDogePanel');
    expect(panel).toContain('_dogeWalletPreviewOn()');          // bails when off
  });

  it('fetches the server wallet (/wallet) and shows the Earned/in-hand/Owed ledger + Buy-DOGE', () => {
    const fetchFn = fnBody('_dogeWalletFetch');
    expect(fetchFn).toContain("'/wallet'");
    const render = fnBody('_dogeWalletRender');
    expect(render).toContain("act('/wallet/buy-doge')");
    expect(render).not.toContain("/wallet/eat");          // eat retired (CANDY_LEDGER_SPEC)
    expect(render).toContain('candyEarned');              // the 6-number ledger headline
    expect(render).toContain('candyMaterialized');
    expect(render).toContain('candyOwed');
    expect(render).toContain('candyBalance');
    expect(render).toContain('dogeBalance');
  });

  it('degrades to a display-only preview before migration 0019 (503 / offline)', () => {
    const render = fnBody('_dogeWalletRender');
    expect(render).toContain('_dogeWalletPreviewFallback');
    expect(render).toMatch(/_notProvisioned/);
    const fb = fnBody('_dogeWalletPreviewFallback');
    expect(fb).toContain('WalletLogic.candyFromPoints');
    expect(fb).not.toMatch(/If DOGE → \$1|by June/);     // no speculative projection
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

  it('never touches a private key client-side (POSTs candy amounts, not keys)', () => {
    for (const fn of ['_walletDogePanel', '_dogeWalletFetch', '_dogeWalletAction', '_dogeWalletRender',
                      '_dogeWalletChainFetch', '_dogeWalletChainPaint', '_dogeWalletChainArm',
                      '_dogeWalletGiftSend', '_dogeWalletGiftForm']) {
      expect(fnBody(fn)).not.toMatch(/privateKey|signTransaction|sendTransaction|broadcast|wif/i);
    }
  });

  it('offers 🎁 gift-to-classmate (POST /wallet/gift by username, server-resolved)', () => {
    const send = fnBody('_dogeWalletGiftSend');
    expect(send).toContain("'/wallet/gift'");
    expect(send).toContain('toUsername');                 // recipient by public username
    const form = fnBody('_dogeWalletGiftForm');
    expect(form).toContain('_fetchPeriodRoster');         // classmate picker
    expect(form).toMatch(/role.*===\s*'student'/);        // excludes the teacher account
    expect(form).toContain('n > maxCandy');               // clamps the amount to the balance
    const render = fnBody('_dogeWalletRender');
    expect(render).toContain('_dogeWalletGiftForm');      // wired into the panel
  });

  it('shows a watch-only on-chain balance line (GET /wallet/chain), self-refreshing', () => {
    const chainFetch = fnBody('_dogeWalletChainFetch');
    expect(chainFetch).toContain("'/wallet/chain'");
    const paint = fnBody('_dogeWalletChainPaint');
    expect(paint).toContain('confirmedDoge');
    expect(paint).toContain('explorerUrl');           // "view ↗" deep-link
    const arm = fnBody('_dogeWalletChainArm');
    expect(arm).toContain('app-wallet-overlay');       // stops when the window closes
    expect(arm).toMatch(/setTimeout/);                 // 60s refresh while open
    const render = fnBody('_dogeWalletRender');
    expect(render).toContain('_dogeWalletChainArm');   // wired into the panel
    expect(render).toContain('w.dogeAddress');         // only when an address is registered
  });
});
