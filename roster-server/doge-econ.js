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
export const MIN_CONVERSION_CANDY = 25;   // floor so a DOGE buy clears the dust/fee

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

// Spend `candy` candies → this many DOGE coins, at the live price.
export function dogeFromCandy(candy, dogeUsd) {
  const rate = candyPerDoge(dogeUsd);
  const c = Number(candy);
  if (rate <= 0 || !isFinite(c) || c <= 0) return 0;
  return c / rate;
}

// Candy's plain dollar value (candy is the stable reserve).
export function usdFromCandy(candy) {
  const c = Number(candy);
  return (isFinite(c) && c > 0) ? c * CANDY_USD : 0;
}
