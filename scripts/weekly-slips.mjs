import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import '../lib/class-snapshot.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIND = { worksheet: 'worksheet', quiz: 'quiz', blooket: 'flashcard deck' };

// The CURRENT quarter comes from the server (/class/snapshot reports it from today's date).
// Other quarters carry placeholder numbers (a lone Unit-2 lesson lands in Q3 with a 50), so any
// "pick the quarter with a number" heuristic mis-reads a 100 as a 50. Fallback when the server
// key is unavailable: the earliest quarter that has lessons due.
export function currentQuarterKey(quarters, serverKey) {
  if (serverKey && quarters && quarters[serverKey]) return serverKey;
  const keys = Object.keys(quarters || {}).filter(key => /^Q[0-9]+$/.test(key))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return keys.find(key => (quarters[key]?.lessonsDue || 0) > 0) || keys[0] || null;
}

export function quarterGrade(student, serverKey) {
  const key = currentQuarterKey(student.quarters, serverKey);
  const grade = key ? student.quarters[key]?.quarterGrade : null;
  return Number.isFinite(grade) ? grade : null;
}

export function missingWork(lessons, period, date) {
  if (!Array.isArray(lessons) || !period || !date) return [];
  const result = [];
  for (const lesson of lessons) {
    if (!lesson?.lessonKey || !lesson.zeroDate?.[period]) continue;
    const zeroDate = lesson.zeroDate[period];
    const daysLeft = Math.round((new Date(zeroDate + 'T00:00:00') - new Date(date + 'T00:00:00')) / 86400000);
    if (daysLeft > 3) continue;
    const row = { lessonKey: lesson.lessonKey, zeroDate, daysLeft, past: zeroDate < date };
    if (lesson.lessonGradeNoQuiz == null && lesson.Cws == null) result.push({ ...row, kind: 'worksheet' });
    if ((lesson.quizTotal || 0) > 0 && lesson.Q == null) result.push({ ...row, kind: 'quiz' });
    if (lesson.hasBlooket && lesson.blooket == null) result.push({ ...row, kind: 'blooket' });
  }
  const order = { worksheet: 0, quiz: 1, blooket: 2 };
  return result.sort((a, b) => a.zeroDate.localeCompare(b.zeroDate) || order[a.kind] - order[b.kind]);
}

export function isCandidate(grade, missing, { all = false, min = 70 } = {}) {
  return all || (grade != null && grade < min) || missing.some(item => item.past);
}

// Lowest-scoring items that are already due: the plan when nothing is missing (every one is revisable).
export function lowestDueScores(lessons, period, date) {
  const scored = [];
  for (const lesson of lessons || []) {
    const zeroDate = lesson && lesson.zeroDate && lesson.zeroDate[period];
    if (!zeroDate || zeroDate >= date) continue;
    if (lesson.lessonGradeNoQuiz != null && lesson.lessonGradeNoQuiz < 90) scored.push({ lessonKey: lesson.lessonKey, kind: 'worksheet', score: lesson.lessonGradeNoQuiz });
    if ((lesson.quizTotal || 0) > 0 && lesson.Q != null && lesson.Q < 90) scored.push({ lessonKey: lesson.lessonKey, kind: 'quiz', score: lesson.Q });
    if (lesson.hasBlooket && lesson.blooket != null && lesson.blooket < 90) scored.push({ lessonKey: lesson.lessonKey, kind: 'flashcard deck', score: lesson.blooket });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, 3);
}

// The three "What to do first" lines: missing items first; otherwise the lowest due scores;
// never three blank lines.
export function planFor(lessons, missing, period, date) {
  const first = doFirst(lessons, missing);
  if (first.length) return first.map(item => `Finish ${item.lessonKey} ${KIND[item.kind]}.`);
  const lowest = lowestDueScores(lessons, period, date);
  if (lowest.length) return lowest.map(item => `Raise your ${item.lessonKey} ${item.kind} (now ${Math.round(item.score)}) - it is revisable.`);
  return ['Nothing is missing. Ask Mr. Colson which scores to revisit.'];
}

