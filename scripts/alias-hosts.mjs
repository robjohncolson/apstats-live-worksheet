#!/usr/bin/env node
// scripts/alias-hosts.mjs — rewrite every hardcoded Railway hostname to <service>.<domain>.
//
// Why: HETZNER_MIGRATION_SPEC §0 — the frontends must never hardcode a host we rent. Once the
// teacher picks a domain, every `*.up.railway.app` reference across the three school repos
// becomes a name on OUR domain, so the next hosting move is a DNS change, not a codemod.
//
//   node scripts/alias-hosts.mjs --domain <d>              dry run: prints the plan, writes nothing
//   node scripts/alias-hosts.mjs --domain <d> --apply      rewrites the files in place
//   node scripts/alias-hosts.mjs --domain <d> --json       prints the plan as JSON
//   node scripts/alias-hosts.mjs --inventory               writes scripts/alias-hosts.inventory.json
//   node scripts/alias-hosts.mjs --domain <d> --include-md also rewrites Markdown (off by default:
//                                                          specs and docs record the old hosts as history)
//
// Only the HOST is replaced; the scheme (https://, wss://) and path stay as they are. Hosts the
// map does not know ("unmapped") are reported and never rewritten. Line endings (CRLF in most
// worksheets) and a UTF-8 BOM survive because the file is edited as a string and written back
// exactly as decoded.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST_MAP = {
  'roster-production-12c1.up.railway.app': 'roster',       // apstats-roster (follow-alongs/roster-server)
  'curriculumrender-production.up.railway.app': 'cr',      // curriculum_render/railway-server
  'a2-live-worksheets-production.up.railway.app': 'a2',    // algebra2-live-worksheet/roster-server
  'lrsl-driller-production.up.railway.app': 'lrsl',        // lrsl-driller
  'shared-grading-proxy-production.up.railway.app': 'proxy', // shared-grading-proxy
};

export const HOST_RE = /[a-z0-9-]+\.up\.railway\.app/gi;

// Directories never walked into, at any depth. Generated, vendored, scratch, or may hold student data.
export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'state', 'roster-local', 'offline-pack', 'dist', 'coverage',
  'test-results', 'logs', 'gitnexus-shadow', '.gitnexus', '.weekly-dok-wt', '.vercel',
  '__pycache__', '.pytest_cache',
  'build', 'www', '.gradle', // android-app build output (a stale copy of the whole site)
]);
const SKIP_DIR_PREFIXES = ['media', 'UsersroberAppDataLocalTemp', '.weekly-dok-wt.stale-'];

// Relative paths (forward slashes) never touched in any repo: the codemod and its test carry the
// old hosts on purpose (HOST_MAP would rewrite itself), the inventory is regenerated, and
// android-app/android + www are gitignored copies of the whole site rebuilt from the offline pack.
export const SKIP_PATHS = new Set([
  'scripts/alias-hosts.mjs', 'scripts/alias-hosts.inventory.json', 'tests/alias-hosts.test.js',
]);
const SKIP_PATH_PREFIXES = ['android-app/android/', 'android-app/www/'];

// Extensions that are not text. Everything else is read as UTF-8.
export const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.bmp', '.tif', '.tiff',
  '.mp3', '.mp4', '.ogg', '.wav', '.m4a', '.webm', '.mov',
  '.pdf', '.zip', '.gz', '.tgz', '.7z', '.rar', '.jar', '.skill',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.rom', '.wasm', '.db', '.sqlite',
  '.pyc', '.class', '.keystore', '.traineddata', '.xlsx', '.docx', '.pptx', '.aux',
]);

// Root-level worksheet family in follow-alongs. Anything at the root that LOOKS like a worksheet
// (edgar driller, *_live.html variants) but is not in this family is left alone (feedback:
// edgar is not a follow-along). The Desk, teacher pages and config scripts are not worksheets
// and stay in scope.
export const WORKSHEET_RE = /^u\d+_lesson.+_live\.html$/;
const LOOKS_LIKE_WORKSHEET_RE = /^edgar|_live\.html$/i;

const here = dirname(fileURLToPath(import.meta.url));
export const FA_ROOT = resolve(here, '..');
export const DEFAULT_REPOS = [
  { name: 'fa', dir: FA_ROOT, worksheetGuard: true },
  { name: 'cr', dir: resolve(FA_ROOT, '..', 'curriculum_render'), worksheetGuard: false },
  { name: 'a2', dir: resolve(FA_ROOT, '..', 'algebra2-live-worksheet'), worksheetGuard: false },
];

