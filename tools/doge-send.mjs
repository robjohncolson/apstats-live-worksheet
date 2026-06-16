#!/usr/bin/env node
// doge-send.mjs — Phase-3 grade-sync batch DOGE sender (DOGE_WALLET_SPEC §10).
//
// Reads the teacher-gated GET /class/wallets, plans ONE batched `sendmany` from
// the LOCAL Dogecoin node to each kid's paper-wallet address (the DOGE they
// banked but you haven't sent yet), broadcasts it, then POSTs /wallet/mark-sent.
// The spending key stays in the node wallet — this tool never sees it.
//
// ⚠ DRY RUN BY DEFAULT. It plans + validates + checks the node balance but does
//    NOT broadcast. Pass --send to actually deposit real DOGE (deliberate, your
//    call — irreversible). Run the dry run first, every time.
//
// Needs: a running Dogecoin Core with RPC on (server=1 in dogecoin.conf, restart
// it). Env: TEACHER_SECRET (required), ROSTER_URL (default = prod roster).
//
// Usage:
//   node tools/doge-send.mjs                 # DRY RUN — plan only
//   node tools/doge-send.mjs --send          # broadcast (deliberate)
//   node tools/doge-send.mjs --max-per-kid 5 # cap each deposit (testing)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROSTER_URL_DEFAULT = 'https://roster-production-12c1.up.railway.app';
const CLI = process.env.DOGECOIN_CLI || 'C:\\Program Files\\Dogecoin\\daemon\\dogecoin-cli.exe';
const JOURNAL = '.doge-send-journal.json';   // crash-resilient idempotency (see main)
const FEE_BUFFER = 5;                         // DOGE headroom so the fee can't fail a tight send

const round8 = (n) => Math.round((Number(n) || 0) * 1e8) / 1e8;

// ── PURE: turn /class/wallets accounts into a batched send plan ───────────────
// Each recipient = a kid with dogeToDeposit > 0. Kids without a registered
// address are surfaced as `skip` (you must set their address first). Outputs are
// aggregated by address for a single `sendmany`.
export function planSends(accounts, { maxPerKid = Infinity } = {}) {
  const recipients = [];
  for (const a of (accounts || [])) {
    const owed = round8(a && a.dogeToDeposit);
    if (owed <= 0) continue;
    if (!a.dogeAddress) { recipients.push({ studentId: a.studentId, address: null, amount: owed, skip: 'no address registered' }); continue; }
    recipients.push({ studentId: a.studentId, address: a.dogeAddress, amount: round8(Math.min(owed, maxPerKid)) });
  }
  const sendable = recipients.filter((r) => r.address && r.amount > 0 && !r.skip);
  const outputs = {};
  for (const r of sendable) outputs[r.address] = round8((outputs[r.address] || 0) + r.amount);
  const total = round8(sendable.reduce((s, r) => s + r.amount, 0));
  return { recipients, sendable, outputs, total };
}

const cli = (...args) => execFileSync(CLI, args, { encoding: 'utf8' }).trim();
const argVal = (flag) => { const i = process.argv.indexOf(flag); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : null; };

