// desk-resource-links.test.js — the lesson panel's extra resource links stay clean.
// Teacher 2026-10-02: old PDF / HTML worksheet copies in RESOURCES 404'd on GH Pages
// ("Kickoff Packet", "Follow-Along Worksheet 1/2") and made students think they had
// several worksheets. They were all removed; this keeps relative links from coming back.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function resourcesObject() {
  const start = DESK.indexOf('const RESOURCES = {');
  let depth = 0;
  let end = DESK.indexOf('{', start);
  for (; end < DESK.length; end++) {
    if (DESK[end] === '{') depth++;
    if (DESK[end] === '}' && --depth === 0) break;
  }
  // The literal is plain data (strings, arrays, objects).
  return new Function('return (' + DESK.slice(DESK.indexOf('{', start), end + 1) + ');')();
}

describe('RESOURCES extra links', () => {
  const resources = resourcesObject();

  it('parses and still carries the lesson videos', () => {
    const videos = Object.values(resources).reduce((n, r) => n + (r.videos || []).length, 0);
    expect(videos).toBeGreaterThan(100);
  });

  it('has no relative extra links (they 404 on GitHub Pages)', () => {
    const relative = [];
    for (const [id, r] of Object.entries(resources)) {
      for (const p of r.pdfs || []) {
        if (!/^https:\/\//.test(p.url)) relative.push(id + ': ' + p.url);
      }
    }
    expect(relative).toEqual([]);
  });
});
