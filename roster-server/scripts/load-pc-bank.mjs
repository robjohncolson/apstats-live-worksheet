// load-pc-bank.mjs — out-of-band loader for the CB-secure PC26 banks into the
// private `pc_bank` Supabase table (PC_MAKEUP_DELIVERY_SPEC.md Phase 1).
//
// The banks live OUTSIDE this repo (school/apstatsy2627u{1,2,5}pc/) — CB-secure,
// never committed. This script READS them locally and UPSERTS them into pc_bank.
// The script itself carries no PC content, so it is safe to commit.
//
// Part model:
//   A    = mid-unit MCQ Part A          (U1, U2 only)
//   REST = end-of-unit remainder        (U1/U2: MCQ-B + MCQ-C + FRQ ; U5: MCQ-A + FRQ)
//
// Run (env must be set — same creds the roster-server uses):
//   ROSTER_SUPABASE_URL=... ROSTER_SUPABASE_SERVICE_KEY=... \
//     node roster-server/scripts/load-pc-bank.mjs [--school <dir>] [--dry-run]

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const schoolArg = args.indexOf('--school');
// Default: the sibling `school/` dir two levels up from roster-server/scripts/.
const SCHOOL = schoolArg >= 0 ? args[schoolArg + 1] : resolve(__dirname, '../../..');

const UNITS = [1, 2, 5];

function bankPath(u) {
  return resolve(SCHOOL, `apstatsy2627u${u}pc/extracted/unit${u}-pc-bank.v2.json`);
}
function itemsOf(parts, key) {
  return (parts && parts[key] && Array.isArray(parts[key].items)) ? parts[key].items : [];
}

function buildRows() {
  const rows = [];
  for (const u of UNITS) {
    const p = bankPath(u);
    if (!existsSync(p)) { console.warn(`SKIP U${u}: bank not found at ${p}`); continue; }
    const parts = JSON.parse(readFileSync(p, 'utf8')).parts || {};
    const A = itemsOf(parts, 'MCQ-A');
    const B = itemsOf(parts, 'MCQ-B');
    const C = itemsOf(parts, 'MCQ-C');
    const F = itemsOf(parts, 'FRQ');
    if (u === 5) {
      // U5 is a single end-of-unit administration: everything lands in REST.
      rows.push({ unit: u, part: 'REST', payload: { items: [...A, ...F] } });
    } else {
      rows.push({ unit: u, part: 'A', payload: { items: A } });
      rows.push({ unit: u, part: 'REST', payload: { items: [...B, ...C, ...F] } });
    }
  }
  return rows;
}

// FRQ/MCQ typing is explicit; an MCQ without a key is a defect that would score
// null at runtime and silently drop out of the PC denominator. Refuse to upload
// such a bank (pass --force to override, deliberately).
export function validateBankItems(rows) {
  const defects = [];
  for (const r of rows) {
    for (const item of (r.payload && r.payload.items) || []) {
      const id = String(item && item.id || '(no id)');
      const type = String(item && item.type || '').toLowerCase();
      const isFrq = type === 'free-response' || type === 'frq' || /-FRQ-/.test(id);
      const isMcq = type === 'multiple-choice' || type === 'mcq' || /-MCQ-/.test(id);
      if (!isFrq && !isMcq) { defects.push(`U${r.unit} ${r.part} ${id}: type "${item && item.type}" is neither MCQ nor FRQ`); continue; }
      if (isFrq && isMcq) { defects.push(`U${r.unit} ${r.part} ${id}: type and id disagree (FRQ vs MCQ)`); continue; }
      if (isMcq && (item.answer === null || item.answer === undefined || item.answer === '')) {
        defects.push(`U${r.unit} ${r.part} ${id}: MCQ has no answer key`);
      }
      if (isFrq && item.answer != null && item.answer !== '') {
        defects.push(`U${r.unit} ${r.part} ${id}: FRQ carries an MCQ-style answer (should be rubric/solution only)`);
      }
    }
  }
  return defects;
}

async function main() {
  const rows = buildRows();
  const defects = validateBankItems(rows);
  if (defects.length) {
    console.error(`BANK DEFECTS (${defects.length}) — FRQ/MCQ typing must be explicit and MCQs must be keyed:`);
    defects.forEach((d) => console.error('  - ' + d));
    if (!args.includes('--force')) { console.error('Refusing to upload. Fix the bank or pass --force.'); process.exit(2); }
    console.warn('--force: uploading despite defects.');
  }
  console.log('Rows to upsert (unit/part/count):');
  for (const r of rows) console.log(`  U${r.unit} ${r.part}: ${r.payload.items.length} items`);
  if (DRY) { console.log('\n--dry-run: nothing written.'); return; }

  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('ERROR: set ROSTER_SUPABASE_URL + ROSTER_SUPABASE_SERVICE_KEY'); process.exit(1); }
  const client = createClient(url, key);

  const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await client.from('pc_bank').upsert(stamped, { onConflict: 'unit,part' });
  if (error) { console.error('UPSERT FAILED:', error.message || error); process.exit(1); }
  console.log(`\nOK — upserted ${rows.length} pc_bank rows.`);
}

// Only run when invoked directly (tests import validateBankItems).
const _direct = (() => { try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (_) { return false; } })();
if (_direct) main().catch((e) => { console.error(e); process.exit(1); });
