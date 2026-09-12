/** Exact, EOL-preserving mappings from state/dok-video-free-PLAN.md.
 * Run with --check to preview; no argument applies the changes.
 * Remaining prerequisites are reported for human rewriting, never guessed.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const mappings = [
  [
    "minutes",
    "\\bvideo_worksheet(?=:)",
    "explore"
  ],
  [
    "phase",
    "^  phase_tag:[^\\r\\n]*(?:\\r?\\n {4}\\S[^\\r\\n]*)*",
    "  phase_tag: First take $\\rightarrow$ rules + (a)--(c) $\\rightarrow$ turn in"
  ],
  [
    "exit",
    "One thing the video changed about my first take",
    "One thing the rules box changed about my first take"
  ],
  [
    "group_exit",
    "One claim I would revise after both videos",
    "One claim I would revise after reading the rules box"
  ],
  [
    "first_note",
    "(first_take_note:[^\\r\\n]*)before the video",
    null
  ],
  [
    "start",
    "Start the video follow-along at minute 5\\.",
    "At minute 5, read the rules box aloud once; students start (a)."
  ],
  [
    "begin",
    "Begin the (?:(?:combined |lesson )?(?:\\d+\\.\\d+(?:--\\d+\\.\\d+)? )?)?video follow-along at minute 5",
    "At minute 5, read the rules box aloud once; students start (a)"
  ],
  [
    "run_named",
    "Run the named video follow-along, then allow about 10 minutes for parts \\(a\\)--\\(c\\)\\.",
    "Read the rules box; work (a) and (b). Allow about 10 minutes to finish (a)--(c)."
  ],
  [
    "do",
    "Do the video follow-along \\(the DOK-1/2 work of the day\\)\\.",
    "Work (a) and (b) from the rules box and the stem."
  ],
  [
    "complete_stock",
    "Complete the video follow-along worksheet\\.",
    "Work (a) and (b) from the rules box and the stem."
  ],
  [
    "first_sentence",
    "Write a one-sentence first take before the video\\.",
    "Write a one-sentence first take before any discussion."
  ],
  [
    "play_topic",
    "Play the topic video; pause for the follow-along\\.",
    "Read the rules box; take one question on each rule."
  ],
  [
    "play_group",
    "Play both topic videos in teaching order; pause for each follow-along\\.",
    "Read the rules box; work (a) then (b) in teaching order."
  ],
  [
    "group_commit",
    "Commit one sentence before watching\\.",
    "Commit one sentence before any discussion."
  ],
  [
    "group_work",
    "Complete both follow-alongs, then finish this single problem and turn it in\\.",
    "Work (a)--(c) in order from the rules box, then turn in one sheet."
  ],
  [
    "stem",
    "Suppose a video platform has 5,000 active accounts",
    "Suppose a streaming platform has 5,000 active accounts"
  ]
];

export function transform(text, kind = 'yaml') {
  const counts = {};
  for (const [id, pattern, replacement] of mappings) {
    counts[id] = 0;
    if ((kind === 'jsonl') !== (id === 'stem')) continue;
    const expression = new RegExp(pattern.replaceAll('(?P<', '(?<'), 'gm');
    text = text.replace(expression, (match, prefix) => {
      let result = replacement;
      if (id === 'first_note') result = prefix + 'before the discussion';
      if (id === 'phase' && /^standalone: true\r?$/m.test(text)) {
        result = result.replace('(c)', '(d)');
      }
      if (result !== match) counts[id]++;
      return result;
    });
  }
  return { text, counts };
}

export function migrate(root, check = false) {
  const counts = Object.fromEntries(mappings.map(([id]) => [id, 0]));
  const changedFiles = [];
  const remaining = [];
  for (const [directory, extension] of [['lessons', 'yaml'], ['registry', 'jsonl']]) {
    const folder = resolve(root, 'dok', directory);
    for (const name of readdirSync(folder).filter(name => name.endsWith('.' + extension)).sort()) {
      const file = resolve(folder, name);
      const original = readFileSync(file, 'utf8');
      const result = transform(original, extension);
      for (const [id, count] of Object.entries(result.counts)) counts[id] += count;
      if (result.text !== original) {
        changedFiles.push(`dok/${directory}/${name}`);
        if (!check) writeFileSync(file, result.text, 'utf8');
      }
      result.text.split(/\r?\n/).forEach((line, index) => {
        const prose = line.replace(/[\w.-]+_live\.html/gi, '');
        if (/video|follow[ -]along|watching/i.test(prose)) {
          remaining.push({ file: `dok/${directory}/${name}`, line: index + 1, before: line });
        }
      });
    }
  }
  return { counts, changedFiles, remaining };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(JSON.stringify(migrate(root, process.argv.includes('--check')), null, 2));
}
