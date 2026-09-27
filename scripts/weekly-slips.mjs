import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import '../lib/class-snapshot.js';
import '../lib/effort-facts.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIND = { worksheet: 'worksheet', quiz: 'quiz', blooket: 'flashcard deck' };
// The Desk's Missing-work button words (ap_stats_roadmap_square_mode.html _zeroCardRow).
const VERB = { worksheet: 'Open', quiz: 'Quiz', blooket: 'Flashcards' };
// Desk colours (SLIPS_V2_SPEC §1): counting-now row, not-yet row, tentative chip.
export const COLOR_DEFS = [
  '\\definecolor{deskred}{HTML}{CC0000}',
  '\\definecolor{deskredbg}{HTML}{FFF3F3}',
  '\\definecolor{deskyellow}{HTML}{D9B400}',
  '\\definecolor{deskyellowbg}{HTML}{FFF9DB}',
  '\\definecolor{desktentative}{HTML}{FFF3B0}',
  '\\definecolor{desktentativeink}{HTML}{8A6D00}',
  // The Desk's all-clear green: the "ahead of the calendar" praise line (EFFORT_VISIBILITY_SPEC §2).
  '\\definecolor{deskgreen}{HTML}{2A8A2A}',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The Desk's CED 2026 labels ("1.3 · Tabular …"), loaded from the same two browser files.
let cedLabelFn = null;
function loadCedLabels() {
  if (cedLabelFn) return cedLabelFn;
  try {
    const sandbox = {};
    sandbox.window = sandbox;
    for (const file of ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']) {
      runInNewContext(fs.readFileSync(path.join(REPO, file), 'utf8'), sandbox);
    }
    cedLabelFn = sandbox.cedLabel;
  } catch (_) {
    cedLabelFn = () => ({ mapped: false });
  }
  return cedLabelFn;
}

export function lessonLabel(lessonKey) {
  try {
    const label = loadCedLabels()(lessonKey);
    if (label && label.mapped && label.text) return label.text;
  } catch (_) { /* fall through */ }
  return String(lessonKey);
}

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
    // Bonus decks never zero in the grade, so they are never missing (Desk _zeroWarnings).
    if (lesson.hasBlooket && !lesson.blooketBonus && lesson.blooket == null) result.push({ ...row, kind: 'blooket' });
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
    '★': '$\\star$', '☆': '$\\star$',
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

// "Sun 9/27" for an ISO date (the Desk's _zeroDayText).
export function dayText(iso) {
  const day = new Date(iso + 'T00:00:00Z');
  return `${DAYS[day.getUTCDay()]} ${day.getUTCMonth() + 1}/${day.getUTCDate()}`;
}

// The date cell of a Missing-work row (the Desk's _zeroWhenText).
export function whenText(item) {
  return item.past ? `0 since ${dayText(item.zeroDate)}` : `0 after ${dayText(item.zeroDate)}`;
}

// The Desk card order: counting now first, then by zero date (missingWork is date-ordered).
export function orderMissing(missing) {
  const list = Array.isArray(missing) ? missing : [];
  return list.filter(item => item.past).concat(list.filter(item => !item.past));
}

// The slip's "First" item (the Desk's _snapFocus rule): the 0 counting longest, else the item
// that becomes a 0 soonest.
export function firstItem(missing) {
  const list = (Array.isArray(missing) ? missing : []).slice()
    .sort((a, b) => a.zeroDate.localeCompare(b.zeroDate));
  return list.find(item => item.past) || list[0] || null;
}

// `/class/snapshot?by=assignment` key: "<lessonKey>:<track>" (tracks share the missing kinds).
export function itemKey(item) {
  return `${item.lessonKey}:${item.kind}`;
}

function realValues(assignment) {
  const values = assignment && Array.isArray(assignment.values) ? assignment.values : [];
  return values.map(Number).filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
}

function tentativeOf(assignment) {
  const count = Math.round(Number(assignment && assignment.tentativeZeros));
  return count > 0 ? count : 0;
}

// The pooled assignment for a missing item, or null when it is not in the payload (a combined
// worksheet keyed by another lesson) or its numbers are withheld (n < 5).
export function findPooled(pool, item) {
  if (!Array.isArray(pool) || !item) return null;
  const key = itemKey(item);
  const found = pool.find(assignment => assignment && assignment.key === key);
  if (!found) return null;
  const count = realValues(found).length;
  if (count > 0 || count + tentativeOf(found) >= 5) return found;
  return null;
}

// The anonymous score strip (the Desk's _snapScoreList): tentative zeros first, then every real
// score. Exactly one chip is "you": a tentative 0 when the student's own 0 is tentative, else the
// matching real value in place, else the value inserted in order (the withOwn rule).
export function scoreStrip(assignment, ownValue, ownTentative) {
  const values = realValues(assignment);
  const tentative = tentativeOf(assignment);
  const ownIsTentative = Boolean(ownTentative) && ownValue != null && Math.round(ownValue) === 0 && tentative > 0;
  const chips = [];
  for (let index = 0; index < tentative; index++) {
    const isYou = ownIsTentative && index === tentative - 1;
    chips.push({ v: 0, kind: isYou ? 'you' : 'tent' });
  }
  const own = ownIsTentative || ownValue == null ? null : Math.round(ownValue);
  const inPool = own != null && values.includes(own);
  let placed = false;
  for (const value of values) {
    if (own != null && !placed && !inPool && value > own) {
      chips.push({ v: own, kind: 'you' });
      placed = true;
    }
    if (own != null && !placed && inPool && value === own) {
      chips.push({ v: value, kind: 'you' });
      placed = true;
      continue;
    }
    chips.push({ v: value, kind: 'real' });
  }
  if (own != null && !placed) chips.push({ v: own, kind: 'you' });
  return chips;
}

// Lead / foot / key sentences around the strip (the Desk's words). sections: the pooled
// payload's `sections` (EFFORT_VISIBILITY_V2_SPEC §2 names the periods; none → "classmates").
export function stripText(assignment, tentDay, sections) {
  const values = realValues(assignment);
  const tentative = tentativeOf(assignment);
  const total = values.length + tentative;
  const have = values.filter(value => value > 0).length;
  const words = globalThis.ClassSnapshot.scoreListWords(sections);
  // Teacher 2026-09-27: say these are OTHER students' scores (same words as the Desk's _snapScoreList).
  const whose = total === 1 ? '1 student’s score' : `${total} students’ scores`;
  const lead = `${whose}${words.from} for ${assignment.title || assignment.key}${tentative ? ` (${tentative} tentative)` : ''}:`;
  const tentText = tentative ? ` ${tentative} haven't yet — a tentative 0 until ${tentDay}.` : '';
  // Same words as the Desk's list under a missing item (a slip strip is always for one).
  const foot = `${have} of ${total} ${words.who} have a score here.${tentText} Every 0 on this list can still be replaced.`;
  const key = tentative
    ? `red = you · yellow = a 0 that is not counting yet · every other number is ${words.one}`
    : `red = you · every other number is ${words.one}`;
  return { lead, foot, key };
}

export const STRIP_UNAVAILABLE = "Class scores for this one aren't available yet.";

function chipTex(chip) {
  const value = String(Math.round(chip.v));
  if (chip.kind === 'tent') return `\\colorbox{desktentative}{\\textcolor{desktentativeink}{${value}}}`;
  if (chip.kind === 'you') return `\\colorbox{white}{\\textcolor{deskred}{\\textbf{\\underline{${value}}}}}`;
  return `\\colorbox{white}{${value}}`;
}

function keyTex(key) {
  return key.split(' · ').map(part => {
    if (part.startsWith('red = ')) return '\\KeyYou{red}' + latexText(part.slice(3));
    if (part.startsWith('yellow = ')) return '\\KeyTent{yellow}' + latexText(part.slice(6));
    return latexText(part);
  }).join(' $\\cdot$ ');
}

// When the tentative zeros become real (the Desk's _snapTentativeDay): the student's own section
// date while it is still ahead, else the soonest section date still ahead, else the item's date.
export function tentativeDay(assignment, section, date, fallbackIso) {
  const zeroDates = (assignment && assignment.zeroDates) || {};
  const mine = section ? zeroDates[section] : null;
  if (mine && mine >= date) return dayText(mine);
  const ahead = Object.values(zeroDates).filter(iso => iso && iso >= date).sort();
  if (ahead.length) return dayText(ahead[0]);
  return dayText((assignment && assignment.zeroDate) || fallbackIso);
}

// §1.3: one anonymous score strip for the slip's first item. Never fails the slip.
export function classStripTex(missing, pool, section, date) {
  const first = firstItem(missing);
  if (!first) return '';
  // fetchPool hangs the payload's `sections` on the pool array.
  const sections = pool && Array.isArray(pool.sections) ? pool.sections : null;
  // The heading runs into the lead on one line (saves a line on a full slip).
  const heading = '\\par\\smallskip\\textbf{' + latexText(globalThis.ClassSnapshot.scoreListWords(sections).heading) + '}\\quad\n';
  const assignment = findPooled(pool, first);
  if (!assignment) return heading + latexText(STRIP_UNAVAILABLE) + '\\par\n';
  // The student's own score here is missing: a 0, tentative while it is not counting yet.
  const chips = scoreStrip(assignment, 0, !first.past);
  const text = stripText(assignment, tentativeDay(assignment, section, date, first.zeroDate), sections);
  return heading
    + latexText(text.lead) + '\\par\n'
    // 10pt chips (9pt at density step 1+) with tight padding: a 30-chip strip of mostly 100s fits one 7.5in line.
    + '{\\ChipFont\\setlength{\\fboxsep}{1pt}\\raggedright\\sloppy '
    + chips.map(chipTex).join('\\hspace{1.5pt}') + '\\par}\n'
    + '{\\small ' + latexText(text.foot) + '\\par\n'
    + keyTex(text.key) + '\\par}\n';
}

// §1.2: one coloured row per missing item, verb first, in the Desk's order.
export function missingRowsTex(missing) {
  const rows = orderMissing(missing).map(item => {
    const bar = item.past ? 'deskred' : 'deskyellow';
    const background = item.past ? 'deskredbg' : 'deskyellowbg';
    const label = `${VERB[item.kind]} ${lessonLabel(item.lessonKey)}`;
    return `\\MissRow{${bar}}{${background}}{${latexText(label)}}{${latexText(whenText(item))}}`;
  });
  return rows.join('\n') || 'No missing work within the warning window.\\par';
}

// The plain words of each Missing-work row (label + date), for the column-width estimate.
export function missingRowTexts(missing) {
  return orderMissing(missing).map(item => `${VERB[item.kind]} ${lessonLabel(item.lessonKey)}  ${whenText(item)}`);
}

// Rough Helvetica glyphs per inch at each point size, and each size's line pitch in points.
const CHARS_PER_INCH = { 10: 14.5, 11: 13, 12: 11 };
const LINE_PITCH_PT = { 10: 12, 11: 13.6, 12: 14.5 };
const LINE_WIDTH_IN = 7.5;

function estimatedLines(text, widthInches, size) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / (widthInches * CHARS_PER_INCH[size])));
}