export function doFirst(lessons, missing) {
  const empty = {
    worksheet: !lessons.some(lesson => lesson.lessonGradeNoQuiz != null || lesson.Cws != null),
    quiz: !lessons.some(lesson => lesson.Q != null),
    blooket: !lessons.some(lesson => lesson.blooket != null),
  };
  const order = new Map(lessons.map((lesson, index) => [lesson.lessonKey, index]));
  return [...missing].sort((a, b) => Number(empty[b.kind]) - Number(empty[a.kind])
    || Number(b.past) - Number(a.past) || a.zeroDate.localeCompare(b.zeroDate)
    || order.get(a.lessonKey) - order.get(b.lessonKey)).slice(0, 3);
}

export function latexText(value) {
  // Mirror dok/build_ladder.py's character-wise escaping; also protect backslash and tilde.
  const escapes = {
    '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_', '{': '\\{', '}': '\\}',
    '^': '\\textasciicircum{}', '\\': '\\textbackslash{}', '~': '\\textasciitilde{}',
    '≥': '$\\geq$', '≤': '$\\leq$', '≠': '$\\neq$', '±': '$\\pm$', '×': '$\\times$', '−': '-',
    '→': '$\\rightarrow$', 'μ': '$\\mu$', 'σ': '$\\sigma$', 'α': '$\\alpha$', 'β': '$\\beta$',
    'χ': '$\\chi$', 'Σ': '$\\sum$', '√': '$\\surd$', '·': '$\\cdot$', '∩': '$\\cap$', '∪': '$\\cup$',
    '…': '\\ldots{}', '—': '---', '–': '--', '’': "'", '“': '``', '”': "''",
  };
  const sequences = { 'x̄₁': '$\\bar{x}_1$', 'x̄₂': '$\\bar{x}_2$', 'μ₀': '$\\mu_0$',
    'μ₁': '$\\mu_1$', 'μ₂': '$\\mu_2$', 'μ_D': '$\\mu_D$', 'σ₁²': '$\\sigma_1^2$' };
  return String(value ?? '').split(/(x̄₁|x̄₂|μ₀|μ₁|μ₂|μ_D|σ₁²)/u)
    .map(part => sequences[part] || [...part].map(ch => escapes[ch] || (/\s/u.test(ch) ? ' ' : ch)).join('')).join('');
}

// Real students only: the teacher's own row and smoke/test accounts must not enter the picture.
export function realStudents(students) {
  return (students || []).filter(student => student && student.role !== 'teacher' && !/^zz_/.test(String(student.username || '')));
}

export function boxSummary(students, quarterKey) {
  const values = realStudents(students).map(student => quarterGrade(student, quarterKey)).filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
  if (values.length < 5) return null;
  const five = globalThis.ClassSnapshot.fiveNumber(values);
  const fences = globalThis.ClassSnapshot.fences(five);
  const inside = values.filter(value => value >= fences.low && value <= fences.high);
  return { ...five, lowerWhisker: inside[0], upperWhisker: inside.at(-1),
    outliers: globalThis.ClassSnapshot.outliers(values, five) };
}

export function whenText(item) {
  const day = new Date(item.zeroDate + 'T00:00:00Z');
  const label = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()]} ${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
  return item.past ? `already a 0 (${label})` : `0 after ${label}`;
}

