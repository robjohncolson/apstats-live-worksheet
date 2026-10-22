// @vitest-environment node
// tests/alias-hosts.test.js — FABLE_SPRINT_2026_10_22_SPEC T2 / HETZNER_MIGRATION_SPEC §0.
//
// The codemod runs against a throwaway tree, never the real repos: dry run writes nothing,
// apply rewrites only mapped hosts, the fa-root worksheet guard skips edgar, CRLF and a UTF-8
// BOM survive, unmapped hosts are listed and left alone.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HOST_MAP, aliasFor, applyPlan, buildInventory, buildPlan, parseArgs, passesWorksheetGuard,
  rewriteText, walk,
} from '../scripts/alias-hosts.mjs';

const ROSTER = 'roster-production-12c1.up.railway.app';
const CR = 'curriculumrender-production.up.railway.app';
const A2 = 'a2-live-worksheets-production.up.railway.app';
const LRSL = 'lrsl-driller-production.up.railway.app';
const PROXY = 'shared-grading-proxy-production.up.railway.app';
const UNMAPPED = 'apstats-roster-production.up.railway.app';
const DOMAIN = 'example.test';

let root;
let repos;
const files = {};

function put(repo, rel, content) {
  const abs = join(root, repo, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
  files[`${repo}/${rel}`] = abs;
  return abs;
}

const bytes = (abs) => readFileSync(abs);
const text = (abs) => readFileSync(abs, 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'alias-hosts-'));
  repos = [
    { name: 'fa', dir: join(root, 'fa'), worksheetGuard: true },
    { name: 'cr', dir: join(root, 'cr'), worksheetGuard: false },
    { name: 'a2', dir: join(root, 'a2'), worksheetGuard: false },
  ];
  // fa: a CRLF worksheet, a BOM worksheet, the edgar driller, the Desk, config, tools, a workflow
  put('fa', 'u3_lesson6-7_live.html', `<!DOCTYPE html>\r\n<script>\r\nwindow.RAILWAY_SERVER_URL = 'https://${CR}';\r\n</script>\r\n`);
  put('fa', 'u1_lesson1_live.html', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`<html>\r\nfetch('https://${CR}/api/x')\r\n`, 'utf8')]));
  put('fa', 'edgar_driller_live.html', `<html>fetch('https://${CR}/api/x')</html>`);
  put('fa', 'ap_stats_roadmap_square_mode.html', `<script>const R='https://${ROSTER}'; const C='wss://${CR}/ws'; const L='https://${LRSL}/';</script>`);
  put('fa', 'roster_config.js', `window.ROSTER_SERVER_URL = 'https://${ROSTER}';\r\n`);
  put('fa', 'tools/schoology-sync.py', `ROSTER = "https://${ROSTER}"\n`);
  put('fa', 'tools/daily.ps1', `$roster = "https://${ROSTER}"\r\n`);
  put('fa', '.github/workflows/ci.yml', `env:\n  ROSTER_URL: https://${ROSTER}\n`);
  put('fa', 'tests/roster-client.test.js', `expect(src).not.toContain('${UNMAPPED}');\n`);
  put('fa', 'HETZNER_MIGRATION_SPEC.md', `| ${ROSTER} | 33 |\n`);
  put('fa', 'vendor/big.bundle.js', `var u='https://${CR}';`);
  put('fa', 'state/scratch.json', `{"u":"https://${CR}"}`);
  put('fa', 'node_modules/x/index.js', `'https://${CR}'`);
  put('fa', 'roster-local/summary.md', `https://${ROSTER}`);
  put('fa', 'offline-pack/u1.html', `https://${CR}`);
  put('fa', 'media/clip.html', `https://${CR}`);
  put('fa', 'dist/app.js', `https://${CR}`);
  put('fa', 'icons/logo.png', Buffer.from(`PNG https://${CR}`));
  put('fa', 'scripts/alias-hosts.mjs', `const HOST_MAP = { '${ROSTER}': 'roster' };`);
  put('fa', 'tests/alias-hosts.test.js', `const ROSTER = '${ROSTER}';`);
  put('fa', 'scripts/alias-hosts.inventory.json', `{"host":"${ROSTER}"}`);
  put('fa', 'android-app/android/app/src/main/assets/public/roster_config.js', `'https://${ROSTER}'`);
  put('fa', 'android-app/capacitor.config.json', `{"server":"https://${ROSTER}"}`);
  // cr: a worksheet NOT at the fa root is not guarded
  put('cr', 'worksheets/edgar_live.html', `https://${CR}`);
  put('cr', 'railway-server/server.js', `const PROXY = 'https://${PROXY}'; const ROSTER = 'https://${ROSTER}';\n`);
  // a2
  put('a2', 'roster_config.js', `window.ROSTER_SERVER_URL = 'https://${A2}';\n`);
  put('a2', 'lrsl.html', `<a href="https://${LRSL}/drill">go</a>`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('mapping', () => {
  it('maps the five known hosts and nothing else', () => {
    expect(aliasFor(ROSTER, DOMAIN)).toBe('roster.example.test');
    expect(aliasFor(CR, DOMAIN)).toBe('cr.example.test');
    expect(aliasFor(A2, DOMAIN)).toBe('a2.example.test');
    expect(aliasFor(LRSL, DOMAIN)).toBe('lrsl.example.test');
    expect(aliasFor(PROXY, DOMAIN)).toBe('proxy.example.test');
    expect(aliasFor(UNMAPPED, DOMAIN)).toBeNull();
    expect(Object.keys(HOST_MAP)).toHaveLength(5);
  });

  it('keeps the scheme and path, replacing only the host', () => {
    const out = rewriteText(`wss://${CR}/ws and https://${ROSTER}/api/x and https://${UNMAPPED}/y`, DOMAIN);
    expect(out.text).toBe('wss://cr.example.test/ws and https://roster.example.test/api/x and https://apstats-roster-production.up.railway.app/y');
    expect(out.mapped).toEqual({ [CR]: 1, [ROSTER]: 1 });
    expect(out.unmapped).toEqual({ [UNMAPPED]: 1 });
  });
});

describe('worksheet guard (fa root only)', () => {
  it('rewrites u3_lesson6-7_live.html but skips edgar at the root', () => {
    expect(passesWorksheetGuard('u3_lesson6-7_live.html', true)).toBe(true);
    expect(passesWorksheetGuard('edgar_driller_live.html', true)).toBe(false);
    expect(passesWorksheetGuard('edgar_driller.html', true)).toBe(false);
  });
  it('leaves non-worksheet root files and nested files in scope', () => {
    expect(passesWorksheetGuard('ap_stats_roadmap_square_mode.html', true)).toBe(true);
    expect(passesWorksheetGuard('roster_config.js', true)).toBe(true);
    expect(passesWorksheetGuard('worksheets/edgar_live.html', true)).toBe(true);
    expect(passesWorksheetGuard('edgar_live.html', false)).toBe(true);
  });
});

describe('walk', () => {
  it('skips node_modules, .git, state, roster-local, offline-pack, media*, dist, binaries, bundles and markdown', () => {
    const rels = walk(join(root, 'fa'));
    expect(rels).toContain('u3_lesson6-7_live.html');
    expect(rels).toContain('tools/schoology-sync.py');
    expect(rels).toContain('tools/daily.ps1');
    expect(rels).toContain('.github/workflows/ci.yml');
    for (const skipped of ['state/scratch.json', 'node_modules/x/index.js', 'roster-local/summary.md',
      'offline-pack/u1.html', 'media/clip.html', 'dist/app.js', 'icons/logo.png', 'vendor/big.bundle.js',
      'HETZNER_MIGRATION_SPEC.md', 'scripts/alias-hosts.mjs', 'tests/alias-hosts.test.js',
      'scripts/alias-hosts.inventory.json', 'android-app/android/app/src/main/assets/public/roster_config.js']) {
      expect(rels, skipped).not.toContain(skipped);
    }
    expect(rels).toContain('android-app/capacitor.config.json'); // tracked android-app sources stay in scope
    expect(walk(join(root, 'fa'), { includeMd: true })).toContain('HETZNER_MIGRATION_SPEC.md');
  });
});

describe('plan', () => {
  it('dry run changes nothing', () => {
    const before = Object.fromEntries(Object.entries(files).map(([k, abs]) => [k, bytes(abs)]));
    const plan = buildPlan({ repos, domain: DOMAIN });
    expect(plan.files.length).toBeGreaterThan(0);
    for (const [k, abs] of Object.entries(files)) expect(bytes(abs).equals(before[k]), k).toBe(true);
  });

  it('counts per file and lists unmapped hosts', () => {
    const plan = buildPlan({ repos, domain: DOMAIN });
    const byPath = Object.fromEntries(plan.files.map((f) => [`${f.repo}/${f.path}`, f]));
    expect(byPath['fa/ap_stats_roadmap_square_mode.html'].replacements).toBe(3);
    expect(byPath['fa/tests/roster-client.test.js'].replacements).toBe(0);
    expect(byPath['fa/tests/roster-client.test.js'].unmapped).toEqual({ [UNMAPPED]: 1 });
    expect(byPath['cr/railway-server/server.js'].mapped).toEqual({ [PROXY]: 1, [ROSTER]: 1 });
    expect(plan.skippedByGuard.map((f) => f.path)).toEqual(['edgar_driller_live.html']);
    const unmapped = plan.hosts.filter((h) => !h.service).map((h) => h.host);
    expect(unmapped).toEqual([UNMAPPED]);
  });

  it('apply rewrites only mapped hosts and reports written files', () => {
    const plan = buildPlan({ repos, domain: DOMAIN });
    const written = applyPlan(plan).map((f) => `${f.repo}/${f.path}`).sort();
    expect(written).toEqual([
      'a2/lrsl.html', 'a2/roster_config.js',
      'cr/railway-server/server.js', 'cr/worksheets/edgar_live.html',
      'fa/.github/workflows/ci.yml', 'fa/android-app/capacitor.config.json',
      'fa/ap_stats_roadmap_square_mode.html', 'fa/roster_config.js',
      'fa/tools/daily.ps1', 'fa/tools/schoology-sync.py', 'fa/u1_lesson1_live.html', 'fa/u3_lesson6-7_live.html',
    ]);
    expect(text(files['fa/ap_stats_roadmap_square_mode.html']))
      .toBe("<script>const R='https://roster.example.test'; const C='wss://cr.example.test/ws'; const L='https://lrsl.example.test/';</script>");
    expect(text(files['a2/roster_config.js'])).toContain('https://a2.example.test');
    expect(text(files['cr/railway-server/server.js'])).toContain('https://proxy.example.test');
    // untouched: unmapped host, guard, skipped dirs, bundle, markdown
    expect(text(files['fa/tests/roster-client.test.js'])).toContain(UNMAPPED);
    expect(text(files['fa/edgar_driller_live.html'])).toContain(CR);
    expect(text(files['fa/vendor/big.bundle.js'])).toContain(CR);
    expect(text(files['fa/state/scratch.json'])).toContain(CR);
    expect(text(files['fa/HETZNER_MIGRATION_SPEC.md'])).toContain(ROSTER);
    expect(text(files['fa/scripts/alias-hosts.mjs'])).toContain(ROSTER); // never rewrites itself
    // a second plan finds nothing mapped left
    const again = buildPlan({ repos, domain: DOMAIN });
    expect(again.files.reduce((a, f) => a + f.replacements, 0)).toBe(0);
  });

  it('preserves CRLF line endings', () => {
    applyPlan(buildPlan({ repos, domain: DOMAIN }));
    const ws = bytes(files['fa/u3_lesson6-7_live.html']).toString('latin1');
    expect(ws).toBe("<!DOCTYPE html>\r\n<script>\r\nwindow.RAILWAY_SERVER_URL = 'https://cr.example.test';\r\n</script>\r\n");
    expect(ws).not.toMatch(/[^\r]\n/);
    expect(bytes(files['fa/roster_config.js']).toString('latin1')).toBe("window.ROSTER_SERVER_URL = 'https://roster.example.test';\r\n");
  });

  it('preserves a UTF-8 BOM', () => {
    applyPlan(buildPlan({ repos, domain: DOMAIN }));
    const raw = bytes(files['fa/u1_lesson1_live.html']);
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(raw.subarray(3).toString('utf8')).toBe("<html>\r\nfetch('https://cr.example.test/api/x')\r\n");
    expect(raw.indexOf(Buffer.from([0xef, 0xbb, 0xbf]), 1)).toBe(-1); // exactly one BOM
  });

  it('inventory lists every host with repo, path and count, including guarded files', () => {
    const inv = buildInventory(buildPlan({ repos }));
    expect(inv.hosts.find((h) => h.host === UNMAPPED)).toEqual({ host: UNMAPPED, service: 'unmapped', occurrences: 1 });
    expect(inv.hosts.find((h) => h.host === CR).service).toBe('cr');
    expect(inv.files.fa.find((f) => f.path === 'edgar_driller_live.html')).toEqual({ path: 'edgar_driller_live.html', hosts: { [CR]: 1 }, occurrences: 1 });
    expect(inv.files.a2.map((f) => f.path).sort()).toEqual(['lrsl.html', 'roster_config.js']);
    expect(inv.mapping[ROSTER]).toBe('roster.<domain>');
  });
});

describe('cli args', () => {
  it('parses the flags and rejects unknown ones', () => {
    expect(parseArgs(['--domain', 'x.test', '--apply', '--json'])).toMatchObject({ domain: 'x.test', apply: true, json: true, inventory: false });
    expect(parseArgs(['--domain=x.test'])).toMatchObject({ domain: 'x.test' });
    expect(parseArgs(['--inventory'])).toMatchObject({ inventory: true, domain: null });
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
  });
});