// The top block's left share: the one that makes the taller column (Missing-work rows on the
// left, effort + plan on the right) shortest. Ties keep the default 0.62.
export function leftColumnShare(rowTexts, rightParts) {
  let best = { share: 0.62, height: Infinity };
  for (const share of [0.62, 0.66, 0.56, 0.5, 0.44]) {
    const leftInches = share * LINE_WIDTH_IN - 0.2;   // minus the coloured bar and padding
    const rightInches = (0.98 - share) * LINE_WIDTH_IN;
    const rowLines = rowTexts.reduce((sum, text) => sum + estimatedLines(text, leftInches, 10), 0);
    const left = 11.5 * (1 + rowLines) + 2 * rowTexts.length;
    const right = 20 + rightParts.reduce((sum, part) => sum + LINE_PITCH_PT[part.size] * estimatedLines(part.text, rightInches, part.size), 0);
    const height = Math.max(left, right);
    if (height < best.height - 1) best = { share, height };
  }
  return best.share;
}

function weekLabelFor(date) {
  const week = new Date(date + 'T00:00:00Z');
  // Friday's printout is handed out Monday; weekdays label their current school week.
  const weekday = week.getUTCDay();
  week.setUTCDate(week.getUTCDate() + (weekday === 0 ? 1 : weekday >= 5 ? 8 - weekday : 1 - weekday));
  return week.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// §1.1: "Q1 so far: 31%. Class median 97."
export function headerLine(own, quarterLabel, summary) {
  const quarter = quarterLabel || 'This quarter';
  const grade = own == null ? `${quarter}: no grade yet.` : `${quarter} so far: ${own}%.`;
  return summary ? `${grade} Class median ${summary.median}.` : grade;
}

function positionText(own, summary) {
  if (own == null) return 'You: no grade yet.';
  const where = own < summary.q1 ? 'below Q1' : own > summary.q3 ? 'above Q3' : 'inside the box';
  return `You: ${own} — ${where}.`;
}

// §1.4: the section box plot, smaller and last.
function boxPlotTex(own, summary) {
  if (!summary) return 'Not enough classmates yet for a class box plot.\\par';
  const s = summary;
  // The "You: …" sentence runs on the heading line (renderSlip ends the heading with \quad).
  return String.raw`${latexText(positionText(own, s))}\par
\begin{tikzpicture}
\begin{axis}[width=\linewidth,height=\PlotHeight,scale only axis=false,boxplot/draw direction=x,
  xmin=${Math.min(0, s.min)},xmax=${Math.max(100, s.max)},ymin=0,ymax=2,ytick=\empty,axis y line=none,axis x line=bottom]
\addplot+[boxplot prepared={lower whisker=${s.lowerWhisker},lower quartile=${s.q1},median=${s.median},upper quartile=${s.q3},upper whisker=${s.upperWhisker}}] coordinates {};
${s.outliers.length ? String.raw`\addplot[only marks,mark=o,black] coordinates {${s.outliers.map(value => `(${value},1)`).join(' ')}};` : ''}
${own == null ? '' : String.raw`\addplot[only marks,mark=*,red] coordinates {(${own},0.4)};`}
\end{axis}
\end{tikzpicture}\par`;
}

// PC dates (progressChecks[n].adminDay2), read once per run.
let scheduleCache = null;
export function loadSchedule() {
  if (scheduleCache) return scheduleCache;
  try {
    scheduleCache = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'lesson-schedule.json'), 'utf8'));
  } catch (_) {
    scheduleCache = {};
  }
  return scheduleCache;
}