export function renderSlip(student, section, date, summary, quarterKey) {
  const lessons = student.lessons || [];
  const missing = missingWork(lessons, section.slice(-1), date);
  const grade = quarterGrade(student, quarterKey);
  const own = grade == null ? null : Math.round(grade);
  const week = new Date(date + 'T00:00:00Z');
  // Friday's printout is handed out Monday; weekdays label their current school week.
  const weekday = week.getUTCDay();
  week.setUTCDate(week.getUTCDate() + (weekday === 0 ? 1 : weekday >= 5 ? 8 - weekday : 1 - weekday));
  const weekLabel = week.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  let plot = 'Not enough classmates yet.';
  if (summary) {
    const s = summary;
    const position = own == null ? 'no grade yet' : own < s.q1 ? 'below Q1' : own > s.q3 ? 'above Q3' : 'within Q1--Q3';
    plot = String.raw`\begin{tikzpicture}
\begin{axis}[width=\linewidth,height=1.05in,scale only axis=false,boxplot/draw direction=x,
  xmin=${Math.min(0, s.min)},xmax=${Math.max(100, s.max)},ymin=0,ymax=2,ytick=\empty,axis y line=none,axis x line=bottom]
\addplot+[boxplot prepared={lower whisker=${s.lowerWhisker},lower quartile=${s.q1},median=${s.median},upper quartile=${s.q3},upper whisker=${s.upperWhisker}}] coordinates {};
${s.outliers.length ? String.raw`\addplot[only marks,mark=o,black] coordinates {${s.outliers.map(value => `(${value},1)`).join(' ')}};` : ''}
${own == null ? '' : String.raw`\addplot[only marks,mark=*,red] coordinates {(${own},0.4)};`}
\end{axis}
\end{tikzpicture}
\par Class median ${s.median} $\cdot$ you ${own ?? 'not yet graded'} $\cdot$ ${position}`;
  }
  const rows = missing.map(item => `${latexText(item.lessonKey)} & ${KIND[item.kind]} & ${latexText(whenText(item))} \\\\`).join('\n');
  const steps = planFor(lessons, missing, section.slice(-1), date)
    .map((line, index) => `${index + 1}. ${latexText(line)}\\par`).join('\n');
  return String.raw`\Slip{
{\large\bfseries Where you stand --- ${latexText(student.realName || student.name || student.username || 'Student')}}\par
Period ${section.slice(-1)} --- week of ${weekLabel}\par
${plot}
\par\medskip\textbf{Missing work}\par
\begin{tabularx}{\linewidth}{@{}l l X@{}}
\textbf{Item} & \textbf{Kind} & \textbf{Zero date} \\
${rows || String.raw`\multicolumn{3}{l}{No missing work within the warning window.} \\`}
\end{tabularx}
\par\medskip\textbf{What to do first}\par
${steps}
\par\medskip Every item on this list can still be finished. Desk $\rightarrow$ My Ledger $\rightarrow$ Missing work.
}`;
}

export function renderTex(students, candidates, section, date, quarterKey) {
  const summary = boxSummary(students, quarterKey);
  const pages = [];
  for (let index = 0; index < candidates.length; index += 2) {
    const top = renderSlip(candidates[index], section, date, summary, quarterKey);
    const bottom = candidates[index + 1] ? renderSlip(candidates[index + 1], section, date, summary, quarterKey) : '\\Slip{}';
    pages.push(`\\SlipPage{${top}}{${bottom}}`);
  }
  return String.raw`\documentclass[10pt,letterpaper]{article}
\usepackage[margin=0.65in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{helvet,tabularx,pgfplots,adjustbox}
\usepgfplotslibrary{statistics}
\pgfplotsset{compat=1.18}
\renewcommand{\familydefault}{\sfdefault}
\pagestyle{empty}
\setlength{\parindent}{0pt}
% Two fixed half-page cells. Scale long missing lists to fit, never omit rows.
\newcommand{\Slip}[1]{\begin{minipage}[t][4.7in][t]{\linewidth}\vspace{0pt}\begin{adjustbox}{max totalsize={\linewidth}{4.6in}}\begin{minipage}{\linewidth}#1\end{minipage}\end{adjustbox}\end{minipage}}
\newcommand{\SlipPage}[2]{\noindent#1\par\vspace{0.15in}\noindent#2\par}
\begin{document}
${pages.join('\n\\newpage\n') || 'No printed candidates.'}
\end{document}
`;
}

