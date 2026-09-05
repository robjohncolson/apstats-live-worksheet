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
// it). Env: TEACHER_SECRET (required), ROSTER_URL (default = prod roster),
// DOGE_CLI (optional path; defaults to dogecoin-cli on PATH), DOGE_SOURCE_ACCOUNT
// (optional legacy account name; defaults to Core's empty account).
//
// Usage:
//   node tools/doge-send.mjs                 # DRY RUN — plan only
//   node tools/doge-send.mjs --send          # broadcast (deliberate)
//   node tools/doge-send.mjs --max-per-kid 5 # cap each deposit (testing)
//   node tools/doge-send.mjs --doge-cli /opt/dogecoin/bin/dogecoin-cli

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  DOGE_SEND_ERROR,
  createFileJournal,
  executeSendPlan,
  planSends,
} from './lib/doge-send-core.mjs';

export { planSends } from './lib/doge-send-core.mjs';

const ROSTER_URL_DEFAULT = 'https://roster-production-12c1.up.railway.app';
const JOURNAL = '.doge-send-journal.json';   // crash-resilient idempotency (see main)
const FEE_BUFFER = 5;                         // DOGE headroom so the fee can't fail a tight send

const argVal = (flag) => { const i = process.argv.indexOf(flag); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : null; };
const cliBinary = argVal('--doge-cli')
  || process.env.DOGE_CLI
  || process.env.DOGECOIN_CLI
  || 'dogecoin-cli';
const runCli = (...args) => execFileSync(cliBinary, args, { encoding: 'utf8' }).trim();
const journal = createFileJournal(JOURNAL);

// Kept here as grep-visible documentation for the unchanged safety contract:
// the durable core replaces writeFileSync(JOURNAL, ...) atomically and the
// wrapper only calls unlinkSync(JOURNAL) after every mark has succeeded.

async function main() {
  const doSend = process.argv.includes('--send');
  const rosterUrl = argVal('--roster-url') || process.env.ROSTER_URL || ROSTER_URL_DEFAULT;
  const secret = argVal('--secret') || process.env.TEACHER_SECRET;
  const maxPerKid = argVal('--max-per-kid') ? Number(argVal('--max-per-kid')) : Infinity;
  if (!secret) { console.error('Set TEACHER_SECRET (env) or --secret.'); process.exit(1); }

  // 0. CRASH-RESILIENT IDEMPOTENCY: an intent is journaled before sendmany and
  // its txid is journaled the instant sendmany returns. The file is deleted
  // only after every mark-sent lands. Any journal means broadcast state must be
  // reconciled before another live run.
  if (doSend && journal.exists()) {
    const journalText = journal.readText();
    console.error('\n⛔ UN-RECONCILED prior send — refusing to broadcast (would double-pay).');
    console.error('Journal ' + JOURNAL + ' exists; contents withheld from logs.');

    try {
      const prior = JSON.parse(journalText);
      const txid = typeof prior.txid === 'string' && /^[0-9a-f]{64}$/i.test(prior.txid)
        ? prior.txid.toLowerCase()
        : null;

      if (prior && prior.kind === 'apstats-doge-payout') {
        console.error('This journal belongs to the DOGE payout agent.');
        if (txid) console.error('Payout txid: ' + txid);
        console.error('Leave it intact and let tools/doge-payout-agent.mjs recover it. If recovery blocks, follow the payout batch reconciliation workflow.');
      } else if (txid) {
        console.error('Verify tx ' + prior.txid + ', reconcile its mark-sent recipients, then delete ' + JOURNAL + '.');
      } else {
        console.error('The journal has an intent but no txid. Treat broadcast state as unknown and investigate it before deleting ' + JOURNAL + '.');
      }
    } catch (_) {
      console.error('The journal is not recognized. Do not overwrite it; investigate it before deleting ' + JOURNAL + '.');
    }

    process.exitCode = 1;
    return;
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

  // 2. validate, then optionally broadcast through the injected core engine.
  let execution;
  try {
    execution = await executeSendPlan(plan, {
      runCli,
      dryRun: !doSend,
      feeBuffer: FEE_BUFFER,
      sourceAccount: process.env.DOGE_SOURCE_ACCOUNT,
      journal,
      onValidated: ({ balance, sourceAccount }) => {
        // The core enforces chain !== 'main', runs validateaddress for every
        // recipient, and checks balance against plan.total + FEE_BUFFER.
        console.log(`\nsource account: ${JSON.stringify(sourceAccount)} · available: Ɖ ${balance} · needed: Ɖ ${plan.total} + ~fee (buffer Ɖ ${FEE_BUFFER})`);
      },
      onBeforeBroadcast: () => console.log('\nBroadcasting sendmany …'),
    });
  } catch (error) {
    if (error && error.code === DOGE_SEND_ERROR.WRONG_CHAIN) {
      console.error(`\nnode is on chain '${error.chain}', not mainnet — ABORTING (wrong-chain coins are lost).`);
      process.exitCode = 1;
      return;
    }

    if (error && error.code === DOGE_SEND_ERROR.INVALID_ADDRESS) {
      console.error(`\nINVALID address ${error.address} (${error.studentId}) — ABORTING (no broadcast).`);
      process.exitCode = 1;
      return;
    }

    if (error && error.code === DOGE_SEND_ERROR.INSUFFICIENT_FLOAT) {
      console.error('source account or wallet balance below total + fee buffer — ABORTING.');
      process.exitCode = 1;
      return;
    }

    const nodeUnavailable = error && (
      error.code === DOGE_SEND_ERROR.CLI_UNAVAILABLE
      || error.code === DOGE_SEND_ERROR.CLI_RESPONSE
    );
    if (nodeUnavailable) {
      console.error('\n⚠ Dogecoin node RPC unavailable: ' + error.message);
      console.error('  Restart Dogecoin Core (dogecoin.conf has server=1) so dogecoin-cli works, then re-run.');

      if (!doSend) {
        console.log('\nDRY RUN — nothing broadcast. Re-run with --send to deposit for real.');
        return;
      }
    } else {
      console.error('\nERROR: ' + ((error && error.message) || error));
    }

    if (journal.exists()) {
      console.error('⚠ An un-reconciled broadcast journal exists (' + JOURNAL + ') — reconcile it before --send again.');
    }
    process.exitCode = 1;
    return;
  }

  if (execution.status === 'dry-run') {
    console.log('\nDRY RUN — nothing broadcast. Re-run with --send to deposit for real.');
    return;
  }

  // 3. the txid is already durable; only now reconcile each server-side mark.
  const txid = execution.txid;
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
  journal.clear();   // fully reconciled — safe to clear
  console.log('\n✓ Done — sent + marked ' + plan.sendable.length + ' recipient(s).');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((e) => {
  console.error('ERROR:', (e && e.message) || e);
  // If a broadcast already happened, NEVER exit bare — surface the journal so the
  // operator reconciles before any re-run.
  if (journal.exists()) console.error('⚠ An un-reconciled broadcast journal exists (' + JOURNAL + ') — reconcile it before --send again.');
  process.exit(1);
});