// EFFORT_VISIBILITY_SPEC §2: under the header, up to two short lines — the Progress Check on
// file (+ the 40% strategy) in black, and the "ahead of the calendar" praise behind a green square.
export function effortLines(student, section, date, quarterKey, schedule = loadSchedule()) {
  const facts = globalThis.EffortFacts;
  const period = section.slice(-1);
  const key = currentQuarterKey(student.quarters, quarterKey);
  const quarter = key ? student.quarters[key] : null;
  // UNROUNDED averages: the 40% gate test must see the engine's own numbers.
  const workAvg = quarter && Number.isFinite(quarter.workAvg) ? quarter.workAvg : null;
  const pcAvg = quarter && Number.isFinite(quarter.pcAvg) ? quarter.pcAvg : null;
  const pc = facts.pcOnFile(student.units, student.quarters, period, schedule, date, key);
  const pcText = pc ? [facts.pcLine(pc), facts.strategyLine(pc, workAvg, facts.GRADE_FLOOR, pcAvg)].filter(Boolean).join(' ') : '';
  const aheadText = facts.aheadLine(facts.aheadLessons(student.lessons, period, date), topicNumber);
  return { pc: pcText, ahead: aheadText };
}

// The topic number the student sees for a lesson key ('3.1' → '1.10'); the key when unmapped.
export function topicNumber(lessonKey) {
  try {
    const label = loadCedLabels()(lessonKey);
    if (label && label.mapped && label.bonus) return `★ ${label.label}`;
    if (label && label.mapped && label.id) return label.id;
  } catch (_) { /* fall through */ }
  return String(lessonKey);
}

