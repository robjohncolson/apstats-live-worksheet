#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(ROOT, 'data/lineage.json');
const OUTPUT_PATH = resolve(ROOT, 'DATA_LINEAGE.md');

function cell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function code(value) {
  return value ? `\`${cell(value)}\`` : '—';
}

function list(values) {
  return values.length ? values.map(code).join(', ') : '—';
}

export function renderLineage(manifest) {
  const rows = manifest.artifacts.map((artifact) => [
    `\`${cell(artifact.id)}\`<br>${cell(artifact.description)}`,
    cell(artifact.kind),
    code(artifact.path),
    list(artifact.inputs),
    code(artifact.regenerate),
    list(artifact.pinnedBy),
    cell(artifact.notes),
  ].join(' | '));

  return [
    '# Data Lineage',
    '',
    '> Generated from `data/lineage.json` by `node scripts/render-lineage.mjs`. Do not edit the table directly.',
    '',
    '## How to use',
    '',
    'Start with the artifact you changed, then print every downstream artifact, regeneration command, and pin:',
    '',
    '```sh',
    'node scripts/lineage-impact.mjs <artifact-id>',
    '```',
    '',
    'Run commands in the printed order. A dash means there is no automatic regeneration command; follow the artifact notes and manual pin. Yearly freezes and local golden fixtures require deliberate review.',
    '',
    '## Artifact table',
    '',
    'Artifact | Kind | Path | Inputs | Regenerate | Pins | Notes',
    '--- | --- | --- | --- | --- | --- | ---',
    ...rows,
    '',
  ].join('\n');
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  writeFileSync(OUTPUT_PATH, renderLineage(manifest), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
