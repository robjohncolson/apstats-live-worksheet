import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildPlan,
  practiceLink,
  ROOT,
  SENTINEL,
  SKIPPED_TOPICS,
  wireHtml,
  WORKSHEET_RE,
} from '../scripts/wire-ti84-practice-links.mjs';

const lessonMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ti84-lesson-map.json'), 'utf8'));
const filenames = fs.readdirSync(ROOT).filter((filename) => WORKSHEET_RE.test(filename));
const plan = buildPlan(lessonMap, filenames);
const mappedTopics = new Set([
  ...Object.keys(lessonMap.lessons ?? {}),
  ...Object.keys(lessonMap.bonus ?? {}),
]);
const expectedTopics = new Set([...mappedTopics].filter((topic) => !SKIPPED_TOPICS.has(topic)));

function parseLinks(html) {
  return [...html.matchAll(
    /<div class="ti84-practice"><a href="ti84-trainer-v2\/standalone\.html#topic=([^&"]+)&source=worksheet" target="_blank" rel="noopener">🖩 Practice on the TI-84 →<\/a>(<span class="ti84-bonus">bonus<\/span>)?<\/div>/g,
  )].map((match) => ({ topic: match[1], bonus: Boolean(match[2]) }));
}

function virtuallyWiredWorksheets() {
  return filenames.map((filename) => {
    const raw = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    const links = plan.get(filename);
    return {
      filename,
      html: links && !raw.includes(SENTINEL) ? wireHtml(raw, links).html : raw,
    };
  });
}

describe('TI-84 worksheet practice-link sync', () => {
  it('maps every non-skipped lesson-map topic to exactly one link in one worksheet', () => {
    const occurrences = new Map([...expectedTopics].map((topic) => [topic, []]));

    for (const { filename, html } of virtuallyWiredWorksheets()) {
      for (const link of parseLinks(html)) {
        expect(mappedTopics.has(link.topic)).toBe(true);
        occurrences.get(link.topic)?.push({ filename, link });
      }
    }

    for (const topic of expectedTopics) {
      expect(occurrences.get(topic), topic).toHaveLength(1);
      const [{ link }] = occurrences.get(topic);
      expect(link.bonus).toBe(Object.hasOwn(lessonMap.bonus ?? {}, topic));
    }
    expect(occurrences.has('8.5')).toBe(false);
  });

  it('emits parseable trainer URLs whose topics exist in the map', () => {
    for (const topic of expectedTopics) {
      const url = new URL(
        practiceLink({ topic, bonus: false }).match(/href="([^"]+)"/)[1],
        'https://example.test/',
      );
      expect(url.pathname).toBe('/ti84-trainer-v2/standalone.html');
      expect(new URLSearchParams(url.hash.slice(1)).get('topic')).toBe(topic);
      expect(new URLSearchParams(url.hash.slice(1)).get('source')).toBe('worksheet');
    }
  });

  it('is idempotent after the sentinel is present', () => {
    for (const [filename, links] of plan) {
      const raw = fs.readFileSync(path.join(ROOT, filename), 'utf8');
      const first = raw.includes(SENTINEL) ? raw : wireHtml(raw, links).html;
      const second = wireHtml(first, links);
      expect(second).toEqual({ changed: false, html: first, reason: 'already-wired' });
    }
  });
});
