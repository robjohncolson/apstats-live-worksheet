// wallet-model-emit-cases.mjs — Layer C oracle emitter (WALLET_CONSERVATION_AUDIT_SPEC.md
// Layer C). Mirrors tools/grade-model-emit-cases.mjs: a DETERMINISTIC PRNG drives random
// wallet trajectories through the REAL JS reducer (tests/fixtures/wallet-world.js), then
// emits, per student, the accepted op stream + the JS-computed final columns as the oracle
// → formal/wallet-model/cases.json. crosscheck.rkt replays each stream through the Redex
// model and asserts the columns + the 7-number identity agree (exact rationals vs JS float).
//
// Run:  node roster-server/tools/wallet-model-emit-cases.mjs
// Then: (PowerShell) racket formal/wallet-model/crosscheck.rkt

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initState, applyOp, studentIds, dogeFromCandy, candyPerDoge } from '../tests/fixtures/wallet-world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', '..', 'formal', 'wallet-model', 'cases.json');

// Same LCG as grade-model-emit-cases.mjs (Date.now/Math.random are avoided for reproducibility).
function makePrng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
const rng = makePrng(0x5eedda6e);
const rand = (lo, hi) => lo + (hi - lo) * rng();
const r4 = (lo, hi) => Math.round(rand(lo, hi) * 10000) / 10000;   // 4-dp so JSON stays exact-ish
const ri = (lo, hi) => Math.floor(rand(lo, hi + 1));

const K = 3;
const SIDS = studentIds(K);
const NUM_TRAJ = 400;
const KINDS = ['earn', 'buy', 'sell', 'gift', 'markGiven', 'markSent'];
const cases = [];

for (let t = 0; t < NUM_TRAJ; t++) {
  const initEarned = Array.from({ length: K }, () => r4(0, 80));
  let state = initState(initEarned);
  // Each student's Redex op stream starts by re-creating the endowment (model starts at 0).
  const streams = SIDS.map((_, i) => [['earn', initEarned[i]]]);
  const push = (sid, ev) => streams[SIDS.indexOf(sid)].push(ev);

  const nOps = ri(2, 24);
  for (let k = 0; k < nOps; k++) {
    const i = ri(0, K - 1);
    const sid = SIDS[i];
    const kind = KINDS[ri(0, KINDS.length - 1)];
    let op, events = [];
    if (kind === 'earn') {
      const c = r4(0.1, 30); op = { op: 'earn', sid, candy: c }; events = [[sid, ['earn', c]]];
    } else if (kind === 'buy') {
      const c = r4(0.1, 30), price = r4(0.02, 0.5), age = ri(0, 72), coins = dogeFromCandy(c, price);
      op = { op: 'buy', sid, candy: c, price, ageHours: age }; events = [[sid, ['buy', c, coins]]];
    } else if (kind === 'sell') {
      const d = r4(0.1, 40), price = r4(0.02, 0.5);
      op = { op: 'sell', sid, doge: d, price, holdHours: 24 }; events = [[sid, ['sell', d, candyPerDoge(price)]]];
    } else if (kind === 'gift') {
      const j = ri(0, K - 1), to = SIDS[(i + 1 + (j % (K - 1))) % K], c = ri(1, 25);
      op = { op: 'gift', from: sid, to, candy: c }; events = [[sid, ['gift-out', c]], [to, ['gift-in', c]]];
    } else if (kind === 'markGiven') {
      const a = r4(0.1, 30); op = { op: 'markGiven', sid, amount: a }; events = [[sid, ['mark-given', a]]];
    } else {
      const a = r4(0.1, 40); op = { op: 'markSent', sid, amount: a }; events = [[sid, ['mark-sent', a]]];
    }
    const res = applyOp(state, op);
    if (res.accepted) for (const [s, ev] of events) push(s, ev);   // model only sees accepted ops
    state = res.state;
  }

  // One oracle case per student: accepted stream + final [E,R,Z,G,C,M,Bal,Sent].
  SIDS.forEach((sid, i) => {
    const a = state.acc.get(sid);
    cases.push({
      ops: streams[i],
      expected: [state.earned.get(sid), a.candy_gifted_in, a.candy_realized, a.candy_gifted_out, a.doge_cost_basis, a.candy_given, a.doge_balance, a.doge_sent],
    });
  });
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(cases)}\n`);
console.log(`Wrote ${cases.length} cases to formal/wallet-model/cases.json`);
