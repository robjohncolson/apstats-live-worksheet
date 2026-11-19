// Print-set build: renders a kit's sheets with Edge, checks page counts and headings,
// strips links, assembles packs, and only then copies the PDFs into place.
//
//   node scripts/printables/build.mjs <kit> [--pack <pack-or-set>] [--check] [--out <dir>] [--png <dir>] [--diff] [--write]
//
// <kit>    a dir name under the repo root (u2_poster) or a path to a dir holding printables.json
// --pack   build only that pack (or set) and the sheets it needs
// --check  build everything in a temp dir and write NOTHING tracked
// --out    write PDFs to <dir>/<file name> instead of the kit's own pdf paths
// --png    render each built pdf page to PNG in <dir> (to look at them)
// --diff   compare each built pdf's text with the committed pdf (information only)
// --write  also regenerate generated html (the layouts key) at its tracked path in the kit;
//          without it generated html goes to the temp folder
// --help   print this usage and exit 0
//
// Env: PRINTABLES_EDGE (msedge.exe path), PRINTABLES_PYTHON (default "python").
// Exit codes: 0 ok, 1 problems found, 2 environment or argument problem
// (bad arguments, unknown kit or pack, python or pymupdf missing, Edge missing when a sheet is rendered).
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  USAGE, checkPages, edgeArgs, linkProblems, loadManifest, needsEdge, parseArgs,
  resolveGeneratedHtmlPath, resolveTargets, validateManifest,
} from './lib.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const PDFTOOL = join(SCRIPT_DIR, 'pdftool.py');
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const EDGE_TIMEOUT_MS = 120000;

// ---------- arguments ----------

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function findKitDir(kit) {
  const candidates = isAbsolute(kit) ? [kit] : [join(REPO_ROOT, kit), resolve(kit)];
  const found = candidates.find((dir) => existsSync(join(dir, 'printables.json')));
  if (!found) fail(`No printables.json found. Looked in: ${candidates.join(', ')}`, 2);
  return resolve(found);
}

function checkPython() {
  const result = run(PYTHON, ['-c', 'import pymupdf']);
  if (result.error) fail(`Python not found (${PYTHON}); set PRINTABLES_PYTHON`, 2);
  if (result.status !== 0) fail(`${PYTHON} cannot import pymupdf; run: ${PYTHON} -m pip install pymupdf`, 2);
}

function findEdge() {
  const candidates = [process.env.PRINTABLES_EDGE, ...EDGE_CANDIDATES].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) fail('Edge not found; set PRINTABLES_EDGE', 2);
  return found;
}

// ---------- running tools ----------

function run(command, args) {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  return spawnSync(command, args, { encoding: 'utf8', env, timeout: EDGE_TIMEOUT_MS });
}

const PYTHON = process.env.PRINTABLES_PYTHON || 'python';

