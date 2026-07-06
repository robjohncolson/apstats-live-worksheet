// Smoke: do source='trainer' rows reach item_ledger through /ledger/record?
//
//   node scripts/smoke-trainer-ledger.mjs <username> <pin>
//
// Signs in via /roster/verify, POSTs one zero-score trainer row
// (TI84-SMOKE-0016, attempt 1 — upserts over itself on re-runs), and reports:
//   200 + ok      → migration 0016 live, evidence path open
//   503           → 0016 not applied to this database
//   anything else → inspect output
//
// First verified live on production 2026-07-06 (HTTP 200 + signed receipt).
// The smoke row is grade-inert (trainer rows carry no engine weight unless
// grade-config trainerWeight > 0, and TI84-SMOKE-0016 maps to no lesson).
const BASE = process.env.ROSTER_SERVER_URL || 'https://roster-production-12c1.up.railway.app';

const [username, pin] = process.argv.slice(2);

if (!username || !pin) {
  console.error('usage: node scripts/smoke-trainer-ledger.mjs <username> <pin>');
  process.exit(1);
}

const verify = await fetch(`${BASE}/roster/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password: pin }),
});
const session = await verify.json().catch(() => ({}));

if (!verify.ok || !session.token) {
  console.error(`verify failed: HTTP ${verify.status}`, JSON.stringify(session));
  process.exit(1);
}

console.log(`signed in as ${session.username} (${session.section})`);

const record = await fetch(`${BASE}/ledger/record`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: session.token,
    source: 'trainer',
    itemId: 'TI84-SMOKE-0016',
    response: { smoke: true, note: 'trainer write-path probe (safe to delete)' },
    score: 0,
    attempt: 1,
  }),
});
const body = await record.json().catch(() => ({}));
console.log(`record: HTTP ${record.status}`, JSON.stringify(body));

if (record.status === 503) {
  console.log('VERDICT: migration 0016 NOT applied — trainer writes are blocked.');
} else if (record.ok && body.ok) {
  console.log(`VERDICT: trainer evidence path OPEN (ledgerId ${body.ledgerId}, tier ${body.evidenceTier}).`);
} else {
  console.log('VERDICT: inconclusive — see output above.');
}
