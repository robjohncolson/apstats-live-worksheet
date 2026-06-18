// doge-econ.js — DOGE Effort Wallet frozen economics (DOGE_WALLET_SPEC §4).
//
// Mirrors js/wallet_logic.js WALLET_POINTS / DOGE_WALLET exactly. roster-server
// is self-contained (can't import ../js), so these FROZEN constants are
// duplicated here — keep the two in sync if the peg ever changes (it shouldn't).
//
//   effort points → CANDY   : FIXED (36 pts = 1 candy = $0.036)
//   CANDY → DOGE             : FLOATS with the live price (buy early = cheaper)

const EFFORT_POINTS = {
  curriculum_quiz: 10, pc: 10, frq: 5, blooket: 4,
  worksheet: 3, quiz_review: 2, quiz_exception: 2, trainer: 1,
};
export const POINTS_PER_CANDY = 36;
export const CANDY_USD = 0.036;
export const MIN_CONVERSION_CANDY = 5;    // fallback floor when no live price; the real floor is minConvertCandy() = 1 DOGE's worth
export const MIN_MATERIALIZE_DOGE = 5;    // in-app DOGE only goes ON-CHAIN once a student has banked ≥ this many (batch sends, no dust)
export const DAILY_GIFT_CAP = 20;         // max candy a kid can gift OUT per rolling 24h (anti-farming/coercion; DOGE_GIFTING_SPEC §8)
export const SELL_HOLD_HOURS = 24;        // DOGE → candy cash-out: coins must be held ≥ this many hours (SELL_DOGE_SPEC; anti-churn "overnight hold")

export function effortPointsFor(source, itemId) {
  if (source === 'quiz_verdict' || source === 'quiz_answer') return 0;
  if (itemId && /^BL-.*-DESK_DONE$/i.test(itemId)) return 4;
  return EFFORT_POINTS[source] != null ? EFFORT_POINTS[source] : 1;
}

// Per-student EFFORT from their ledger rows → { points, candy }. Counts only the
// receipt-carrying rows the student's wallet sees (fetchReceipts filters on
// receipt_compact), deduped by source|item_id — so the teacher total matches the
// kid's wallet number exactly.
export function computeEffort(ledgerRows) {
  const rows = Array.isArray(ledgerRows) ? ledgerRows : [];
  const seen = new Set();
  let points = 0;
  for (const r of rows) {
    if (!r || !r.receipt_compact) continue;
    const key = (r.source || '') + '|' + (r.item_id || '');
    if (seen.has(key)) continue;
    seen.add(key);
    points += effortPointsFor(r.source, r.item_id);
  }
  return { points, candy: points / POINTS_PER_CANDY };
}

// How many candy it costs to buy 1 DOGE at the given live price (FLOATS).
export function candyPerDoge(dogeUsd) {
  const d = Number(dogeUsd);
  if (!isFinite(d) || d <= 0) return 0;
  return d / CANDY_USD;
}

// The minimum candy a student must commit to convert to DOGE = exactly 1 DOGE's worth at
// the live price (FLOATS with DOGE/USD). So a student with as little as ~2.4 candy (at
// DOGE≈$0.088) can start banking fractional DOGE; sub-1-DOGE buys are blocked so the in-app
// balance grows toward the MIN_MATERIALIZE_DOGE on-chain send floor. Falls back to the
// fixed floor only when there's no live price.
export function minConvertCandy(dogeUsd) {
  const cpd = candyPerDoge(dogeUsd);
  return cpd > 0 ? cpd : MIN_CONVERSION_CANDY;
}

// Spend `candy` candies → this many DOGE coins, at the live price.
export function dogeFromCandy(candy, dogeUsd) {
  const rate = candyPerDoge(dogeUsd);
  const c = Number(candy);
  if (rate <= 0 || !isFinite(c) || c <= 0) return 0;
  return c / rate;
}

// Cash `doge` coins back → this many candy, at the live price (the REVERSE of dogeFromCandy;
// SELL_DOGE_SPEC). Honest P&L: pays the full live rate regardless of cost basis, so an
// appreciated coin returns more candy than it cost and a depreciated one returns less.
export function candyFromDoge(doge, dogeUsd) {
  const rate = candyPerDoge(dogeUsd);
  const d = Number(doge);
  if (rate <= 0 || !isFinite(d) || d <= 0) return 0;
  return d * rate;
}

// Candy's plain dollar value (candy is the stable reserve).
export function usdFromCandy(candy) {
  const c = Number(candy);
  return (isFinite(c) && c > 0) ? c * CANDY_USD : 0;
}
