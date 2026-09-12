import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const STUDENT_FLOOR = 4;
export const LABEL_CAP = 5;
export const WINDOW_DAYS = 14;
export const RECURRING_RUNS = 3;
export const SECTIONS = ['PeriodB', 'PeriodE'];
export const TRIAGE_PATH = 'roster-server/data/misconception-triage.json';
export const HOUSE_RULES = [
  'Author one original, standalone, self-paced bonus sheet in a fresh context.',
  'Four parts: (a) DOK 1, (b) DOK 2, (c) DOK 2, (d) DOK 3 integrating the targets.',
  'Scaffolds are checklists and frames with blanks; never answer-bearing hints.',
  'Print all required values, tables, definitions and a titled notes callout.',
  'No video, QR, timing, exit ticket or outside references.',
  'Part (d) is scored E/P/I by the teacher; nothing auto-scores.',
  'No student names or identifiers. Never modify existing or archived sheets.',
];

const rank = (a, b) => b.students - a.students || b.events - a.events || a.key.localeCompare(b.key);
const union = values => [...new Set(values)].sort();
const topicOrder = (a, b) => a.localeCompare(b, 'en', { numeric: true });

export function privacyFilter(payloads, { fragments = true } = {}) {
  const names = union(payloads.flatMap(payload => Object.entries(payload.students || {}).flatMap(([id, student]) =>
    [id, student.username, student.realName, ...(fragments ? String(student.realName || '').split(/\s+/) : [])]))).filter(Boolean);
  return value => {
    let text = String(value || '');
    for (const name of names.sort((a, b) => b.length - a.length)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'), '[redacted]');
    }
    return text.replace(/[\r\n]+/g, ' ').slice(0, 800);
  };
}