async function main() {
  const doSend = process.argv.includes('--send');
  const rosterUrl = argVal('--roster-url') || process.env.ROSTER_URL || ROSTER_URL_DEFAULT;
  const secret = argVal('--secret') || process.env.TEACHER_SECRET;
  const maxPerKid = argVal('--max-per-kid') ? Number(argVal('--max-per-kid')) : Infinity;
  if (!secret) { console.error('Set TEACHER_SECRET (env) or --secret.'); process.exit(1); }

  // 0. CRASH-RESILIENT IDEMPOTENCY: the journal is written the instant sendmany
  // returns and deleted only when every mark-sent lands. Its presence means a
  // prior batch was broadcast but not fully reconciled (crash / Ctrl-C / power
  // loss / network drop). Re-broadcasting would DOUBLE-PAY, so refuse --send
  // until it's reconciled by hand (mark-sent the listed recipients, then delete it).
  if (doSend && existsSync(JOURNAL)) {
    console.error('\n⛔ UN-RECONCILED prior send — refusing to broadcast (would double-pay).');
    console.error('Journal ' + JOURNAL + ':\n' + readFileSync(JOURNAL, 'utf8'));
    console.error('Manually POST /wallet/mark-sent for the recipients above, delete ' + JOURNAL + ', then re-run.');
    process.exit(1);
  }

  // 1. fetch the disbursement state
  const res = await fetch(rosterUrl + '/class/wallets', { headers: { 'x-teacher-secret': secret } });
  if (res.status === 503) { console.error('roster says doge_wallet not provisioned — run migration 0019 first.'); process.exit(1); }
  if (!res.ok) { console.error('GET /class/wallets failed: HTTP ' + res.status); process.exit(1); }
  const data = await res.json();
  if (!data || !data.ok) { console.error('class/wallets error:', data && data.error); process.exit(1); }

  const plan = planSends(data.accounts, { maxPerKid });
  console.log(`\nDOGE to deposit — ${plan.sendable.length} recipient(s), total Ɖ ${plan.total}`);
  for (const r of plan.recipients) {
    if (r.skip) console.log(`  SKIP  ${r.studentId}: ${r.skip} (owed Ɖ ${r.amount})`);
    else console.log(`  SEND  ${r.address}  ←  Ɖ ${r.amount}  (${r.studentId})`);
  }
  if (!plan.sendable.length) { console.log('\nNothing to send.'); return; }

  // 2. validate every address + confirm the node covers the total (needs RPC up)
  let nodeOk = true;
  try {
    const chain = JSON.parse(cli('getblockchaininfo')).chain;
    if (chain !== 'main') { console.error(`\nnode is on chain '${chain}', not mainnet — ABORTING (wrong-chain coins are lost).`); process.exit(1); }
    for (const r of plan.sendable) {
      const v = JSON.parse(cli('validateaddress', r.address));
      if (!v.isvalid) { console.error(`\nINVALID address ${r.address} (${r.studentId}) — ABORTING (no broadcast).`); process.exit(1); }
    }
    const bal = parseFloat(cli('getbalance'));
    console.log(`\nnode balance: Ɖ ${bal}  ·  needed: Ɖ ${plan.total} + ~fee (buffer Ɖ ${FEE_BUFFER})`);
    if (bal < plan.total + FEE_BUFFER) { console.error('node balance below total + fee buffer — ABORTING.'); process.exit(1); }
  } catch (e) {
    nodeOk = false;
    console.error('\n⚠ Dogecoin node RPC unavailable: ' + ((e && e.message) || e));
    console.error('  Restart Dogecoin Core (dogecoin.conf has server=1) so dogecoin-cli works, then re-run.');
  }

  if (!doSend) { console.log('\nDRY RUN — nothing broadcast. Re-run with --send to deposit for real.'); return; }
  if (!nodeOk) { console.error('\nCannot --send without the node. Aborting.'); process.exit(1); }

  // 3. broadcast ONE batched tx, JOURNAL it immediately, then mark each sent.
  console.log('\nBroadcasting sendmany …');
  const txid = cli('sendmany', '', JSON.stringify(plan.outputs));
  // Journal BEFORE any mark — a crash here is now recoverable (the next run
  // refuses), not a silent double-send.
  writeFileSync(JOURNAL, JSON.stringify({
    txid, ts: new Date().toISOString(),
    recipients: plan.sendable.map((r) => ({ studentId: r.studentId, amount: r.amount })),
  }, null, 2));
  console.log('✓ txid: ' + txid + '  (journaled → ' + JOURNAL + ')');

  const unmarked = [];
  for (const r of plan.sendable) {
    try {
      const m = await fetch(rosterUrl + '/wallet/mark-sent', {
        method: 'POST',
        headers: { 'x-teacher-secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: r.studentId, amount: r.amount }),
      });
      if (m.status !== 200) unmarked.push(r);
    } catch (_) { unmarked.push(r); }
  }
  if (unmarked.length) {
    console.error('\n⚠ DOGE WAS SENT (tx ' + txid + ') but mark-sent FAILED for:');
    unmarked.forEach((r) => console.error(`    ${r.studentId}  Ɖ ${r.amount}`));
    console.error('  Journal kept (' + JOURNAL + '). Manually POST /wallet/mark-sent for these, delete the journal,');
    console.error('  then re-run — re-running now is REFUSED to prevent a double-send.');
    process.exit(1);
  }
  unlinkSync(JOURNAL);   // fully reconciled — safe to clear
  console.log('\n✓ Done — sent + marked ' + plan.sendable.length + ' recipient(s).');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => {
  console.error('ERROR:', (e && e.message) || e);
  // If a broadcast already happened, NEVER exit bare — surface the journal so the
  // operator reconciles before any re-run.
  if (existsSync(JOURNAL)) console.error('⚠ An un-reconciled broadcast journal exists (' + JOURNAL + ') — reconcile it before --send again.');
  process.exit(1);
});