export function parseArgs(args) {
  const options = { sections: ['PeriodB', 'PeriodE'], out: path.join(os.homedir(), 'grade-backups', 'slips'),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (['--all', '--dry-run', '--no-pdf'].includes(flag)) {
      options[{ '--all': 'all', '--dry-run': 'dryRun', '--no-pdf': 'noPdf' }[flag]] = true;
      continue;
    }
    if (!['--section', '--min', '--out', '--date'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--section') {
      if (!['PeriodB', 'PeriodE'].includes(value)) throw new Error('Section must be PeriodB or PeriodE');
      options.sections = [value];
    }
    if (flag === '--min') {
      options.min = Number(value);
      if (!Number.isFinite(options.min)) throw new Error('--min must be a number');
    }
    if (flag === '--out') options.out = path.resolve(value);
    if (flag === '--date') options.date = value;
  }
  const date = new Date(options.date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== options.date) throw new Error('--date must be a valid YYYY-MM-DD');
  return options;
}

export function assertSafeOut(directory, repo = REPO) {
  const out = path.resolve(directory);
  // Resolve existing ancestors too, so a junction cannot hide a destination inside the repo.
  let ancestor = out;
  const suffix = [];
  while (!fs.existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Cannot resolve output directory');
    ancestor = parent;
  }
  const realOut = path.join(fs.realpathSync(ancestor), ...suffix);
  for (const candidate of [out, realOut]) {
    const relative = path.relative(fs.realpathSync(repo), candidate);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) continue;
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', candidate], { cwd: repo });
    if (ignored.status !== 0) throw new Error('Refusing output inside the repository unless gitignored (student names are private)');
  }
  return out;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const out = assertSafeOut(options.out);
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'grade-backups', 'config.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!config.teacherKey || !config.rosterUrl) throw new Error('config.json requires teacherKey and rosterUrl');
  const counts = [];
  for (const section of options.sections) {
    const url = `${config.rosterUrl.replace(/\/+$/, '')}/class/grades?section=${section}`;
    const response = await fetch(url, { headers: { 'x-teacher-secret': config.teacherKey }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${section}: grade request failed (${response.status})`);
    const doc = await response.json();
    if (!doc.ok || !Array.isArray(doc.students)) throw new Error(`${section}: gradebook unavailable`);
    // The server names the current quarter (from today's date); never guess it from the payload.
    let quarterKey = null;
    try {
      const rosterBase = config.rosterUrl.endsWith('/') ? config.rosterUrl.slice(0, -1) : config.rosterUrl;
      const snapRes = await fetch(`${rosterBase}/class/snapshot?section=${section}`, { headers: { 'x-teacher-secret': config.teacherKey }, signal: AbortSignal.timeout(60000) });
      if (snapRes.ok) quarterKey = (await snapRes.json()).quarter || null;
    } catch (_) { quarterKey = null; }
    const students = realStudents(doc.students);
    const candidates = students.filter(student => isCandidate(quarterGrade(student, quarterKey),
      missingWork(student.lessons, section.slice(-1), options.date), options));
    counts.push({ section, count: candidates.length });
    if (options.dryRun) {
      console.log(`${section}: ${candidates.length} candidates`);
      for (const student of candidates) console.log(JSON.stringify({ name: student.realName || student.username,
        quarterGrade: quarterGrade(student, quarterKey), missing: missingWork(student.lessons, section.slice(-1), options.date) }));
      continue;
    }
    fs.mkdirSync(out, { recursive: true });
    const stem = `${options.date}-${section}-slips`;
    fs.writeFileSync(path.join(out, stem + '.tex'), renderTex(students, candidates, section, options.date, quarterKey));
    if (!options.noPdf) {
      for (let pass = 0; pass < 2; pass++) {
        const result = spawnSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', stem + '.tex'], { cwd: out, encoding: 'utf8' });
        if (result.error || result.status !== 0) throw new Error(`${section}: pdflatex failed; inspect ${path.join(out, stem + '.log')}`);
      }
    }
    console.log(`${section}: ${candidates.length} candidates -> ${path.join(out, stem + (options.noPdf ? '.tex' : '.pdf'))}`);
  }
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  console.log(`Slips: ${total} ${options.dryRun ? 'dry-run' : options.noPdf ? 'TeX-only' : 'printed'} candidates (${counts.map(row => `${row.section.slice(-1)} ${row.count}`).join(', ')}) -> ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
