import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandalone } from '../ti84-trainer-v2/build.mjs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const trainerRoot = resolve(repoRoot, 'ti84-trainer-v2');

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n');
}

describe('TI-84 standalone build sync', () => {
  it('keeps standalone.html and generated files in sync with build output', () => {
    const fresh = buildStandalone();
    const committedStandalone = readFileSync(resolve(trainerRoot, 'standalone.html'), 'utf8');

    expect(normalizeLineEndings(committedStandalone)).toBe(normalizeLineEndings(fresh.standalone));

    for (const [filename, contents] of Object.entries(fresh.generated)) {
      const committed = readFileSync(resolve(trainerRoot, 'generated', filename), 'utf8');
      expect(normalizeLineEndings(committed)).toBe(normalizeLineEndings(contents));
    }
  });

  it('keeps index.html native script tags in manifest order', () => {
    const indexHtml = readFileSync(resolve(trainerRoot, 'index.html'), 'utf8');
    const nativeScripts = [...indexHtml.matchAll(/<script src="\.\/native\/([^"]+)"><\/script>/g)]
      .map((match) => match[1]);

    expect(nativeScripts).toEqual(nativeScriptFilenames);
  });
});
