#!/usr/bin/env node
// build-learning-objectives.mjs — extract CED learning objectives per topic.
//
// Reads the nine framework transcriptions (apstat_{1..9}_framework.md — the
// 2019 CED unit guides, old 9-unit numbering, the same topicKeys the schedule
// uses) and writes data/learning-objectives.json:
//
//   topics["1.2"] = {
//     unit: 1, topicKey: "1.2", title: "The Language of Variation: Variables",
//     los: [ { code: "VAR-1.B", text: "Identify variables in a set of data.",
//              skill: "2.A", ek: [ { code: "VAR-1.B.1", text: "..." } ] } ]
//   }
//
// Consumers: teacher-week.html (what LOs are we covering this week, B vs E).
// The markdown files differ in shape per unit (tables, bullets, one-per-line),
// so everything is normalized to flat text first and pulled out by LO code.
//
// Usage: node scripts/build-learning-objectives.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'learning-objectives.json');

const LO_CODE = /\b((?:VAR|UNC|DAT)-\d+\.[A-Z]{1,2})\b(?!\.\d)/;
const EK_CODE = /\b((?:VAR|UNC|DAT)-\d+\.[A-Z]{1,2}\.\d+)\b/;

function flatten(markdown) {
  return markdown
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/^\s*[>|*#-]+\s*/gm, '')
    .replace(/\*([^*\s][^*]*?)\*/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(line) {
  return line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/^TOPIC\s+\d+\.\d+\s*:?\s*/i, '').trim();
}

function splitTopics(markdown) {
  const lines = markdown.split(/\r?\n/);
  const topics = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^#+\s*\**\s*TOPIC\s+(\d+\.\d+)\b\s*:?\s*(.*)$/i);
    if (m) {
      let title = cleanTitle(m[2] || '');
      if (!title) {
        const next = lines.slice(i + 1).find((l) => l.trim());
        title = cleanTitle(next || '');
      }
      current = { topicKey: m[1], title: title.replace(/\*/g, '').trim(), body: [] };
      topics.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return topics;
}

function endOfText(rest) {
  const stops = [
    rest.search(/\b(?:VAR|UNC|DAT)-\d+\.[A-Z]{1,2}\b/),
    rest.search(/\bESSENTIAL KNOWLEDGE\b/),
    rest.search(/\bLEARNING OBJECTIVE\b/),
    rest.search(/\bENDURING UNDERSTANDING\b/),
    rest.search(/\bAP Statistics Course and Exam Description\b/),
    rest.search(/\bReturn to Table of Contents\b/),
    rest.search(/\bRequired Course Content\b/),
    rest.search(/\bPage \d+\b/),
    rest.search(/\bSKILL\b/),
    rest.search(/\bTOPIC \d/),
    rest.search(/\bUNIT \d/),
    rest.search(/\*{3}|-{3}/),
  ].filter((i) => i >= 0);
  return stops.length ? Math.min(...stops) : rest.length;
}

function parseEk(text) {
  const eks = [];
  const re = new RegExp(EK_CODE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const rest = text.slice(m.index + m[0].length).replace(/^\s*:?\s*/, '');
    const body = rest.slice(0, endOfText(rest)).trim();
    if (body) eks.push({ code: m[1], text: body });
  }
  return eks;
}

function parseLos(text) {
  const los = [];
  const seen = new Set();
  const re = new RegExp(LO_CODE.source, 'g');
  let m;
  while ((m = re.exec(text))) {
    const code = m[1];
    const rest = text.slice(m.index + m[0].length).replace(/^\s*:?\s*/, '');
    const skillMatch = rest.match(/^([\s\S]*?)\s*\[Skills?\s+([^\]]+)\]/);
    if (!skillMatch) continue;
    const body = skillMatch[1].trim();
    if (body.length > 400 || LO_CODE.test(body) || !body) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    const after = rest.slice(skillMatch[0].length);
    const nextLo = after.search(/\b(?:VAR|UNC|DAT)-\d+\.[A-Z]{1,2}\b(?!\.\d)/);
    const ekWindow = nextLo >= 0 ? after.slice(0, nextLo) : after;
    los.push({
      code,
      text: body.replace(/\s+/g, ' '),
      skill: skillMatch[2].trim(),
      ek: parseEk(ekWindow).filter((e) => e.code.startsWith(code + '.')),
    });
  }
  return los;
}

const topics = {};
for (let unit = 1; unit <= 9; unit++) {
  const file = path.join(ROOT, `apstat_${unit}_framework.md`);
  const md = fs.readFileSync(file, 'utf8');
  for (const t of splitTopics(md)) {
    const los = parseLos(flatten(t.body.join('\n')));
    if (topics[t.topicKey]) {
      // Some transcriptions repeat a topic heading (page breaks); merge LOs.
      for (const lo of los) if (!topics[t.topicKey].los.some((x) => x.code === lo.code)) topics[t.topicKey].los.push(lo);
      continue;
    }
    topics[t.topicKey] = { unit, topicKey: t.topicKey, title: t.title, los };
  }
}

const out = {
  generatedBy: 'scripts/build-learning-objectives.mjs',
  source: 'apstat_{1..9}_framework.md (2019 CED unit guides, old 9-unit topic numbering)',
  note: 'Teacher-facing. LO codes carry the VAR/UNC/DAT Big Idea prefix from the 2019 CED; do not surface them to students.',
  topics,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const keys = Object.keys(topics).sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
const empty = keys.filter((k) => topics[k].los.length === 0);
console.log(`wrote ${OUT}: ${keys.length} topics, ${keys.reduce((n, k) => n + topics[k].los.length, 0)} LOs`);
if (empty.length) console.log('topics with NO learning objectives:', empty.join(', '));
