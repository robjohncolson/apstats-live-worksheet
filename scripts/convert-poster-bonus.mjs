#!/usr/bin/env node
// Convert every banked BONUS-POSTER-U{n} row into a POSTER-U{n} ledger row (server does the work).
// node scripts/convert-poster-bonus.mjs [--apply] [--section PeriodB] [--url U] [--secret S]
// Dry run by default: the server previews the conversion without writing or deleting anything.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickConfigUrl } from './teacher-roster.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_URL = 'https://roster-production-12c1.up.railway.app';

export function parseConvertArgs(argv) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') { options.apply = true; continue; }
    if (arg === '--url' || arg === '--secret' || arg === '--section') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('missing value for ' + arg);
      options[arg.slice(2)] = argv[++i];
      continue;
    }
    throw new Error('usage: convert-poster-bonus.mjs [--apply] [--section PeriodB] [--url U] [--secret S]');
  }
  return options;
}

export function formatConvertAudit(result) {
  const lines = [];
  for (const row of result.converted || []) {
    lines.push(`${String(row.username || row.studentId || '').padEnd(20)} U${row.unit} ${row.grade} -> ${row.score}`);
  }
  lines.push(`${(result.converted || []).length} row(s) converted, ${result.deleted ?? 0} bonus row(s) deleted, ` +
    `${result.remainingBonusPosterRows ?? '?'} BONUS-POSTER- row(s) remaining` +
    (result.dryRun ? ' (dry run)' : ''));
  return lines.join('\n');
}

function readFileSafe(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function resolveSecret(flag) {
  if (flag) return flag;
  if (process.env.ROSTER_TEACHER_SECRET) return process.env.ROSTER_TEACHER_SECRET;
  const env = readFileSafe(resolve(REPO_ROOT, 'roster-server', '.env'));
  const match = env && env.match(/^ROSTER_TEACHER_SECRET\s*=\s*(.+)\s*$/m);
  return match ? match[1].trim() : null;
}

function resolveUrl(flag) {
  if (flag) return flag.replace(/\/+$/, '');
  if (process.env.ROSTER_SERVICE_URL) return process.env.ROSTER_SERVICE_URL.replace(/\/+$/, '');
  return pickConfigUrl(readFileSafe(resolve(REPO_ROOT, 'roster_config.js'))) || DEFAULT_URL;
}

async function main(argv) {
  const options = parseConvertArgs(argv);
  const secret = resolveSecret(options.secret);
  if (!secret) throw new Error('no teacher secret (roster-server/.env or ROSTER_TEACHER_SECRET)');
  const url = resolveUrl(options.url);
  const headers = { 'Content-Type': 'application/json', 'x-teacher-secret': secret };
  const body = { dryRun: !options.apply };
  if (options.section) body.section = options.section;
  const response = await fetch(`${url}/class/poster/convert`, { method: 'POST', headers, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error('class/poster/convert failed: ' + (result.error || response.status) +
      ' (server may not support poster rows yet; nothing was converted)');
  }
  console.log(formatConvertAudit(result));
  if (result.errors?.length) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  }
  if (!options.apply) {
    console.log('Dry run. Re-run with --apply to write POSTER- rows and delete the bonus rows.');
    return;
  }
  if (result.remainingBonusPosterRows > 0) {
    console.error(`${result.remainingBonusPosterRows} BONUS-POSTER- row(s) survived; the bank would double count.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