function pdftool(...args) {
  const result = run(PYTHON, [PDFTOOL, ...args]);
  if (result.error) throw new Error(`could not run ${PYTHON}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`pdftool ${args[0]} failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function toForwardSlashes(path) {
  return path.replace(/\\/g, '/');
}

function renderWithEdge(edge, sourceAbs, hash, outPdf, workDir) {
  const userDataDir = mkdtempSync(join(workDir, 'edge-profile-'));
  const source = toForwardSlashes(sourceAbs).replace(/ /g, '%20');
  const argv = edgeArgs(edge, resolve(outPdf), source, hash, userDataDir);
  const result = run(argv[0], argv.slice(1));
  if (result.error) throw new Error(`Edge failed to start: ${result.error.message}`);
  const produced = existsSync(outPdf) && statSync(outPdf).size > 0;
  if (!produced) throw new Error(`Edge produced no pdf for ${basename(sourceAbs)}#${hash} (exit ${result.status})`);
}

// ---------- building one sheet ----------

function runGenerator(sheet, htmlPath) {
  const script = join(REPO_ROOT, sheet.generator);
  if (!existsSync(script)) throw new Error(`generator not found: ${sheet.generator}`);
  const result = run(PYTHON, [script, '--out', htmlPath]);
  if (result.error) throw new Error(`could not run ${PYTHON}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`generator ${sheet.generator} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  if (!existsSync(htmlPath)) throw new Error(`generator ${sheet.generator} did not write ${htmlPath}`);
}

function sourceFor(sheet, context) {
  if (!sheet.generator) return join(context.kitDir, sheet.source);
  const htmlPath = resolveGeneratedHtmlPath(context.options, context.kitDir, context.workDir, sheet.source);
  runGenerator(sheet, htmlPath);
  return htmlPath;
}

function stripLinks(pdf, sheetLabel, audience) {
  const { links } = pdftool('strip-links', pdf);
  return linkProblems(`${sheetLabel} after stripping`, links, audience);
}

// Returns { pdf, problems }. pdf is the temp file when rendered, the existing file when frozen.
function buildSheet(sheet, context) {
  const existing = join(context.kitDir, sheet.pdf);
  if (sheet.frozen) {
    const info = pdftool('info', existing);
    const problems = checkPages(sheet.id, sheet.pages, sheet.headings, info, sheet.pdf);
    problems.push(...linkProblems(`${sheet.id} (frozen)`, info.links, sheet.audience));
    return { pdf: existing, info, problems };
  }

  const pdf = join(context.workDir, `sheet-${sheet.id}.pdf`);
  const source = sourceFor(sheet, context);
  renderWithEdge(context.edge, source, sheet.hash, pdf, context.workDir);
  const info = pdftool('info', pdf);
  const problems = checkPages(sheet.id, sheet.pages, sheet.headings, info, sheet.pdf);
  problems.push(...stripLinks(pdf, sheet.id, sheet.audience));
  return { pdf, info, problems };
}

// ---------- building one pack ----------

function buildPack(pack, builtSheets, context) {
  const existing = join(context.kitDir, pack.pdf);
  if (pack.frozen) {
    const info = pdftool('info', existing);
    const problems = checkPages(pack.id, pack.pageCount, [], info, pack.pdf);
    problems.push(...linkProblems(`${pack.id} (frozen)`, info.links, pack.audience));
    return { pdf: existing, info, problems };
  }

  const parts = [];
  for (const part of pack.parts) {
    const sheet = builtSheets.get(part.sheet);
    if (!sheet) throw new Error(`pack ${pack.id} needs sheet "${part.sheet}" which did not build`);
    if (sheet.problems.length > 0) throw new Error(`pack ${pack.id} not built: its sheet "${part.sheet}" failed above`);
    parts.push({ pdf: sheet.pdf, pages: part.pages });
  }
  const pdf = join(context.workDir, `pack-${pack.id}.pdf`);
  const specPath = join(context.workDir, `pack-${pack.id}.json`);
  writeSpec(specPath, { out: pdf, parts });
  pdftool('pack', specPath);

  const info = pdftool('info', pdf);
  const problems = checkPages(pack.id, pack.pageCount, [], info, pack.pdf);
  problems.push(...stripLinks(pdf, pack.id, pack.audience));
  return { pdf, info, problems };
}

function writeSpec(path, spec) {
  writeFileSync(path, JSON.stringify(spec));
}

// ---------- destinations, png, diff ----------

function destinationFor(item, context) {
  if (context.options.check) return `(check only) ${item.pdf}`;
  if (context.options.out) return join(resolve(context.options.out), basename(item.pdf));
  return join(context.kitDir, item.pdf);
}

function copyToDestinations(results, context) {
  for (const { item, built } of results) {
    if (item.frozen) continue;
    const destination = destinationFor(item, context);
    if (destination.startsWith('(check only)')) continue;
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(built.pdf, destination);
  }
}

function normalizedPages(pdf) {
  const { pages } = pdftool('text', pdf);
  return pages.map((text) => text.replace(/\s+/g, ' ').trim());
}

function snippet(text) {
  return JSON.stringify((text || '(no such page)').slice(0, 80));
}

function printDiff(item, built, context) {
  const committed = join(context.kitDir, item.pdf);
  if (built.pdf === committed) return console.log(`SKIP ${item.id}: frozen, not re-rendered (page count checked in place)`);
  if (!existsSync(committed)) return console.log(`DIFF ${item.id}: no committed pdf at ${item.pdf}`);

  const mine = normalizedPages(built.pdf);
  const theirs = normalizedPages(committed);
  const pageCount = Math.max(mine.length, theirs.length);
  for (let i = 0; i < pageCount; i++) {
    if (mine[i] === theirs[i]) continue;
    console.log(`DIFF ${item.id}: first difference on page ${i + 1}`);
    console.log(`       new:       ${snippet(mine[i])}`);
    console.log(`       committed: ${snippet(theirs[i])}`);
    return;
  }
  console.log(`SAME ${item.id}`);
}

// ---------- main ----------

function logLine(item, built, context, kind) {
  const label = kind === 'sheet' ? 'sheet' : 'pack ';
  const links = item.audience === 'teacher' ? ' (teacher pdf: 0 links verified)' : '';
  const frozen = item.frozen ? ' (frozen, checked in place)' : '';
  console.log(`OK   ${item.id.padEnd(18)} ${String(built.info.pages).padStart(2)} pages  -> ${destinationFor(item, context)}${links}${frozen}  [${label}]`);
}

function describeError(item, error) {
  return `${item.id}: ${error.message}`;
}

function buildAll(manifest, targets, context) {
  const problems = [];
  const results = [];
  const builtSheets = new Map();

  for (const sheet of manifest.sheets.filter((s) => targets.sheets.includes(s.id))) {
    try {
      const built = buildSheet(sheet, context);
      builtSheets.set(sheet.id, built);
      results.push({ item: sheet, built, kind: 'sheet' });
      reportResult(sheet, built, context, 'sheet', problems);
    } catch (error) {
      problems.push(describeError(sheet, error));
      console.log(`FAIL ${describeError(sheet, error)}`);
    }
  }

  for (const pack of manifest.packs.filter((p) => targets.packs.includes(p.id))) {
    try {
      const built = buildPack(pack, builtSheets, context);
      results.push({ item: pack, built, kind: 'pack' });
      reportResult(pack, built, context, 'pack', problems);
    } catch (error) {
      problems.push(describeError(pack, error));
      console.log(`FAIL ${describeError(pack, error)}`);
    }
  }
  return { problems, results };
}

function reportResult(item, built, context, kind, problems) {
  if (built.problems.length === 0) return logLine(item, built, context, kind);
  for (const problem of built.problems) console.log(`FAIL ${problem}`);
  problems.push(...built.problems);
}

function renderPngs(results, pngDir) {
  for (const { built } of results) {
    const { files } = pdftool('png', built.pdf, resolve(pngDir));
    console.log(`PNG  ${files.length} page(s) of ${basename(built.pdf)} -> ${resolve(pngDir)}`);
  }
}

function readOptions() {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (error) {
    return fail(`${error.message}
${USAGE}`, 2);
  }
}

function main() {
  const options = readOptions();
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const kitDir = findKitDir(options.kit);
  const manifest = loadManifest(kitDir);

  const manifestErrors = validateManifest(manifest, kitDir);
  if (manifestErrors.length > 0) {
    manifestErrors.forEach((error) => console.error(`MANIFEST ${error}`));
    fail(`FAILED: ${manifestErrors.length} manifest problem(s) in ${join(kitDir, 'printables.json')}`, 1);
  }

  let targets;
  try {
    targets = resolveTargets(manifest, options.pack);
  } catch (error) {
    fail(error.message, 2);
  }

  checkPython();
  const edge = needsEdge(manifest, targets) ? findEdge() : null;
  const context = { kitDir, options, edge, workDir: mkdtempSync(join(tmpdir(), 'printables-')) };
  try {
    const { problems, results } = buildAll(manifest, targets, context);
    if (problems.length === 0) copyToDestinations(results, context);
    else console.log('Nothing was copied to its destination because of the problems above.');

    if (options.png) renderPngs(results, options.png);
    if (options.diff) results.forEach(({ item, built }) => printDiff(item, built, context));

    if (problems.length > 0) {
      console.error(`FAILED: ${problems.length} problem(s)`);
      process.exitCode = 1;
      return;
    }
    const sheetCount = results.filter((r) => r.kind === 'sheet').length;
    console.log(`PRINT-READY: ${sheetCount} sheets, ${results.length - sheetCount} packs`);
  } finally {
    // Edge can hold its profile dir open for a while; ignore cleanup errors.
    try { rmSync(context.workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