export function effortTex(student, section, date, quarterKey, schedule = loadSchedule()) {
  const lines = effortLines(student, section, date, quarterKey, schedule);
  const out = [];
  if (lines.pc) out.push(`{\\small ${latexText(lines.pc)}\\par}`);
  if (lines.ahead) out.push(`{\\small\\textcolor{deskgreen}{\\rule{5pt}{5pt}}\\hspace{4pt}${latexText(lines.ahead)}\\par}`);
  return out.length ? '\\smallskip\n' + out.join('\n') + '\n' : '';
}

export function renderSlip(student, section, date, summary, quarterKey, pool = null) {
  const lessons = student.lessons || [];
  const missing = missingWork(lessons, section.slice(-1), date);
  const grade = quarterGrade(student, quarterKey);
  const own = grade == null ? null : Math.round(grade);
  const quarterLabel = currentQuarterKey(student.quarters, quarterKey);
  const plan = planFor(lessons, missing, section.slice(-1), date);
  const steps = plan.map((line, index) => `${index + 1}. ${latexText(line)}\\par`).join('\n');
  const name = student.realName || student.name || student.username || 'Student';
  const header = headerLine(own, quarterLabel, summary);
  const effort = effortLines(student, section, date, quarterKey);
  const share = leftColumnShare(missingRowTexts(missing), [
    { text: effort.pc, size: 10 },
    { text: effort.ahead, size: 10 },
    { text: 'What to do first', size: 11 },
    ...plan.map((line, index) => ({ text: `${index + 1}. ${line}`, size: 11 })),
    { text: 'Every item on this list can still be finished. Desk → My Ledger → Missing work.', size: 11 },
  ]);
  // \SlipBody[left share]{header}{effort}{missing rows}{score strip}{box plot}{what to do first}{footer}:
  // the arguments stay in reading order; \SlipBody lays them out (the name first at full width,
  // then rows left and effort + plan right).
  return String.raw`\Slip{\SlipBody[${share}]{%
{\fontsize{12}{14.5}\bfseries Where you stand --- ${latexText(name)}\par}
{\small Period ${section.slice(-1)} --- week of ${weekLabelFor(date)} $\cdot$ {\bfseries ${latexText(header)}}\par}}{%
${effortTex(student, section, date, quarterKey)}}{%
\textbf{Missing work}\par
${missingRowsTex(missing)}}{%
${classStripTex(missing, pool, section, date)}}{%
\textbf{Your section's quarter grades}\quad
${boxPlotTex(own, summary)}}{%
\medskip\textbf{What to do first}\par
${steps}
\par\medskip Every item on this list can still be finished. Desk $\rightarrow$ My Ledger $\rightarrow$ Missing work.\par}{%
{\footnotesize Printed ${latexText(dayText(date))}. ${latexText(globalThis.EffortFacts.COUNTING_NOTE)}}}
}`;
}

