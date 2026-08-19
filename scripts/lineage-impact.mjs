#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = resolve(ROOT, 'data/lineage.json');

export function downstreamClosure(manifest, startId) {
  const byId = new Map(manifest.artifacts.map((artifact) => [artifact.id, artifact]));
  if (!byId.has(startId)) {
    throw new Error(`Unknown artifact id: ${startId}`);
  }

  const downstream = new Map();
  for (const artifact of manifest.artifacts) {
    for (const inputId of artifact.inputs) {
      const dependents = downstream.get(inputId) || [];
      dependents.push(artifact.id);
      downstream.set(inputId, dependents);
    }
  }

  const queue = [{ id: startId, depth: 0 }];
  const seen = new Set([startId]);
  const result = [];

  while (queue.length > 0) {
    const current = queue.shift();
    result.push({ artifact: byId.get(current.id), depth: current.depth });

    const nextIds = (downstream.get(current.id) || []).slice().sort();
    for (const nextId of nextIds) {
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  return result;
}

export function formatImpact(entries) {
  return entries.map(({ artifact, depth }, index) => {
    const relation = index === 0 ? 'changed' : `downstream depth ${depth}`;
    const command = artifact.regenerate || 'manual / no automatic command';
    const pins = artifact.pinnedBy.join(', ') || 'none';
    return [
      `${index + 1}. ${artifact.id} (${relation})`,
      `   path: ${artifact.path}`,
      `   regenerate: ${command}`,
      `   pins: ${pins}`,
      `   notes: ${artifact.notes}`,
    ].join('\n');
  }).join('\n\n');
}

function main() {
  const startId = process.argv[2];
  if (!startId) {
    console.error('Usage: node scripts/lineage-impact.mjs <artifact-id>');
    process.exitCode = 2;
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  try {
    console.log(formatImpact(downstreamClosure(manifest, startId)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
