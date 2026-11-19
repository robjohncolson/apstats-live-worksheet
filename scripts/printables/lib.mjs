// Pure logic for the print-set build: manifest checks, page checks, targets, Edge argv.
// No child processes and no fs writes here, so tests need neither Edge nor python.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadManifest(kitDir) {
  const path = join(kitDir, 'printables.json');
  if (!existsSync(path)) {
    throw new Error(`No printables.json in ${kitDir}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function findDuplicates(ids) {
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function validateSheet(sheet, kitDir) {
  const errors = [];
  const name = `sheet "${sheet.id}"`;
  for (const field of ['id', 'renderer', 'source', 'pdf', 'audience']) {
    if (!sheet[field]) errors.push(`${name}: missing "${field}"`);
  }
  if (typeof sheet.hash !== 'string') errors.push(`${name}: "hash" must be a string ("" for none)`);
  if (!isPositiveInt(sheet.pages)) errors.push(`${name}: "pages" must be a positive integer`);
  if (sheet.headings && sheet.headings.length > sheet.pages) {
    errors.push(`${name}: ${sheet.headings.length} headings but only ${sheet.pages} pages`);
  }
  if (!sheet.frozen && sheet.source && !existsSync(join(kitDir, sheet.source))) {
    errors.push(`${name}: source ${sheet.source} does not exist in ${kitDir}`);
  }
  return errors;
}

function validatePack(pack, sheetsById) {
  const errors = [];
  const name = `pack "${pack.id}"`;
  for (const field of ['id', 'title', 'pdf', 'audience']) {
    if (!pack[field]) errors.push(`${name}: missing "${field}"`);
  }
  if (!isPositiveInt(pack.pageCount)) errors.push(`${name}: "pageCount" must be a positive integer`);

  let total = 0;
  for (const part of pack.parts || []) {
    const sheet = sheetsById.get(part.sheet);
    if (!sheet) {
      errors.push(`${name}: part references unknown sheet "${part.sheet}"`);
      continue;
    }
    for (const page of part.pages) {
      if (!isPositiveInt(page) || page > sheet.pages) {
        errors.push(`${name}: page ${page} is outside sheet "${sheet.id}" (1..${sheet.pages})`);
      }
    }
    total += part.pages.length;
  }
  if (total !== pack.pageCount) {
    errors.push(`${name}: pageCount is ${pack.pageCount} but its parts add up to ${total} pages`);
  }
  return errors;
}

export function validateManifest(manifest, kitDir) {
  const sheets = manifest.sheets || [];
  const packs = manifest.packs || [];
  const sets = manifest.sets || {};
  const errors = [];

  const allIds = [...sheets.map((s) => s.id), ...packs.map((p) => p.id)];
  for (const id of findDuplicates(allIds)) errors.push(`duplicate id "${id}"`);

  for (const sheet of sheets) {
    if (sheet.renderer && sheet.renderer !== 'edge-html') {
      errors.push(`sheet "${sheet.id}": renderer ${sheet.renderer} not supported`);
    }
    errors.push(...validateSheet(sheet, kitDir));
  }

  const sheetsById = new Map(sheets.map((s) => [s.id, s]));
  for (const pack of packs) errors.push(...validatePack(pack, sheetsById));

  const packIds = new Set(packs.map((p) => p.id));
  for (const [setName, members] of Object.entries(sets)) {
    for (const member of members) {
      if (!packIds.has(member)) errors.push(`set "${setName}": "${member}" is not a pack id`);
    }
  }
  return errors;
}

function findFirstOffHeading(headings, firstLines) {
  for (let i = 0; i < headings.length; i++) {
    const line = firstLines[i];
    if (line === undefined) return null;
    if (!line.startsWith(headings[i])) {
      return { page: i + 1, expected: headings[i], got: line };
    }
  }
  return null;
}

// info = { pages, firstLines }. Returns an array of error strings (empty = fine).
export function checkPages(name, expectedPages, headings, info, pdfPath = '') {
  const label = pdfPath ? `${name} (${pdfPath})` : name;
  const off = findFirstOffHeading(headings || [], info.firstLines);
  const offText = off
    ? ` First page off its heading: page ${off.page} expected "${off.expected}" got "${off.got}"`
    : '';

  if (info.pages > expectedPages) {
    return [`OVERFLOW ${label}: expected ${expectedPages} pages, got ${info.pages}.${offText}`];
  }
  if (info.pages < expectedPages) {
    return [`UNDERFLOW ${label}: expected ${expectedPages} pages, got ${info.pages}.${offText}`];
  }
  if (off) {
    return [`HEADING ${label}: page ${off.page} expected "${off.expected}" got "${off.got}"`];
  }
  return [];
}

// name = pack id, set name, or null (everything). Returns { sheets: [ids], packs: [ids] }.
export function resolveTargets(manifest, name) {
  const allPacks = manifest.packs || [];
  const sets = manifest.sets || {};

  if (name === null || name === undefined) {
    return {
      sheets: manifest.sheets.map((s) => s.id),
      packs: allPacks.map((p) => p.id),
    };
  }

  const packIds = sets[name] ? sets[name] : allPacks.filter((p) => p.id === name).map((p) => p.id);
  if (packIds.length === 0) {
    const packNames = allPacks.map((p) => p.id).join(', ');
    const setNames = Object.keys(sets).join(', ');
    throw new Error(`Unknown pack or set "${name}". Packs: ${packNames}. Sets: ${setNames}`);
  }

  const needed = new Set();
  for (const pack of allPacks.filter((p) => packIds.includes(p.id))) {
    if (pack.frozen) continue; // a frozen pack is checked in place; its sheets are not rendered
    for (const part of pack.parts) needed.add(part.sheet);
  }
  const sheets = manifest.sheets.map((s) => s.id).filter((id) => needed.has(id));
  return { sheets, packs: packIds };
}

// argv for msedge.exe. outPdfAbs must be a Windows path; sourceAbs a forward-slash absolute path.
export function edgeArgs(edgeExe, outPdfAbs, sourceAbs, hash, userDataDir) {
  const url = `file:///${sourceAbs}${hash ? `#${hash}` : ''}`;
  return [
    edgeExe,
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--user-data-dir=${userDataDir}`,
    `--print-to-pdf=${outPdfAbs}`,
    url,
  ];
}

// Edge is only needed when some target sheet is rendered (not frozen).
export function needsEdge(manifest, targets) {
  return manifest.sheets.some((sheet) => targets.sheets.includes(sheet.id) && !sheet.frozen);
}

export const USAGE = 'Usage: node scripts/printables/build.mjs <kit> [--pack <name>] [--check] [--out <dir>] [--png <dir>] [--diff] [--write] [--help]';

const VALUE_FLAGS = { '--pack': 'pack', '--out': 'out', '--png': 'png' };

function isUsableValue(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.startsWith('--');
}

// Throws Error(message) for bad arguments; the caller turns that into exit code 2.
export function parseArgs(argv) {
  const options = { kit: null, pack: null, check: false, out: null, png: null, diff: false, write: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--diff') options.diff = true;
    else if (arg === '--write') options.write = true;
    else if (VALUE_FLAGS[arg]) {
      const value = argv[++i];
      if (!isUsableValue(value)) throw new Error(`${arg} needs a value (got ${value === undefined ? 'nothing' : JSON.stringify(value)})`);
      options[VALUE_FLAGS[arg]] = value;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else options.kit = arg;
  }
  if (options.help) return options;
  if (!options.kit) throw new Error('Missing <kit> (for example u2_poster)');
  if (options.check && options.out) throw new Error('Use either --check or --out, not both');
  if (options.write && (options.check || options.out)) throw new Error('--write cannot be combined with --check or --out');
  return options;
}

// Where a generated html (the layouts key) goes. The tracked kit path only with --write.
export function resolveGeneratedHtmlPath(options, kitDir, workDir, source) {
  if (options.write) return join(kitDir, source);
  return join(workDir, `gen-${source}`);
}

// Frozen pdfs are never re-rendered, but they must still carry no links.
export function linkProblems(label, links, audience) {
  if (links === 0) return [];
  const who = audience === 'teacher' ? 'teacher pdf' : 'pdf';
  return [`LINKS ${label}: ${links} link(s) in ${who}`];
}
