#!/usr/bin/env node
/**
 * Wire worksheet-to-trainer practice links from data/ti84-lesson-map.json.
 *
 * Dry-run by default:
 *   node scripts/wire-ti84-practice-links.mjs
 *   node scripts/wire-ti84-practice-links.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(SCRIPT_DIR, '..');
export const SENTINEL = 'TI84_PRACTICE_LINK_WIRED';
// 8.5 (matrix-entry, chi-square-test) was held until the matrix cell loop shipped (2026-08-19).
export const SKIPPED_TOPICS = new Set();
export const WORKSHEET_RE = /^u(\d+)_lesson(\d+(?:-\d+)*)_live\.html$/;

function topicParts(topic) {
  const match = /^(\d+)\.(\d+)$/.exec(topic);
  if (!match) {
    throw new Error(`Invalid lesson-map topic: ${topic}`);
  }
  return { unit: Number(match[1]), lesson: Number(match[2]) };
}

function worksheetCoversTopic(filename, topic) {
  const match = WORKSHEET_RE.exec(filename);
  if (!match) {
    return false;
  }

  const { unit, lesson } = topicParts(topic);
  if (Number(match[1]) !== unit) {
    return false;
  }

  const lessons = match[2].split('-').map(Number);
  if (lessons.length === 1) {
    return lessons[0] === lesson;
  }

  const first = lessons[0];
  const last = lessons[lessons.length - 1];
  return lesson >= first && lesson <= last;
}

function findWorksheet(topic, filenames) {
  const { unit, lesson } = topicParts(topic);
  const exact = `u${unit}_lesson${lesson}_live.html`;
  if (filenames.includes(exact)) {
    return exact;
  }

  const candidates = filenames.filter((filename) => worksheetCoversTopic(filename, topic));
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one worksheet for topic ${topic}; found ${candidates.length}: ${candidates.join(', ')}`,
    );
  }
  return candidates[0];
}

export function buildPlan(lessonMap, filenames) {
  const entries = [
    ...Object.keys(lessonMap.lessons ?? {}).map((topic) => ({ topic, bonus: false })),
    ...Object.keys(lessonMap.bonus ?? {}).map((topic) => ({ topic, bonus: true })),
  ].filter(({ topic }) => !SKIPPED_TOPICS.has(topic));

  const plan = new Map();
  for (const entry of entries) {
    const filename = findWorksheet(entry.topic, filenames);
    const current = plan.get(filename) ?? [];
    current.push(entry);
    plan.set(filename, current);
  }

  for (const links of plan.values()) {
    links.sort((a, b) => {
      const left = topicParts(a.topic);
      const right = topicParts(b.topic);
      return left.unit - right.unit || left.lesson - right.lesson;
    });
  }
  return plan;
}

function objectiveClosingTagEnd(html) {
  const objective = /<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bobjective-box\b[^"']*\1[^>]*>/i.exec(html);
  if (!objective) {
    throw new Error('Missing .objective-box');
  }

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = objective.index;
  let depth = 0;
  let tag;
  while ((tag = tagRe.exec(html))) {
    depth += /^<div\b/i.test(tag[0]) ? 1 : -1;
    if (depth === 0) {
      return tagRe.lastIndex;
    }
  }
  throw new Error('Unclosed .objective-box');
}

export function practiceLink({ topic, bonus }) {
  const badge = bonus ? '<span class="ti84-bonus">bonus</span>' : '';
  return `<div class="ti84-practice"><a href="ti84-trainer-v2/standalone.html#topic=${topic}&source=worksheet" target="_blank" rel="noopener">🖩 Practice on the TI-84 →</a>${badge}</div>`;
}

export function wireHtml(raw, links) {
  if (raw.includes(SENTINEL)) {
    return { changed: false, html: raw, reason: 'already-wired' };
  }
  if (!links?.length) {
    return { changed: false, html: raw, reason: 'no-links' };
  }

  const closingEnd = objectiveClosingTagEnd(raw);
  const firstSection = /<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bsection\b[^"']*\1[^>]*>/i.exec(raw.slice(closingEnd));
  if (!firstSection) {
    throw new Error('Missing first .section after .objective-box');
  }

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const insertion = [
    `    <!-- ${SENTINEL} -->`,
    ...links.map((link) => `    ${practiceLink(link)}`),
  ].join(eol);
  const html = `${raw.slice(0, closingEnd)}${eol}${eol}${insertion}${raw.slice(closingEnd)}`;
  return { changed: true, html, reason: 'wired' };
}

export function main(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const lessonMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ti84-lesson-map.json'), 'utf8'));
  const filenames = fs.readdirSync(ROOT).filter((filename) => WORKSHEET_RE.test(filename));
  const plan = buildPlan(lessonMap, filenames);
  let changed = 0;
  let unchanged = 0;

  for (const [filename, links] of [...plan.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const filePath = path.join(ROOT, filename);
    const raw = fs.readFileSync(filePath, 'utf8');
    const result = wireHtml(raw, links);
    if (!result.changed) {
      unchanged += 1;
      console.log(`unchanged ${filename} (${result.reason})`);
      continue;
    }

    changed += 1;
    console.log(`${apply ? 'wired' : 'would wire'} ${filename}: ${links.map(({ topic }) => topic).join(', ')}`);
    if (apply) {
      fs.writeFileSync(filePath, result.html, 'utf8');
    }
  }

  console.log(
    `${apply ? 'Applied' : 'Dry run'}: ${changed} changed, ${unchanged} unchanged; skipped ${SKIPPED_TOPICS.size ? [...SKIPPED_TOPICS].join(', ') : 'none'}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
