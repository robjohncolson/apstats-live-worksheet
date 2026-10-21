#!/usr/bin/env node
// rotate-at-rest-keys.mjs — re-encrypt the two columns that are sealed with a
// Railway secret, so the secret can be rotated without losing what it protects:
//
//   roster.password_cipher     sealed with ROSTER_PW_ENC_KEY  (teacher PIN recovery)
//   doge_account.doge_wif_enc  sealed with WALLET_KEY_SECRET  (custodial DOGE keys)
//
// Reads the Supabase URL + service key from roster-server/.env (never the CLI).
// Old and new secrets come from the environment only:
//
//   OLD_PW_ENC_KEY / NEW_PW_ENC_KEY           (omit the pair to skip passwords)
//   OLD_WALLET_SECRET / NEW_WALLET_SECRET     (omit the pair to skip wallets)
//
// Dry run by default: decrypts every row with the OLD secret and reports how many
// are readable. --apply writes the re-sealed rows. Run it right BEFORE the server
// switches to the new secret; a row the old secret cannot open is left untouched
// (it re-seals itself the next time that value is written).
//
//   OLD_WALLET_SECRET=... NEW_WALLET_SECRET=... node scripts/rotate-at-rest-keys.mjs
//   OLD_WALLET_SECRET=... NEW_WALLET_SECRET=... node scripts/rotate-at-rest-keys.mjs --apply

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { encryptPassword, decryptPassword, encryptWalletWif, decryptWalletWif } from '../crypto.js';

const APPLY = process.argv.includes('--apply');
const here = dirname(fileURLToPath(import.meta.url));

function readDotEnv() {
  const text = readFileSync(join(here, '..', '.env'), 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// crypto.js reads its key from process.env at call time, so each step sets the
// env var it needs and restores it afterwards.
function withEnv(name, value, fn) {
  const before = process.env[name];
  process.env[name] = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

async function rotateColumn({ db, table, idColumn, column, envName, oldSecret, newSecret, decrypt, encrypt }) {
  const { data, error } = await db.from(table).select(`${idColumn}, ${column}`).not(column, 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);

  let readable = 0;
  let unreadable = 0;
  let written = 0;
  for (const row of data) {
    const plain = withEnv(envName, oldSecret, () => decrypt(row[column]));
    if (plain == null) {
      unreadable++;
      continue;
    }
    readable++;
    if (!APPLY) continue;

    const resealed = withEnv(envName, newSecret, () => encrypt(plain));
    if (!resealed) throw new Error(`${table}: could not re-seal ${idColumn}=${row[idColumn]}`);
    const check = withEnv(envName, newSecret, () => decrypt(resealed));
    if (check !== plain) throw new Error(`${table}: round-trip mismatch for ${idColumn}=${row[idColumn]}`);

    const upd = await db.from(table).update({ [column]: resealed }).eq(idColumn, row[idColumn]);
    if (upd.error) throw new Error(`${table}: update ${idColumn}=${row[idColumn]}: ${upd.error.message}`);
    written++;
  }
  console.log(`${table}.${column}: ${data.length} sealed rows, ${readable} readable with the old secret, ${unreadable} not; ${APPLY ? written + ' re-sealed' : 'dry run, nothing written'}`);
}

async function main() {
  const env = readDotEnv();
  if (!env.ROSTER_SUPABASE_URL || !env.ROSTER_SUPABASE_SERVICE_KEY) {
    throw new Error('roster-server/.env must hold ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY');
  }
  const db = createClient(env.ROSTER_SUPABASE_URL, env.ROSTER_SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  const jobs = [];
  if (process.env.OLD_PW_ENC_KEY && process.env.NEW_PW_ENC_KEY) {
    jobs.push(rotateColumn({
      db, table: 'roster', idColumn: 'student_id', column: 'password_cipher', envName: 'ROSTER_PW_ENC_KEY',
      oldSecret: process.env.OLD_PW_ENC_KEY, newSecret: process.env.NEW_PW_ENC_KEY,
      decrypt: decryptPassword, encrypt: encryptPassword,
    }));
  }
  if (process.env.OLD_WALLET_SECRET && process.env.NEW_WALLET_SECRET) {
    jobs.push(rotateColumn({
      db, table: 'doge_account', idColumn: 'student_id', column: 'doge_wif_enc', envName: 'WALLET_KEY_SECRET',
      oldSecret: process.env.OLD_WALLET_SECRET, newSecret: process.env.NEW_WALLET_SECRET,
      decrypt: decryptWalletWif, encrypt: encryptWalletWif,
    }));
  }
  if (jobs.length === 0) {
    throw new Error('nothing to do: set OLD_PW_ENC_KEY+NEW_PW_ENC_KEY and/or OLD_WALLET_SECRET+NEW_WALLET_SECRET');
  }
  for (const job of jobs) await job;
  console.log(APPLY ? 'APPLIED' : 'DRY RUN');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
