import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

it('renders the Nightly Review recurring line as text even with hostile labels', () => {
  const html = readFileSync('ap_stats_roadmap_square_mode.html', 'utf8');
  const start = html.indexOf('function _paintReviewByItem(host, data)');
  const source = html.slice(start, html.indexOf('\n}', start) + 2);
  const paint = new Function('document', '_reviewToggleBtns', '_reviewEditTemplates', '_reviewRefresh',
    source + ';return _paintReviewByItem;')(document, () => document.createElement('div'), () => {}, () => {});
  const host = document.createElement('div');
  paint(host, { items: [], topMisconceptions: [{ label: '<img src=x onerror=bad()>', students: 2 }] });
  expect(host.firstChild.textContent).toBe('Top recurring misconceptions this week: <img src=x onerror=bad()> (2)');
  expect(host.querySelector('img')).toBeNull();
});
