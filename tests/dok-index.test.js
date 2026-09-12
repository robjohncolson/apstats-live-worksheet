import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'dok/manifest.json'), 'utf8'));

describe('DOK index print destinations', () => {
  it.each(Object.entries(manifest))('%s board offers self-paced bonus work from the sheet', (topic, entry) => {
    const slug = entry.slug || topic;
    const tex = readFileSync(resolve(root, `dok/tex/aps_${slug}_board.tex`), 'utf8');
    expect(tex.replace(/[\w.-]+_live\.html/gi, '')).not.toMatch(/video|watch/i);
    expect(tex).toContain('Self-paced bonus problem.');
    expect(tex).toContain('from this sheet; turn it in whenever you finish.');
    expect(tex).not.toMatch(/\\qrcode|\\href|follow-along|scan the code/i);
    for (const worksheet of entry.worksheets || [entry.worksheet]) expect(tex).not.toContain(worksheet);
  });
});
