// Regenerates TOC.html in the 2026 CED order (five units) from the data the Desk already uses:
//   2026-crosswalk.json  — old topic → { status core|bonus, newUnit, newTopic, newLabel, bonusUnit }
//   roadmap-data.json    — old topic → worksheet file (the registry; Supabase lesson_urls overrides
//                          the Desk at runtime, but worksheet files never moved)
// Only core 2026 topics are listed; bonus ("Beyond the exam") lessons are left out (teacher 2026-10-06).
// The old 9-unit layout (2026-05-17) no longer matched what students see on the Desk, which has
// labelled every lesson by the 2026 CED since the relabel (CALENDAR_CED2026_RELABEL_SPEC.md).
//
//   node scripts/build-toc.mjs
//
// Several old worksheets fold into one new topic (e.g. old 3.1 + 3.2 → new 1.10); those are listed
// as Part 1 / Part 2 under the new topic. Old ids are never shown to students (spec §4).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const crosswalk = read('2026-crosswalk.json').map;
const registry = read('roadmap-data.json').lessons;

// Descriptive titles from the crosswalk's own grouping (the repo holds no official 2026 unit names).
const UNIT_TITLES = {
  1: 'One-Variable Data & Collecting Data',
  2: 'Two Categorical Variables, Probability & Random Variables',
  3: 'Sampling Distributions & Inference for Proportions',
  4: 'Inference for Means',
  5: 'Two Quantitative Variables & Regression',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const topicNum = (t) => t.split('.').map(Number);
const byTopic = (a, b) => topicNum(a)[0] - topicNum(b)[0] || topicNum(a)[1] - topicNum(b)[1];
const fileFor = (oldId) => {
  const url = registry[oldId] && registry[oldId].urls && registry[oldId].urls.worksheet;
  return url ? url.split('/').pop() : null;
};

// Group: core topics by new unit → new topic (old ids in order); bonus by unit.
const units = {};
for (const oldId of Object.keys(crosswalk).sort(byTopic)) {
  const m = crosswalk[oldId];
  const file = fileFor(oldId);
  if (!file) continue;                       // no worksheet for this old topic
  if (m.status !== 'core') continue;         // bonus ("Beyond the exam") lessons are not listed
  const unit = m.newUnit;
  if (!unit) continue;
  units[unit] = units[unit] || { core: {} };
  const t = units[unit].core[m.newTopic] = units[unit].core[m.newTopic] || { label: m.newLabel, files: [] };
  if (!t.files.includes(file)) t.files.push(file);
}

function linkList(files) {
  if (files.length === 1) return `<a href="${esc(files[0])}">Follow-along</a>`;
  return files.map((f, i) => `<a href="${esc(f)}">Part ${i + 1}</a>`).join(' · ');
}

let body = '';
for (const unit of Object.keys(units).map(Number).sort((a, b) => a - b)) {
  const u = units[unit];
  body += `  <div class="unit">\n    <h2>Unit ${unit} — ${esc(UNIT_TITLES[unit] || '')}</h2>\n    <ul>\n`;
  for (const topic of Object.keys(u.core).sort(byTopic)) {
    const t = u.core[topic];
    body += `      <li><span class="num">${esc(topic)}</span><span class="topic">${esc(t.label)}</span> ${linkList(t.files)}</li>\n`;
  }
  body += '    </ul>\n  </div>\n\n';
}

const tocPath = fileURLToPath(new URL('TOC.html', root));
const current = readFileSync(tocPath, 'utf8');
const head = current.slice(0, current.indexOf('  <div class="unit">'));
const today = new Date().toISOString().slice(0, 10);
const out = head + body + `  <footer>Generated ${today} by scripts/build-toc.mjs · 2026 CED order (five units)</footer>\n</div>\n</body>\n</html>\n`;
writeFileSync(tocPath, out.replace(/\r\n/g, '\n'));
console.log('wrote TOC.html:', Object.keys(units).length, 'units,', Object.values(units).reduce((n, u) => n + Object.keys(u.core).length, 0), 'core topics');
