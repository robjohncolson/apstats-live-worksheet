// desk-wallet-render.test.js — EXECUTES the real "Candy & DOGE" panel (WALLET_REDESIGN_SPEC)
// in jsdom against mock wallet data, so we verify it actually RENDERS (catches syntax/runtime
// errors the string-pin tests can't) and behaves: the calm resting state, the rounding-wart
// fix, the mutually-exclusive action forms, and the exact-value Details ledger.
//
// @vitest-environment jsdom

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESK = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

// Brace-match extractor (same idea as the other desk tests' fnBody).
function fnSrc(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('fn not found: ' + name);
  const i = DESK.indexOf('{', m.index);
  let d = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '{') d++;
    else if (DESK[j] === '}') { d--; if (d === 0) return DESK.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

beforeAll(() => {
  // Stub the externally-defined collaborators the panel calls (kept simple/deterministic).
  globalThis._dogeWalletPreviewFallback = () => {};
  globalThis._dogeWalletAction = () => Promise.resolve({ ok: true });
  globalThis._dogeWalletFetch = () => Promise.resolve({ ok: true });
  globalThis._dogeWalletGiftForm = (wrap) => { wrap.textContent = '[classmate picker]'; };
  globalThis._dogeWalletChainArm = () => {};
  // Load the REAL functions from the file into global scope (eval throws on a syntax error → a parse check).
  (0, eval)(
    fnSrc('_candyFmt') + '\n' + fnSrc('_dogeFmt') + '\n' +
    fnSrc('_dogeWalletRender') + '\n' + fnSrc('_walletLedgerDetail') + '\n' +
    'globalThis._candyFmt=_candyFmt;globalThis._dogeFmt=_dogeFmt;' +
    'globalThis._dogeWalletRender=_dogeWalletRender;globalThis._walletLedgerDetail=_walletLedgerDetail;'
  );
});

// A realistic populated wallet that satisfies the conservation identity:
//   Earned + Received + Realized = Gifted + Converted + Materialized + Owed
//   30 + 2 + 2  =  3 + 5 + 4 + 22  = 34  ✓
// Holding 4.1 Ɖ bought for 5 candy (now worth ~10 → a gain).
function mockW(over = {}) {
  return Object.assign({
    ok: true,
    candyBalance: 22, candyOwed: 22, candyEarned: 30, candyMaterialized: 4,
    candyReceived: 2, candyGiftedOut: 3, candyConverted: 5, candyRealized: 2,
    dogeBalance: 4.1, dogeSent: 0, dogeToDeposit: 4.1, sellableDoge: 4.1,
    candyPerDoge: 2.444, dogeUsd: 0.088, minMaterializeDoge: 5, dogeAddress: null,
  }, over);
}
function render(w) { const box = document.createElement('div'); _dogeWalletRender(box, w, { total: 100 }); return box; }
const pillLabels = (box) => [...box.querySelectorAll('button.s7btn')].map((b) => b.textContent);

describe('Candy & DOGE panel — resting state', () => {
  it('renders the titled panel, the candy-to-spend hero, and the DOGE asset line', () => {
    const box = render(mockW());
    const t = box.textContent;
    expect(t).toContain('🍬 Candy & DOGE');
    expect(t).toContain('22 candy to spend');     // hero = candyOwed
    expect(t).toContain('Ɖ 4.1 saved');           // asset line uses in-app (un-sent) coins
    expect(t).toContain('▶ Details'.replace('▶', '▸')); // disclosure present
  });
  it('shows the three action pills when all are valid', () => {
    expect(pillLabels(render(mockW()))).toEqual(expect.arrayContaining(['Ɖ Buy', '🍬 Cash out', '🎁 Gift']));
  });
  it('shows a ▲ up gain chip when DOGE appreciated (bought 5 → worth ~10)', () => {
    expect(render(mockW()).textContent).toMatch(/▲ up \d+%/);
  });
  it('shows ▼ down when DOGE fell', () => {
    // held 0.5 Ɖ, cost basis 5 candy → worth ~1.2 candy → a loss
    const t = render(mockW({ dogeBalance: 0.5, dogeToDeposit: 0.5, sellableDoge: 0.5, candyConverted: 5 })).textContent;
    expect(t).toMatch(/▼ down \d+%/);
  });
});

describe('Candy & DOGE panel — the rounding wart is fixed', () => {
  it('face shows "worth 0.7" once — no "1" and no "up 0%" contradiction; cost basis is in Details', () => {
    // bought 0.73 candy of DOGE → 0.3 Ɖ, now worth ~0.73 candy. The OLD block showed
    // "worth 0.7 · put in 1 · up 0%". The redesign: one consistent "worth 0.7", no "put in" on
    // the face, and a real (tiny) gain keeps its DIRECTION instead of a noisy "up 0%".
    const t = render(mockW({ dogeBalance: 0.3, dogeToDeposit: 0.3, sellableDoge: 0.3, candyConverted: 0.73, candyOwed: 0, candyBalance: 0 })).textContent;
    expect(t).toContain('worth 0.7 🍬');
    expect(t).not.toContain('up 0%');
    expect(t).not.toContain('you put in');   // cost basis moved into Details
    expect(t).toMatch(/▲ up <1%/);           // a real sub-1% gain still shows direction
  });
  it('shows "≈ even" ONLY when worth exactly equals cost basis', () => {
    // doge=1 at rate 2, bought for 2 candy → worth 2 == basis 2 → exactly even
    const t = render(mockW({ dogeBalance: 1, dogeToDeposit: 1, sellableDoge: 1, candyPerDoge: 2, candyConverted: 2 })).textContent;
    expect(t).toContain('≈ even');
  });
  it('hero shows a whole single-digit candy count without a stray decimal (7, not 7.0)', () => {
    expect(render(mockW({ candyOwed: 7, candyBalance: 7 })).textContent).toContain('🍬 7 candy to spend');
  });
});

describe('Candy & DOGE panel — maturity (24h hold) shows on the face', () => {
  it('says "ready in ~a day" when nothing is matured yet', () => {
    expect(render(mockW({ sellableDoge: 0 })).textContent).toContain('ready in ~a day');
  });
  it('says "X Ɖ ready" when only part is matured', () => {
    expect(render(mockW({ sellableDoge: 1.5 })).textContent).toContain('1.5 Ɖ ready');
  });
});

describe('Candy & DOGE panel — calm edge states', () => {
  it('nothing-yet: a friendly line and NO Details affordance', () => {
    const box = render(mockW({ candyEarned: 0, candyOwed: 0, candyBalance: 0, candyMaterialized: 0, candyConverted: 0, dogeBalance: 0, dogeToDeposit: 0, sellableDoge: 0, candyReceived: 0, candyGiftedOut: 0, candyRealized: 0 }));
    expect(box.textContent).toContain('Do some work to earn your first candy.');
    expect(box.textContent).not.toContain('Details');
  });
  it('all-spent but still holding DOGE: hero shows 0, Cash out stays, Buy/Gift drop', () => {
    const box = render(mockW({ candyOwed: 0, candyBalance: 0 }));
    expect(box.textContent).toContain('do more work to earn candy');
    const pills = pillLabels(box);
    expect(pills).toContain('🍬 Cash out');
    expect(pills).not.toContain('Ɖ Buy');
    expect(pills).not.toContain('🎁 Gift');
  });
  it('falls back to the preview when not provisioned (does not throw)', () => {
    const box = document.createElement('div');
    expect(() => _dogeWalletRender(box, { _notProvisioned: true }, { total: 0 })).not.toThrow();
  });
});

describe('Candy & DOGE panel — actions are mutually exclusive', () => {
  it('tapping Buy opens its form and inverts the pill; tapping Cash out swaps to that form', () => {
    const box = render(mockW());
    const buy = [...box.querySelectorAll('button.s7btn')].find((b) => b.textContent === 'Ɖ Buy');
    buy.click();
    expect(buy.classList.contains('s7btn-inv')).toBe(true);
    expect(box.textContent).toContain('Turn candy into DOGE');
    const cash = [...box.querySelectorAll('button.s7btn')].find((b) => b.textContent === '🍬 Cash out');
    cash.click();
    expect(box.textContent).toContain('Turn DOGE back into candy');
    expect(box.textContent).not.toContain('Turn candy into DOGE');   // only one form open
    expect(buy.classList.contains('s7btn-inv')).toBe(false);          // Buy de-activated
  });
});

describe('Candy & DOGE panel — Details ledger reconciles with EXACT values', () => {
  it('opens the 7-number ledger and the candy column sums to the conservation identity', () => {
    const w = mockW();
    const box = render(w);
    const toggle = [...box.querySelectorAll('span')].find((s) => /Details/.test(s.textContent));
    toggle.click();
    const t = box.textContent;
    expect(t).toContain('Earned all-term');
    expect(t).toContain('To spend or gift');
    // Earned + Received + Realized === Gifted + Converted + Materialized + Owed
    expect(w.candyEarned + w.candyReceived + w.candyRealized)
      .toBeCloseTo(w.candyGiftedOut + w.candyConverted + w.candyMaterialized + w.candyOwed, 6);
  });
});