export function renderTex(students, candidates, section, date, quarterKey, pool = null) {
  const summary = boxSummary(students, quarterKey);
  const pages = [];
  for (let index = 0; index < candidates.length; index += 2) {
    const top = renderSlip(candidates[index], section, date, summary, quarterKey, pool);
    const bottom = candidates[index + 1] ? renderSlip(candidates[index + 1], section, date, summary, quarterKey, pool) : '\\Slip{}';
    pages.push(`\\SlipPage{${top}}{${bottom}}`);
  }
  return String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[left=0.5in,right=0.5in,top=0.45in,bottom=0.45in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{xcolor}
\usepackage{helvet,tabularx,pgfplots,adjustbox}
\usepgfplotslibrary{statistics}
\pgfplotsset{compat=1.18}
\renewcommand{\familydefault}{\sfdefault}
\pagestyle{empty}
\setlength{\parindent}{0pt}
${COLOR_DEFS.join('\n')}
% A Missing-work row: coloured left bar (a running-height \vrule) on a tinted background.
\newcommand{\MissRow}[4]{\par\noindent{\setlength{\fboxsep}{0pt}\colorbox{#2}{\textcolor{#1}{\vrule width 3pt}\hspace{5pt}\parbox[c]{\dimexpr\linewidth-11pt\relax}{\raggedright\strut#3\hspace{0.6em plus 1fill}\null\nobreak\hfill\mbox{#4}\strut}\hspace{3pt}}}\par\vspace{1pt}}
\newcommand{\KeyYou}[1]{\textcolor{deskred}{\textbf{\underline{#1}}}}
\newcommand{\KeyTent}[1]{{\setlength{\fboxsep}{1pt}\colorbox{desktentative}{\textcolor{desktentativeink}{#1}}}}
% Density steps: a slip that does not fit tightens its type instead of being scaled.
% 0 = rows 10pt, chips 10pt, plot 0.7in; 1 = rows + chips 9pt; 2 = also the right column 9.5pt
% and the plot 0.55in. \Slip tries them in order (measured, not guessed).
\newcommand{\SlipStep}[1]{\def\SlipStepNo{#1}%
\ifcase#1\relax
\def\RowFont{\fontsize{10}{11.5}\selectfont}\def\ChipFont{\small}\def\RightFont{}\def\PlotHeight{0.7in}%
\or
\def\RowFont{\fontsize{9}{10.5}\selectfont}\def\ChipFont{\fontsize{9}{10.5}\selectfont}\def\RightFont{}\def\PlotHeight{0.7in}%
\else
\def\RowFont{\fontsize{9}{10.5}\selectfont}\def\ChipFont{\fontsize{9}{10.5}\selectfont}\def\RightFont{\def\small{\fontsize{9.5}{11.5}\selectfont}\small}\def\PlotHeight{0.55in}%
\fi}
% One slip across the full width: the name first, then Missing-work rows left and effort + plan
% right; then the score strip, the box plot and the 9pt footer at full width.
% [#1] = the left column's share of the line (leftColumnShare picks it per slip).
% #2 = the full-width header (name first), #3 = effort lines, #4 = Missing-work rows.
\newcommand{\SlipBody}[8][0.62]{#2\smallskip\begin{minipage}[t]{#1\linewidth}\vspace{0pt}{\RowFont #4\par}\end{minipage}\hfill\begin{minipage}[t]{\dimexpr0.98\linewidth-#1\linewidth\relax}\vspace{0pt}\RightFont #3#7\end{minipage}\par
#5\par\smallskip #6\par\smallskip{\fontsize{9}{10.5}\selectfont #8\par}}
% Two fixed half-page cells with a dotted cut line between them. The adjustbox is a last-resort
% height cap only (after density step 2): a slip that fits is never scaled.
\newlength{\SlipH}
\newsavebox{\SlipBox}
\newcommand{\SlipTry}[2]{\SlipStep{#1}\sbox{\SlipBox}{\begin{minipage}{\linewidth}#2\end{minipage}}}
\newcommand{\SlipTooTall}{\ifdim\dimexpr\ht\SlipBox+\dp\SlipBox\relax>\SlipH}
\newcommand{\Slip}[1]{\SlipTry{0}{#1}%
\SlipTooTall\SlipTry{1}{#1}\fi
\SlipTooTall\SlipTry{2}{#1}\fi
\typeout{SLIPFIT step=\SlipStepNo\space height=\the\dimexpr\ht\SlipBox+\dp\SlipBox\relax\space limit=\the\SlipH}%
\begin{minipage}[t][\SlipH][t]{\linewidth}\vspace{0pt}\begin{adjustbox}{max totalheight=\SlipH}\usebox{\SlipBox}\end{adjustbox}\end{minipage}}
\newcommand{\SlipPage}[2]{\noindent\vbox to\textheight{\noindent#1\par\nointerlineskip\vbox to 0.25in{\vss\hbox to\linewidth{\color{gray}\dotfill}\vss}\nointerlineskip\noindent#2\par\vss}}
\begin{document}
\setlength{\SlipH}{\dimexpr(\textheight-0.25in)/2\relax}
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
    // No exception for gitignored folders: a slip carries names and a gitignore can change.
    throw new Error('Refusing output inside the repository (student names are private)');
  }
  return out;
}

// The pooled per-assignment class picture (both periods), fetched ONCE per run with the same
// headers as the per-section /class/snapshot call. null on any failure: slips then print the
// "not available yet" sentence instead of a strip.
export async function fetchPool(config) {
  try {
    const rosterBase = config.rosterUrl.endsWith('/') ? config.rosterUrl.slice(0, -1) : config.rosterUrl;
    const response = await fetch(`${rosterBase}/class/snapshot?section=all&by=assignment`, { headers: { 'x-teacher-secret': config.teacherKey }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) return null;
    const doc = await response.json();
    if (!Array.isArray(doc.assignments)) return null;
    // The strip names the pooled periods (EFFORT_VISIBILITY_V2_SPEC §2): carry `sections` along.
    const pool = doc.assignments;
    pool.sections = Array.isArray(doc.sections) ? doc.sections : null;
    return pool;
  } catch (_) {
    return null;
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const out = assertSafeOut(options.out);
  const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'grade-backups', 'config.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (!config.teacherKey || !config.rosterUrl) throw new Error('config.json requires teacherKey and rosterUrl');
  const counts = [];
  const pool = await fetchPool(config);
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
    fs.writeFileSync(path.join(out, stem + '.tex'), renderTex(students, candidates, section, options.date, quarterKey, pool));
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
