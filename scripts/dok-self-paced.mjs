/** Remove retired flow fields without reserializing problem content or line endings. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const phrases = JSON.parse(readFileSync(resolve(root, 'dok/self_paced_phrases.json'), 'utf8'));
export const deletedFields = ['minutes', 'exit_reflection', 'teacher.phase_tag',
  'teacher.teacher_does', 'teacher.students_do', 'teacher.adult_role'];

export function transform(text) {
  const counts = Object.fromEntries(deletedFields.map(field => [field, 0]));
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
  const output = [];
  let teacher = false;
  let removedIndent = null;
  let rewriteIndent = null;
  let rewrittenNotes = 0;
  for (const line of lines) {
    const content = line.replace(/\r?\n$/, '');
    const indent = content.length - content.trimStart().length;
    const field = content.match(/^\s*([a-z_]+):/);
    const continuation = !content.trim() || indent > (removedIndent ?? rewriteIndent)
      || (indent === (removedIndent ?? rewriteIndent) && content.trimStart().startsWith('- '));
    if (removedIndent !== null || rewriteIndent !== null) {
      if (continuation) continue;
      removedIndent = null;
      rewriteIndent = null;
    }
    if (field && indent === 0) teacher = field[1] === 'teacher';
    const key = field && (teacher && indent === 2 ? `teacher.${field[1]}` : indent === 0 ? field[1] : null);
    if (deletedFields.includes(key)) {
      counts[key]++;
      removedIndent = indent;
      continue;
    }
    if (teacher && field?.[1] === 'first_take_note' && /before the discussion/i.test(content)) {
      const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
      output.push('  first_take_note: Ungraded commitment; accept any evidence-based first impression.' + eol);
      rewriteIndent = indent;
      rewrittenNotes++;
      continue;
    }
    output.push(line);
  }
  return { text: output.join(''), counts, rewrittenNotes };
}

export function remainingPhrases(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    // Only filename metadata is exempt; matching problem text is reported, never rewritten.
    const prose = /^worksheets?:/.test(line) ? line.replace(/[\w.-]+_live\.html/gi, '') : line;
    return phrases.filter(phrase => prose.toLowerCase().includes(phrase.toLowerCase()))
      .map(phrase => ({ line: index + 1, phrase, text: line }));
  });
}

export function migrate(base = root, check = false) {
  const files = [];
  const remaining = [];
  for (const name of readdirSync(resolve(base, 'dok/lessons')).filter(name => name.endsWith('.yaml')).sort()) {
    const file = `dok/lessons/${name}`;
    const original = readFileSync(resolve(base, file), 'utf8');
    const result = transform(original);
    files.push({ file, counts: result.counts, rewrittenNotes: result.rewrittenNotes, changed: result.text !== original });
    remaining.push(...remainingPhrases(result.text).map(hit => ({ file, ...hit })));
    if (!check && result.text !== original) writeFileSync(resolve(base, file), result.text, 'utf8');
  }
  for (const name of readdirSync(resolve(base, 'dok/registry')).filter(name => name.endsWith('.jsonl')).sort()) {
    const file = `dok/registry/${name}`;
    remaining.push(...remainingPhrases(readFileSync(resolve(base, file), 'utf8')).map(hit => ({ file, ...hit })));
  }
  return { files, remaining };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(migrate(root, process.argv.includes('--check')), null, 2));
}