export function mergeSections(payloads) {
  const clean = privacyFilter(payloads, { fragments: false });
  const cleanEvidence = privacyFilter(payloads);
  const merged = new Map();
  for (const payload of payloads) {
    if (!payload.ok || !Array.isArray(payload.frequent)) throw new Error('Malformed misconceptions response');
    for (const row of payload.frequent) {
      if (typeof row.key !== 'string' || !Number.isInteger(row.students) || !Number.isInteger(row.events)) {
        throw new Error('Malformed frequent row');
      }
      if (clean(row.key) !== row.key) throw new Error('A label key contains private information');
      const current = merged.get(row.key) || { key: row.key, label: clean(row.label), students: 0, events: 0,
        lessons: [], skills: [], sections: [], evidence: [], recurringAfterTriage: false };
      current.students += row.students;
      current.events += row.events;
      current.lessons = union([...current.lessons, ...(row.lessons || [])]);
      current.skills = union([...current.skills, ...(row.skills || [])]);
      current.sections = union([...current.sections, payload.section]);
      current.recurringAfterTriage ||= row.recurringAfterTriage === true;
      const excerpts = (payload.evidence?.[row.key] || []).map(event => {
        const evidence = event.evidence || {};
        const text = event.source === 'mcq' ? `chose ${evidence.chosen}, correct ${evidence.correct}`
          : evidence.missing || evidence.feedback || '';
        return { itemId: clean(event.itemId), text: cleanEvidence(text) };
      }).filter(excerpt => excerpt.text);
      current.evidence = [...new Map([...current.evidence, ...excerpts].map(excerpt =>
        [JSON.stringify(excerpt), excerpt])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      merged.set(row.key, current);
    }
  }
  return [...merged.values()].sort(rank);
}

export function selectLabels(rows, triage, crosswalk) {
  const eligible = rows.filter(row => !triage.entries?.[row.key] || row.recurringAfterTriage).sort(rank);
  if (!eligible.length || eligible[0].students < STUDENT_FLOOR) return [];
  const lead = eligible[0];
  const mapped = row => row.lessons.map(lesson => crosswalk.map[lesson]).filter(topic => topic?.newTopic);
  const near = row => mapped(row).some(topic => mapped(lead).some(other =>
    topic.newUnit === other.newUnit && Math.abs(Number(topic.newTopic.split('.')[1]) - Number(other.newTopic.split('.')[1])) <= 1));
  return [lead, ...eligible.slice(1).filter(near), ...eligible.slice(1).filter(row => !near(row))].slice(0, LABEL_CAP);
}

export function makeBrief(selected, date) {
  if (!selected.length) return 'below floor\n';
  const topics = union(selected.flatMap(row => row.lessons)).sort(topicOrder);
  if (!topics.length || topics.some(topic => !/^\d+\.\d+$/.test(topic))) throw new Error('Cannot derive sheet topics');
  const lines = [`# Weekly DOK brief: ${date}`, `Window: ${WINDOW_DAYS} days`, `Sheet key: ${topics.join('+')}`, ''];
  for (const row of selected) {
    lines.push(`## ${row.key}`, row.label, `Students: ${row.students}; events: ${row.events}`,
      `Lessons: ${row.lessons.join(', ')}`, `CED skills: ${row.skills.join(', ') || '(use the topic tethers)'}`);
    for (const excerpt of row.evidence.slice(0, 3)) lines.push(`- ${excerpt.itemId}: ${excerpt.text}`);
    lines.push('');
  }
  lines.push('## House rules', ...HOUSE_RULES.map(rule => `- ${rule}`));
  return lines.join('\n') + '\n';
}

export function publicationPaths(key, date) {
  const slug = key.replaceAll('+', '_');
  return [`dok/lessons/${slug}.yaml`, `dok/registry/${slug}.jsonl`,
    ...['pdf', 'tex'].flatMap(extension => ['student', 'board', 'teacher'].map(edition =>
      `dok/${extension}/aps_${slug}_${edition}.${extension}`)),
    'dok/manifest.json', TRIAGE_PATH, `state/weekly-dok/${date}-brief.md`];
}

export function itemSkills(row, skillMap) {
  if (row.skills?.length) return row.skills;
  return union((row.itemIds || []).map(id => skillMap[id]?.skill).filter(skill => /^[1-4]\.[A-Z]$/.test(skill || '')));
}

// Monday-to-Sunday week index; a Friday-night run and its Saturday-morning catch-up share one week.
export function weekOf(value) {
  return Math.floor((Date.parse(value) - Date.UTC(1970, 0, 5)) / (7 * 86400000));
}

export function alreadyRanThisWeek(triage, date) {
  return (triage.weeklyRuns || []).some(run => weekOf(run.at) === weekOf(`${date}T21:00:00.000Z`));
}

export function recordWeeklyRun(triage, payloads, date) {
  const at = `${date}T21:00:00.000Z`;
  const week = weekOf;
  const keys = union(payloads.flatMap(payload => (payload.postTriageFrequent || []).map(row => row.key)));
  const runs = (triage.weeklyRuns || []).filter(run => week(run.at) !== week(at));
  runs.push({ at, keys });
  triage.weeklyRuns = runs.sort((a, b) => a.at.localeCompare(b.at));
  const recent = triage.weeklyRuns.slice(-RECURRING_RUNS);
  return new Set(Object.entries(triage.entries).filter(([key, entry]) =>
    recent.length === RECURRING_RUNS && recent.every((run, index) =>
      run.at.slice(0, 10) > entry.triagedAt && run.keys.includes(key) &&
      (index === 0 || week(run.at) === week(recent[index - 1].at) + 1))).map(([key]) => key));
}

// Every effect is injected so failure tests never invoke an author, compiler or publisher.
export async function runWeekly(options, io) {
  const mode = options.mode || 'dry-run';
  if (!['dry-run', 'apply', 'push-only'].includes(mode)) throw new Error('Unknown mode');
  if (mode !== 'dry-run') {
    await io.recoverPending();
    if (mode === 'push-only') return { status: 'push-only' };
    await io.preflight(options);
  }
  const date = io.date();
  const originalTriage = await io.readTriage();
  // The Saturday catch-up trigger must never author a second sheet after a completed Friday run.
  if (mode === 'apply' && !options.now && alreadyRanThisWeek(originalTriage, date)) {
    io.log('Already ran this week; nothing to do');
    return { status: 'already ran' };
  }
  const payloads = await io.fetchSections();
  const triage = await io.backfill(structuredClone(originalTriage));
  const rows = mergeSections(payloads);
  const recurring = recordWeeklyRun(triage, payloads, date);
  for (const row of rows) row.recurringAfterTriage ||= recurring.has(row.key);
  const selected = selectLabels(rows, triage, await io.crosswalk());
  const brief = makeBrief(selected, date);
  io.log(brief);
  if (mode === 'dry-run') return { status: selected.length ? 'dry-run' : 'below floor', brief };
  if (!selected.length) {
    // Successful observations must survive quiet weeks or recurrence can never accumulate.
    // No sheet or publication is created; the history ships with the next successful sheet.
    await io.writeTriage(triage);
    return { status: 'below floor', brief };
  }
  const key = union(selected.flatMap(row => row.lessons)).sort(topicOrder).join('+');
  const paths = publicationPaths(key, date);
  let commit = null;
  try {
    await io.checkCollisions(paths);
    await io.writeBrief(paths.at(-1), brief);
    await io.author({ key, date, selected, brief });
    await io.validate();
    await io.compile(key.replaceAll('+', '_'));
    await io.tests();
    const title = await io.audit({ key, date, selected, paths });
    for (const row of selected) triage.entries[row.key] = {
      label: row.label, sheet: key, sheetTitle: title, triagedAt: date,
      students: row.students, sections: row.sections,
    };
    await io.writeTriage(triage);
    await io.normalize(paths);
    await io.stage(paths);
    await io.detectChanges();
    commit = await io.commit(`Weekly DOK sheet ${date}: ${title} — targets ${selected.map(row => row.key).join(', ')}`);
  } catch (error) {
    try { await io.unstage(paths); }
    finally { await io.writeTriage(originalTriage); }
    throw error;
  }
  try {
    await io.approvePush();
    await io.push();
    await io.verifyClean(paths);
  } catch {
    io.log(`Push failed; local weekly commit retained: ${commit}`);
    throw new Error(`Publication incomplete; retained local commit ${commit}`);
  }
  return { status: 'published', commit, brief };
}

export function createRuntime(root, overrides = {}) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const json = file => JSON.parse(read(file));
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text.replace(/\r\n/g, '\n'));
  };
  const command = (program, args, input) => {
    if (overrides.command) return overrides.command(program, args, input);
    try {
      return execFileSync(program, args, { cwd: root, input, encoding: 'utf8',
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    } catch {
      // Subprocess output can contain evidence or credentials; report the boundary only.
      throw new Error(`${path.basename(program)} failed`);
    }
  };
  const git = args => command('git', args).trim();
  const yaml = file => JSON.parse(command('python', ['-c',
    'import json,sys,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1],encoding="utf-8")),default=str))', file]));
  const trackedChanges = () => git(['diff', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  const historyOnlyChange = () => {
    if (!trackedChanges().includes(TRIAGE_PATH)) return false;
    const before = JSON.parse(git(['show', `HEAD:${TRIAGE_PATH}`]));
    const after = json(TRIAGE_PATH);
    delete before.weeklyRuns;
    delete after.weeklyRuns;
    return JSON.stringify(before) === JSON.stringify(after);
  };
  const vitest = () => command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
    ...fs.readdirSync(path.join(root, 'tests')).filter(name => /^dok-.*\.test\.js$/.test(name)).map(name => `tests/${name}`)]);
  const empty = { schema: 'apstats-misconception-triage/v1', entries: {}, weeklyRuns: [] };
  let privateFilter = value => value;
  const io = {
    log: text => console.log(text),
    date: () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    crosswalk: () => json('2026-crosswalk.json'),
    readTriage: () => fs.existsSync(path.join(root, TRIAGE_PATH)) ? json(TRIAGE_PATH) : structuredClone(empty),
    writeTriage: value => write(TRIAGE_PATH, JSON.stringify(value, null, 2) + '\n'),
    backfill: triage => {
      const lesson = yaml('dok/lessons/1.1_1.2_1.4_1.7.yaml');
      for (const key of lesson.misconceptions) {
        triage.entries[key] ||= { label: key.replace(/^label:/, ''), sheet: lesson.topic,
          sheetTitle: lesson.title, triagedAt: '2026-09-12', students: 0, sections: SECTIONS };
      }
      return triage;
    },
    fetchSections: async () => {
      const env = Object.fromEntries(read('roster-server/.env').split(/\r?\n/).flatMap(line => {
        const match = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
        return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
      }));
      const secret = env.ROSTER_TEACHER_SECRET || env.TEACHER_SECRET;
      if (!secret) throw new Error('Teacher secret missing from roster-server/.env');
      const payloads = [];
      const skillMap = json('data/skill-map.json');
      for (const section of SECTIONS) {
        const url = new URL('/class/misconceptions', 'https://roster-production-12c1.up.railway.app');
        url.search = new URLSearchParams({ section, days: String(WINDOW_DAYS) });
        const response = await fetch(url, { headers: { 'x-teacher-secret': secret }, signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`Misconceptions request failed (${response.status})`);
        const payload = { ...await response.json(), section };
        for (const row of payload.frequent || []) {
          row.skills = itemSkills(row, skillMap);
          if (row.skills?.length) continue;
          row.skills = union((row.lessons || []).flatMap(topic => {
            if (!/^\d+\.\d+$/.test(topic)) return [];
            const [unit, lesson] = topic.split('.');
            const file = `ai-tutor/u${unit}_l${lesson}.md`;
            if (!fs.existsSync(path.join(root, file))) return [];
            return read(file).match(/\b[1-4]\.[A-F]\b/g) || [];
          }));
        }
        payloads.push(payload);
      }
      privateFilter = privacyFilter(payloads, { fragments: false });
      return payloads;
    },
    preflight: options => {
      if (git(['branch', '--show-current']) !== 'master') throw new Error('Weekly publishing requires master');
      if (git(['diff', '--cached', '--name-only'])) throw new Error('Index must be empty');
      if (trackedChanges().some(file => file !== TRIAGE_PATH || !historyOnlyChange())) throw new Error('Tracked working files must be clean');
      const now = new Date();
      const fridayNight = now.getDay() === 5 && now.getHours() >= 21;
      const saturdayMorning = now.getDay() === 6 && now.getHours() < 12;
      if (!options.now && (!(fridayNight || saturdayMorning) || io.date() < '2026-09-18')) {
        throw new Error('Outside the Friday-night / Saturday-morning window; use --now for an intentional manual run');
      }
    },
    recoverPending: () => {
      if (git(['branch', '--show-current']) !== 'master') throw new Error('Weekly recovery requires master');
      git(['fetch', 'origin', 'master']);
      const pending = git(['log', '--format=%H%x09%s', 'origin/master..HEAD']).split('\n').filter(Boolean);
      if (!pending.length) {
        if (git(['rev-list', '--count', 'HEAD..origin/master']) !== '0') git(['merge', '--ff-only', 'origin/master']);
        return;
      }
      if (pending.some(line => !line.split('\t')[1]?.startsWith('Weekly DOK sheet '))) {
        throw new Error('Unpublished non-weekly commits require manual review');
      }
      if (trackedChanges().length || git(['diff', '--cached', '--name-only'])) throw new Error('Pending recovery requires clean tracked files');
      const hashes = pending.map(line => line.split('\t')[0]).join(', ');
      try {
        if (git(['rev-list', '--count', 'HEAD..origin/master']) !== '0') {
          try { git(['rebase', 'origin/master']); }
          catch { git(['rebase', '--abort']); throw new Error('Pending weekly rebase failed'); }
        }
        io.approvePush();
        io.push();
      } catch {
        io.log(`Pending weekly publication failed; local commits retained: ${hashes}; HEAD ${git(['rev-parse', 'HEAD'])}`);
        throw new Error('Pending weekly publication failed; no new sheet selected');
      }
    },
    checkCollisions: paths => {
      for (const file of paths.filter(file => !['dok/manifest.json', TRIAGE_PATH].includes(file))) {
        if (fs.existsSync(path.join(root, file))) throw new Error('Selected sheet key or brief already exists');
      }
    },
    writeBrief: write,
    author: ({ key, date, brief }) => {
      const contexts = [];
      for (const directory of ['dok/lessons', 'dok/archive/lessons']) {
        for (const file of fs.readdirSync(path.join(root, directory)).filter(file => file.endsWith('.yaml')).sort()) {
          const lesson = yaml(`${directory}/${file}`);
          const registry = directory.replace('/lessons', '/registry') + '/' + file.replace(/\.yaml$/, '.jsonl');
          const stems = read(registry).trim().split('\n').map(line => JSON.parse(line).stem).filter(Boolean);
          contexts.push(`${lesson.title}: ${stems.join(' ')}`);
        }
      }
      const prompt = `${read('tools/weekly-dok-author-prompt.md')}\n${brief}\nDate: ${date}; key: ${key}\n\nExisting contexts:\n${contexts.join('\n')}\n`;
      const codex = path.join(process.env.APPDATA, 'npm/node_modules/@openai/codex/bin/codex.js');
      command(process.execPath, [codex, 'exec', '--approve-for-me', '-m', 'gpt-6-astra',
        '-c', 'model_reasoning_effort="medium"', '-'], prompt);
    },
    validate: () => command('python', ['dok/build_ladder.py', '--validate']),
    compile: slug => command('powershell', ['-NoProfile', '-File', 'dok/compile.ps1', slug]),
    tests: () => { vitest(); command('pytest', ['tests/test_dok_build.py', '-q']); },
    audit: ({ key, date, selected, paths }) => {
      if (git(['diff', '--cached', '--name-only'])) throw new Error('Author staged files');
      const lesson = yaml(paths[0]);
      if (lesson.topic !== key || lesson.standalone !== true || lesson.generated?.by !== 'weekly-auto' ||
          String(lesson.generated?.on) !== date || lesson.generated?.window_days !== WINDOW_DAYS ||
          JSON.stringify(lesson.misconceptions) !== JSON.stringify(selected.map(row => row.key))) {
        throw new Error('Authored metadata does not match the brief');
      }
      const rows = read(paths[1]).trim().split('\n').map(line => JSON.parse(line));
      if (rows.length !== 1 || rows[0].feedback_channel !== 'feedback_dok3_human_channel' ||
          JSON.stringify(rows[0].parts.map(part => part.dok)) !== '[1,2,2,3]') throw new Error('Authored ladder mismatch');
      if (trackedChanges().some(file => file !== 'dok/manifest.json' && (file !== TRIAGE_PATH || !historyOnlyChange()))) {
        throw new Error('Author changed existing tracked files');
      }
      for (const file of paths.filter(file => /\.(yaml|jsonl|tex)$/.test(file))) {
        const text = read(file);
        // Redaction changes newlines/length; compare individual lines instead.
        if (text.split(/\r?\n/).some(line => privateFilter(line) !== line.slice(0, 800))) throw new Error('Private information in authored output');
      }
      for (const file of paths.slice(0, 9)) if (!fs.existsSync(path.join(root, file))) throw new Error('Missing publication artifact');
      return lesson.title;
    },
    normalize: paths => {
      for (const file of paths.filter(file => !file.endsWith('.pdf'))) write(file, read(file));
    },
    stage: paths => {
      git(['add', '--', ...paths]);
      const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
      if (staged.some(file => !paths.includes(file))) throw new Error('Unexpected staged path');
      const required = paths.filter(file => file !== TRIAGE_PATH);
      if (required.some(file => !staged.includes(file))) throw new Error('Missing staged artifact');
    },
    unstage: paths => git(['reset', '--quiet', 'HEAD', '--', ...paths]),
    detectChanges: () => {
      const cli = path.join(process.env.APPDATA, 'npm/node_modules/gitnexus/dist/cli/index.js');
      const result = command(process.execPath, [cli, 'detect-changes', '--scope', 'staged', '-r', 'apstats-live-worksheet']);
      if (/"error"\s*:/.test(result)) throw new Error('GitNexus change detection failed');
    },
    commit: message => { git(['commit', '-m', message]); return git(['rev-parse', 'HEAD']); },
    approvePush: () => fs.writeFileSync(path.resolve(root, git(['rev-parse', '--git-path', 'PUSH_APPROVED'])), ''),
    push: () => git(['push', 'origin', 'master']),
    verifyClean: paths => {
      if (git(['status', '--porcelain', '--', ...paths])) throw new Error('Publication paths are dirty');
    },
  };
  return Object.assign(io, overrides);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2);
  const modes = flags.filter(flag => ['--dry-run', '--apply', '--push-only'].includes(flag));
  if (modes.length > 1 || flags.some(flag => !['--dry-run', '--apply', '--push-only', '--now'].includes(flag))) {
    console.error('Usage: node scripts/weekly-dok.mjs [--dry-run|--apply|--push-only] [--now]');
    process.exitCode = 1;
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    runWeekly({ mode: (modes[0] || '--dry-run').slice(2), now: flags.includes('--now') }, createRuntime(root))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
