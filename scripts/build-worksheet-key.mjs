/**
 * Build the server-side worksheet blank answer key from live worksheet HTML.
 *
 * Dual-write:
 *   data/worksheet-key.json
 *   roster-server/data/worksheet-key.json
 *
 * Shape:
 *   { "WS-U7L1-Q1": "means|mean", ... }
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WORKSHEET_KEY_PATH = resolve(ROOT, 'data/worksheet-key.json');
const BUNDLED_PATH = resolve(ROOT, 'roster-server/data/worksheet-key.json');

function listLiveWorksheetFiles(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'roster-server') continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...listLiveWorksheetFiles(path));
      continue;
    }
    if (/^u.*_lesson.*_live\.html$/i.test(entry)) files.push(path);
  }
  return files.sort((a, b) => relative(ROOT, a).localeCompare(relative(ROOT, b)));
}

function readUnitId(source) {
  const match = source.match(/\bconst\s+UNIT_ID\s*=\s*['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

function readAttributes(tag) {
  const attrs = {};
  const attrRe = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = attrRe.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function hasBlankClass(className) {
  return String(className || '').split(/\s+/).includes('blank');
}

export function buildWorksheetKeyFromFiles(files) {
  const worksheetKey = {};
  const included = [];
  const skipped = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const unitId = readUnitId(source);
    if (!unitId) {
      skipped.push({ file: relative(ROOT, file).replace(/\\/g, '/'), reason: 'missing UNIT_ID' });
      continue;
    }

    const blanks = [];
    const inputRe = /<input\b[^>]*>/gi;
    let match;
    while ((match = inputRe.exec(source))) {
      const attrs = readAttributes(match[0]);
      if (hasBlankClass(attrs.class) && attrs['data-answer'] !== undefined) {
        blanks.push(attrs['data-answer']);
      }
    }

    if (blanks.length === 0) {
      skipped.push({ file: relative(ROOT, file).replace(/\\/g, '/'), reason: 'zero input.blank' });
      continue;
    }

    blanks.forEach((answer, idx) => {
      worksheetKey[`WS-${unitId}-Q${idx + 1}`] = answer;
    });
    included.push({
      file: relative(ROOT, file).replace(/\\/g, '/'),
      unitId,
      blanks: blanks.length,
    });
  }

  const sorted = {};
  for (const key of Object.keys(worksheetKey).sort()) sorted[key] = worksheetKey[key];
  return { worksheetKey: sorted, included, skipped };
}

function main() {
  const files = listLiveWorksheetFiles();
  const { worksheetKey, included, skipped } = buildWorksheetKeyFromFiles(files);
  const payload = {
    generatedFrom: 'repo-root u*_lesson*_live.html',
    generated: new Date().toISOString(),
    counts: {
      filesScanned: files.length,
      filesIncluded: included.length,
      filesSkipped: skipped.length,
      blanks: Object.keys(worksheetKey).length,
    },
    included,
    skipped,
    worksheetKey,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  mkdirSync(dirname(WORKSHEET_KEY_PATH), { recursive: true });
  writeFileSync(WORKSHEET_KEY_PATH, json, 'utf8');
  console.log(`Wrote ${WORKSHEET_KEY_PATH}`);
  mkdirSync(dirname(BUNDLED_PATH), { recursive: true });
  writeFileSync(BUNDLED_PATH, json, 'utf8');
  console.log(`Wrote ${BUNDLED_PATH} (bundled for deploy)`);
  console.log(`Worksheet blanks: ${Object.keys(worksheetKey).length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
