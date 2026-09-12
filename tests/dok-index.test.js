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


describe('Active index cards', () => {
  it('renders exactly the manifest cards, labels, dates and three PDF links safely', async () => {
    const { JSDOM } = await import('jsdom');
    const html = readFileSync(resolve(root, 'dok/index.html'), 'utf8');
    const dom = new JSDOM(html);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const fixture = { ...manifest, '9.9': { title: '<img src=x onerror=alert(1)>', misconceptions: ['label:<b>context</b>'], generated: { on: '2026-09-12' } } };
    const fetch = async (url) => {
      expect(url).toBe('manifest.json');
      return { ok: true, json: async () => fixture };
    };
    await new Function('document', 'fetch', 'return ' + script.trim())(dom.window.document, fetch);
    const cards = [...dom.window.document.querySelectorAll('article')];
    expect(cards).toHaveLength(Object.keys(fixture).length);
    cards.forEach((card, i) => {
      const [key, sheet] = Object.entries(fixture)[i];
      expect(card.querySelector('h2').textContent).toBe(sheet.title);
      expect(card.querySelectorAll('li')).toHaveLength(sheet.misconceptions.length);
      expect(card.textContent).toContain(sheet.generated.on);
      expect([...card.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(
        ['student', 'board', 'teacher'].map(ed => `pdf/aps_${sheet.slug || key.replaceAll('+', '_')}_${ed}.pdf`));
    });
    expect(dom.window.document.querySelector('article img, article b, table')).toBeNull();
    expect(html).not.toMatch(/lesson-schedule|dayGroups|PENDING/);
    dom.window.close();
  });
});
