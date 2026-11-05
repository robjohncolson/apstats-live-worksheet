// apclassroom-page-urls.test.js - data/apclassroom-page-urls.json (the AP Classroom page
// sender's list) matches the registry data/apclassroom-assignments.json, and is public-safe.
// Regenerate with: node scripts/build-apclassroom-page-urls.mjs

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPageUrls, renderPageUrls } from '../scripts/build-apclassroom-page-urls.mjs';

const REPO = resolve(__dirname, '..');
const REGISTRY = JSON.parse(readFileSync(resolve(REPO, 'data/apclassroom-assignments.json'), 'utf8'));
const URLS_TEXT = readFileSync(resolve(REPO, 'data/apclassroom-page-urls.json'), 'utf8').replace(/\r\n/g, '\n');
const URLS = JSON.parse(URLS_TEXT);

function registryIds() {
  const ids = [];
  for (const entry of REGISTRY.progressChecks) {
    for (const cfg of Object.values(entry.parts)) if (cfg.id) ids.push(String(cfg.id));
  }
  return ids.sort();
}

describe('data/apclassroom-page-urls.json', () => {
  it('is exactly what the build script makes from the registry (not stale)', () => {
    expect(URLS_TEXT).toBe(renderPageUrls(REGISTRY));
  });

  it('lists every registry part with an id exactly once, and nothing else', () => {
    const ids = URLS.pages.map((p) => p.assignmentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(registryIds());
  });

  it('each row agrees with its registry entry; FRQ is the PROGRESS tab, MCQ parts RESULTS_STUDENTS', () => {
    for (const page of URLS.pages) {
      const entry = REGISTRY.progressChecks.find((e) => e.section === page.section && e.unit === page.unit);
      expect(entry, page.assignmentId).toBeTruthy();
      expect(String(entry.parts[page.part].id)).toBe(page.assignmentId);
      const tab = page.part === 'FRQ' ? 'PROGRESS' : 'RESULTS_STUDENTS';
      expect(page.url).toBe(`https://apclassroom.collegeboard.org/33/assignments/progress/${page.assignmentId}?tab=${tab}`);
      expect(page.assignmentId).toMatch(/^\d{6,12}$/);   // what POST /admin/apclassroom-page accepts
    }
  });

  it('is public-safe: ids, sections, units, parts and urls only', () => {
    expect(Object.keys(URLS).sort()).toEqual(['classId', 'pages', 'source']);
    for (const page of URLS.pages) {
      expect(Object.keys(page).sort()).toEqual(['assignmentId', 'part', 'section', 'unit', 'url']);
    }
  });

  it('skips a paper part with no id (Unit 1 Part A)', () => {
    const built = buildPageUrls({
      classId: '33',
      progressChecks: [{ unit: 1, section: 'PeriodB', parts: { A: { of: 18, origin: 'paper' }, FRQ: { id: '81595036' } } }],
    });
    expect(built.pages.map((p) => p.part)).toEqual(['FRQ']);
  });
});