export function aliasFor(host, domain) {
  const service = HOST_MAP[host.toLowerCase()];
  if (!service) return null;
  return `${service}.${domain}`;
}

function isSkippedDir(name) {
  if (SKIP_DIRS.has(name)) return true;
  return SKIP_DIR_PREFIXES.some((p) => name.startsWith(p));
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot);
}

export function isSkippedFile(name, { includeMd = false } = {}) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.bundle.js')) return true;
  if (lower.endsWith('.md') && !includeMd) return true;
  if (lower.endsWith('.log')) return true;
  return BINARY_EXT.has(extensionOf(lower));
}

// A root-level HTML file in the worksheet-looking family must match the real worksheet pattern.
export function passesWorksheetGuard(relPath, worksheetGuard) {
  if (!worksheetGuard) return true;
  if (relPath.includes('/') || relPath.includes('\\')) return true; // only the repo root is guarded
  if (!/\.html$/i.test(relPath)) return true;
  if (!LOOKS_LIKE_WORKSHEET_RE.test(relPath)) return true;
  return WORKSHEET_RE.test(relPath);
}

// Every candidate file under `dir`, as paths relative to `dir` with forward slashes.
export function walk(dir, opts = {}) {
  const out = [];
  const visit = (abs) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // unreadable scratch dirs (EACCES on Windows temp junk) are not our problem
    }
    for (const entry of entries) {
      const child = join(abs, entry.name);
      if (entry.isDirectory()) {
        if (!isSkippedDir(entry.name)) visit(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSkippedFile(entry.name, opts)) continue;
      const rel = relative(dir, child).split('\\').join('/');
      if (SKIP_PATHS.has(rel)) continue;
      if (SKIP_PATH_PREFIXES.some((p) => rel.startsWith(p))) continue;
      out.push(rel);
    }
  };
  visit(dir);
  return out.sort();
}

const BOM = '\uFEFF';

export function readText(abs) {
  const raw = readFileSync(abs);
  const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const text = raw.toString('utf8');
  return { text: hasBom ? text.slice(1) : text, hasBom };
}

export function writeText(abs, text, hasBom) {
  writeFileSync(abs, (hasBom ? BOM : '') + text, 'utf8');
}

// Rewrite one file's text. Returns the new text plus per-host counts (mapped and unmapped).
export function rewriteText(text, domain) {
  const mapped = {};
  const unmapped = {};
  const next = text.replace(HOST_RE, (host) => {
    const key = host.toLowerCase();
    const alias = domain ? aliasFor(key, domain) : null;
    if (!alias) {
      unmapped[key] = (unmapped[key] || 0) + 1;
      return host;
    }
    mapped[key] = (mapped[key] || 0) + 1;
    return alias;
  });
  return { text: next, mapped, unmapped };
}

