// APSTAT_PARK_TRAINER_ABSORB_SPEC §8.1: every worksheet calculator practice link opens the park
// solo room by topic; the codemod is pattern-guarded and idempotent; no worksheet still points at
// the retired trainer.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, WORKSHEET_RE, OLD_LINK_RE, NEW_LINK_RE, rewireHtml, run, worksheetFilenames, parkLink } from '../scripts/wire-park-calculator-links.mjs';

const lessonMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ti84-lesson-map.json'), 'utf8'));
const mappedTopics = new Set([...Object.keys(lessonMap.lessons || {}), ...Object.keys(lessonMap.bonus || {})]);
const filenames = worksheetFilenames();

describe('worksheet calculator links open the park solo room', () => {
  it('no worksheet links the retired trainer; every park link names a mapped topic', () => {
    const linked = new Map();
    for (const filename of filenames) {
      const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
      expect(html.match(OLD_LINK_RE), filename + ' still links ti84-trainer-v2').toBeNull();
      expect(html).not.toContain('ti84-trainer-v2');
      for (const match of html.matchAll(NEW_LINK_RE)) {
        expect(mappedTopics.has(match[1]), filename + ' links unmapped topic ' + match[1]).toBe(true);
        linked.set(match[1], filename);
      }
    }
    expect(linked.size).toBeGreaterThanOrEqual(20);
  });

  it('the codemod is idempotent: a run over the wired tree changes nothing', () => {
    const report = run({ apply: false, log: () => {} });
    expect(report).toEqual([]);
  });

  it('rewires the old href only, keeps the text and badge, and is guarded to worksheets', () => {
    const old = '<div class="ti84-practice"><a href="ti84-trainer-v2/standalone.html#topic=4.12&source=worksheet" target="_blank" rel="noopener">🖩 Practice on the TI-84 →</a><span class="ti84-bonus">bonus</span></div>';
    const once = rewireHtml(old);
    expect(once.changed).toBe(true);
    expect(once.topics).toEqual(['4.12']);
    expect(once.html).toBe('<div class="ti84-practice"><a ' + parkLink('4.12') + ' target="_blank" rel="noopener">🖩 Practice on the TI-84 →</a><span class="ti84-bonus">bonus</span></div>');
    expect(rewireHtml(once.html)).toEqual({ html: once.html, changed: false, topics: [] });
    expect(WORKSHEET_RE.test('u3_lesson6-7_live.html')).toBe(true);
    expect(WORKSHEET_RE.test('edgar_driller.html')).toBe(false);
    expect(WORKSHEET_RE.test('ap_stats_roadmap_square_mode.html')).toBe(false);
    // A tree with a non-worksheet file carrying the old link is left alone.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'park-links-'));
    fs.writeFileSync(path.join(dir, 'u1_lesson7_live.html'), old);
    fs.writeFileSync(path.join(dir, 'notes.html'), old);
    const report = run({ apply: true, root: dir, log: () => {} });
    expect(report.map(r => r.filename)).toEqual(['u1_lesson7_live.html']);
    expect(fs.readFileSync(path.join(dir, 'notes.html'), 'utf8')).toBe(old);
    expect(fs.readFileSync(path.join(dir, 'u1_lesson7_live.html'), 'utf8')).toContain(parkLink('4.12'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
