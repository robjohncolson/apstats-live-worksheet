import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasCurrentTheme, ROOT, themeBlock, wireHtml, WORKSHEET_RE } from '../scripts/wire-tango-theme.mjs';

const filenames = fs.readdirSync(ROOT).filter((f) => WORKSHEET_RE.test(f));

describe('Tango theme on worksheets', () => {
  it('every worksheet carries the current theme block exactly once, after the base stylesheet', () => {
    expect(filenames.length).toBeGreaterThanOrEqual(69);
    for (const filename of filenames) {
      const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
      expect(hasCurrentTheme(html), `${filename}: run node scripts/wire-tango-theme.mjs --apply`).toBe(true);
      expect(html.split('id="tango-theme"').length - 1, filename).toBe(1);
      expect(html.indexOf('</style>')).toBeLessThan(html.indexOf('id="tango-theme"'));
    }
  });

  it('wireHtml is idempotent and replaces a stale block', () => {
    const base = '<html><head><style>body{color:red}</style></head><body></body></html>';
    const once = wireHtml(base);
    expect(once.changed).toBe(true);
    expect(once.html).toContain(themeBlock());
    const twice = wireHtml(once.html);
    expect(twice.changed).toBe(false);
    const stale = once.html.replace('--accent: #FF5B19', '--accent: #000000');
    const fixed = wireHtml(stale);
    expect(fixed.changed).toBe(true);
    expect(fixed.html.split('id="tango-theme"').length - 1).toBe(1);
    expect(fixed.html).toContain('--accent: #FF5B19');
  });

  it('leaves pages without a stylesheet untouched', () => {
    expect(wireHtml('<html></html>').changed).toBe(false);
  });
});