function sum(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// The plan: for every repo, every file that mentions a Railway host, with what would change.
// With no domain the plan is an inventory (nothing mapped, every host listed as found).
export function buildPlan({ repos = DEFAULT_REPOS, domain = null, includeMd = false } = {}) {
  const files = [];
  const skippedByGuard = [];
  for (const repo of repos) {
    let rels;
    try {
      statSync(repo.dir);
      rels = walk(repo.dir, { includeMd });
    } catch {
      continue; // a sibling checkout that is not on this machine is simply absent from the plan
    }
    for (const rel of rels) {
      const abs = join(repo.dir, rel);
      const { text } = readText(abs);
      if (!/\.up\.railway\.app/i.test(text)) continue;
      const { mapped, unmapped } = rewriteText(text, domain);
      const entry = { repo: repo.name, path: rel, abs, mapped, unmapped, replacements: sum(mapped) };
      if (!passesWorksheetGuard(rel, repo.worksheetGuard)) {
        skippedByGuard.push(entry);
        continue;
      }
      files.push(entry);
    }
  }
  return { domain, files, skippedByGuard, hosts: hostTotals(files.concat(skippedByGuard), domain) };
}

// Per-host totals across the plan, each marked mapped/unmapped.
function hostTotals(entries, domain) {
  const totals = {};
  for (const e of entries) {
    for (const [host, n] of Object.entries(e.mapped)) totals[host] = (totals[host] || 0) + n;
    for (const [host, n] of Object.entries(e.unmapped)) totals[host] = (totals[host] || 0) + n;
  }
  return Object.keys(totals).sort().map((host) => ({
    host,
    service: HOST_MAP[host] || null,
    alias: domain ? aliasFor(host, domain) : null,
    occurrences: totals[host],
  }));
}

// Write every mapped replacement. Returns the files actually changed.
export function applyPlan(plan) {
  if (!plan.domain) throw new Error('applyPlan needs a domain');
  const written = [];
  for (const file of plan.files) {
    if (file.replacements === 0) continue;
    const { text, hasBom } = readText(file.abs);
    const { text: next } = rewriteText(text, plan.domain);
    if (next === text) continue;
    writeText(file.abs, next, hasBom);
    written.push(file);
  }
  return written;
}

// The committed checklist for the move: every hardcoded host, where it lives, how often.
export function buildInventory(plan) {
  const byRepo = {};
  for (const file of plan.files.concat(plan.skippedByGuard)) {
    const counts = { ...file.mapped, ...file.unmapped };
    const list = (byRepo[file.repo] ||= []);
    list.push({ path: file.path, hosts: counts, occurrences: sum(counts) });
  }
  return {
    generatedBy: 'scripts/alias-hosts.mjs --inventory',
    mapping: Object.fromEntries(Object.entries(HOST_MAP).map(([h, s]) => [h, `${s}.<domain>`])),
    hosts: plan.hosts.map(({ host, service, occurrences }) => ({
      host, service: service || 'unmapped', occurrences,
    })),
    files: byRepo,
  };
}

export function formatPlan(plan) {
  const lines = [];
  const verb = plan.domain ? `→ <service>.${plan.domain}` : '(inventory only)';
  lines.push(`alias-hosts ${verb}`);
  for (const h of plan.hosts) {
    const target = h.alias ? `→ ${h.alias}` : '(unmapped, never rewritten)';
    lines.push(`  ${h.host}  ${h.occurrences}  ${target}`);
  }
  for (const repo of [...new Set(plan.files.map((f) => f.repo))]) {
    const files = plan.files.filter((f) => f.repo === repo);
    const total = files.reduce((a, f) => a + f.replacements, 0);
    lines.push('');
    lines.push(`[${repo}] ${files.length} files, ${total} replacements`);
    for (const f of files) {
      const unmapped = sum(f.unmapped) ? `  (+${sum(f.unmapped)} unmapped)` : '';
      lines.push(`  ${String(f.replacements).padStart(4)}  ${f.path}${unmapped}`);
    }
  }
  if (plan.skippedByGuard.length) {
    lines.push('');
    lines.push(`skipped by the worksheet guard (${plan.skippedByGuard.length}):`);
    for (const f of plan.skippedByGuard) lines.push(`        ${f.repo}/${f.path}`);
  }
  return lines.join('\n');
}

export function parseArgs(argv) {
  const args = { domain: null, apply: false, json: false, inventory: false, includeMd: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--domain') { args.domain = argv[++i] || null; continue; }
    if (a.startsWith('--domain=')) { args.domain = a.slice('--domain='.length); continue; }
    if (a === '--apply') { args.apply = true; continue; }
    if (a === '--json') { args.json = true; continue; }
    if (a === '--inventory') { args.inventory = true; continue; }
    if (a === '--include-md') { args.includeMd = true; continue; }
    throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

export const INVENTORY_PATH = resolve(FA_ROOT, 'scripts', 'alias-hosts.inventory.json');

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.domain && !args.inventory) {
    console.error('usage: node scripts/alias-hosts.mjs --domain <d> [--apply] [--json] | --inventory');
    return 2;
  }
  if (args.domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(args.domain)) {
    console.error(`not a domain: ${args.domain}`);
    return 2;
  }

  const plan = buildPlan({ domain: args.domain, includeMd: args.includeMd });

  if (args.inventory) {
    writeFileSync(INVENTORY_PATH, JSON.stringify(buildInventory(plan), null, 2) + '\n', 'utf8');
    console.log(`wrote ${relative(FA_ROOT, INVENTORY_PATH)} (${plan.hosts.length} hosts, ${plan.files.length + plan.skippedByGuard.length} files)`);
    if (!args.domain) return 0;
  }

  if (args.json) {
    const slim = { ...plan, files: plan.files.map(({ abs, ...f }) => f), skippedByGuard: plan.skippedByGuard.map(({ abs, ...f }) => f) };
    console.log(JSON.stringify(slim, null, 2));
  } else {
    console.log(formatPlan(plan));
  }

  if (!args.apply) {
    console.log('\ndry run: nothing written (add --apply to rewrite)');
    return 0;
  }
  const written = applyPlan(plan);
  console.log(`\napplied: ${written.length} files rewritten`);
  return 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main());
