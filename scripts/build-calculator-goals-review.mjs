// Build apstat-park/CALCULATOR_GOALS_REVIEW.md from apstat-park/calculator-goals.mjs: one table per
// skill so the teacher can scan every goal phrase against its keys. Idempotent; the hand-written
// notes between the NOTES markers (routes shortened, flags) are kept as they are.
//
//   node scripts/build-calculator-goals-review.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CALCULATOR_PROBLEMS } from '../apstat-park/calculator-catalog.mjs';
import { goalSpans } from '../apstat-park/calculator-goals.mjs';

const target = new URL('../apstat-park/CALCULATOR_GOALS_REVIEW.md', import.meta.url);
const NOTES_START = '<!-- notes:start (hand-written, kept by the build) -->';
const NOTES_END = '<!-- notes:end -->';

// Markdown would read "<p" as a tag and "|" as a column break.
const cell = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('|', '\\|');

function existingNotes() {
  if (!existsSync(target)) return NOTES_START + '\n\n' + NOTES_END;
  const text = readFileSync(target, 'utf8');
  const start = text.indexOf(NOTES_START), end = text.indexOf(NOTES_END);
  if (start === -1 || end === -1) return NOTES_START + '\n\n' + NOTES_END;
  return text.slice(start, end + NOTES_END.length);
}

function skillTable(problems) {
  const rows = ['| Problem | Steps | Keys | Goal |', '|---|---|---|---|'];
  for (const problem of problems) {
    for (const span of goalSpans(problem.id)) {
      const steps = span.from === span.to ? String(span.from + 1) : (span.from + 1) + '-' + (span.to + 1);
      const keys = problem.route.slice(span.from, span.to + 1).join(' ');
      rows.push('| ' + problem.id + ' | ' + steps + ' | `' + keys + '` | ' + cell(span.goal) + ' |');
    }
  }
  return rows.join('\n');
}

const skills = [...new Set(CALCULATOR_PROBLEMS.map(problem => problem.skillId))];
const sections = skills.map(skillId => {
  const problems = CALCULATOR_PROBLEMS.filter(problem => problem.skillId === skillId);
  return '## ' + skillId + ' (' + problems[0].title + ')\n\n' + skillTable(problems);
});

const text = `# Calculator goal hints: teacher review

Source: \`apstat-park/calculator-goals.mjs\` (edit the phrases there). The tables below are generated
from it by \`node scripts/build-calculator-goals-review.mjs\`; do not edit them by hand.

A goal is what the student sees at hint rung 1 (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §1): one phrase per
route key, and consecutive keys that serve the same purpose share it, so each row is one goal and the
keys it covers. Steps count from 1. Keys are the physical keys (\`2ND Y=\` is STAT PLOT).

${existingNotes()}

${sections.join('\n\n')}
`;

writeFileSync(target, text);
console.log('Wrote ' + skills.length + ' skill tables for ' + CALCULATOR_PROBLEMS.length + ' problems.');
