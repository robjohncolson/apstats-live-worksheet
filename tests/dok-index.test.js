import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'dok/manifest.json'), 'utf8'));

describe('DOK index print destinations', () => {
  it.each(Object.entries(manifest))('%s board offers optional review and work from the sheet', (topic, entry) => {
    const slug = entry.slug || topic;
    const tex = readFileSync(resolve(root, `dok/tex/aps_${slug}_board.tex`), 'utf8');
    expect(tex.replace(/[\w.-]+_live\.html/gi, '')).not.toMatch(/video|watch/i);
    expect(tex).toContain('from the rules on your sheet. Turn in');
    if (entry.worksheets) {
      for (const member of entry.topics) expect(tex).toContain(`Review: ${member} follow-along`);
    } else {
      expect(tex).toContain('Optional review:');
    }
    for (const worksheet of entry.worksheets || [entry.worksheet]) expect(tex).toContain(worksheet);
  });
});
