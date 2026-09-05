// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schedulePaths = [
  'data/lesson-schedule.json',
  'roster-server/data/lesson-schedule.json'
];
// Captured before any CED relabel implementation. Dates and grade identities
// must remain identical even when calendar cells gain presentation metadata.
const scheduleSha256 = '15393ad27a085340248de945239a8a7b7f5a0cfa740593855ba33cc92df6b90c';
const deskSource = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const crosswalk = JSON.parse(readFileSync(resolve(repo, '2026-crosswalk.json'), 'utf8')).map;

function functionSource(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(deskSource);
  if (!match) throw new Error('Desk function not found: ' + name);
  let depth = 0;
  for (let index = deskSource.indexOf('{', match.index); index < deskSource.length; index += 1) {
    if (deskSource[index] === '{') depth += 1;
    if (deskSource[index] === '}' && --depth === 0) return deskSource.slice(match.index, index + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function declarationSource(name, opening, closing) {
  const match = new RegExp('const\\s+' + name + '\\s*=').exec(deskSource);
  if (!match) throw new Error('Desk declaration not found: ' + name);
  let depth = 0;
  for (let index = deskSource.indexOf(opening, match.index); index < deskSource.length; index += 1) {
    if (deskSource[index] === opening) depth += 1;
    if (deskSource[index] === closing && --depth === 0) return deskSource.slice(match.index, index + 1) + ';';
  }
  throw new Error('Unbalanced Desk declaration: ' + name);
}

function createDesk({ period = 'B', role = 'student', preview = false, viewAs = false } = {}) {
  const dom = new JSDOM('<div id="cg"></div><div id="pb"></div><div id="pl"></div>'
    + '<div id="resource-header"></div><div id="tip"></div>', {
    url: 'https://desk.test/ap_stats_roadmap_square_mode.html',
    runScripts: 'outside-only'
  });
  const win = dom.window;
  win.REGISTRY = { lessons: {} };
  // Deliberately stale local role: the signed-in roster role must also permit
  // the OLD bridge. Preview and view-as must suppress it even for a teacher.
  win.localStorage.setItem('apstats_user_role', 'teacher');
  if (preview) win.sessionStorage.setItem('apstats_preview_as_student', '1');
  if (viewAs) win.sessionStorage.setItem('apstats_view_as_context', '{"studentId":"fixture-student"}');
  win.rosterClient = { current: () => role ? { studentId: 'fixture', role } : null };
  for (const file of ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']) {
    win.eval(readFileSync(resolve(repo, file), 'utf8'));
  }
  win.configureCedLabels(() => win.REGISTRY);
  Object.assign(win, {
    cP: period,
    cYear: 'SY26-27',
    tdy: () => new win.Date(2026, 8, 2),
    getStudentMarks: () => ({}),
    getStudentEmail: () => '',
    calNextUpTopic: () => null,
    localLessonState: () => '',
    _prevTopicInSequence: () => null,
    _isLessonUnlocked: () => true,
    paintDonowCells: () => {},
    maybeBumpThenOpen: vi.fn(),
    hTip: () => {},
    mTip: () => {},
    _pollArchive: {},
    _calPageOffset: 0,
    _calStepWeeks: 2,
    _calNextUp: null,
    _todayLessonInf: null,
    _todayLessonDS: '',
    tip: win.document.getElementById('tip')
  });
  const functions = [
    'd', 'dateFromArr', 'buildOffSet', 'enumWeekdays', 'injectPcPosterEvents', 'generateSchedule',
    'eq', '_resourcePanelEsc', '_deskIsTeacher', 'cedTeacherBridgeAllowed',
    'getRegistryEntry', 'getAllRegistryEntries', '_orderedPeriodTopics', 'quarterOfDate',
    'cls', 'htm', 'cellAria', 'rCal', 'rProg', 'sTip', 'lookupTopic'
  ];
  win.eval('var R="review",OFF="off",EX="exam",PO="post",NC="noclass";\n'
    + 'var MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];\n'
    + 'var DN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
    + functions.map(functionSource).join('\n') + '\n'
    + declarationSource('QUARTER_WINDOWS', '[', ']') + '\n'
    + declarationSource('QUARTER_BAND_LABEL', '{', '}') + '\n'
    + declarationSource('SY2627_PACING_B', '[', ']') + '\n'
    + declarationSource('SY2627_PACING_E', '[', ']') + '\n'
    + declarationSource('SCHEDULE_DEFS', '{', '}') + '\n'
    + 'var S=generateSchedule(SCHEDULE_DEFS["SY26-27"]);');
  // Execute the actual header portion, stopping before unrelated resource,
  // completion, flashcard, and network machinery. The DOM setter stays real.
  const panel = functionSource('showResourcePanel');
  const resourceBoundary = panel.indexOf("    let html = '';");
  if (resourceBoundary < 0) throw new Error('Resource header boundary not found');
  win.eval(panel.slice(0, resourceBoundary) + '}');
  return dom;
}

function collectCalendar(win) {
  const byTopic = new Map();
  for (let offset = 0; offset <= 40; offset += 2) {
    win._calPageOffset = offset;
    win.rCal();
    for (const cell of win.document.querySelectorAll('#cg .dc[data-topic]')) {
      byTopic.set(cell.dataset.topic, {
        text: cell.textContent,
        heading: cell.querySelector('.tl').textContent,
        aria: cell.getAttribute('aria-label'),
        classes: [...cell.classList],
        timestamp: Number(cell.dataset.dts)
      });
    }
  }
  return byTopic;
}

describe('CED relabel preserves schedule bytes', () => {
  it.each(schedulePaths)('%s matches the pre-change SHA256', (path) => {
    const bytes = readFileSync(resolve(repo, path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(scheduleSha256);
  });

  it('the real generator produces identical JSON without writing either schedule', () => {
    const before = schedulePaths.map((path) => readFileSync(resolve(repo, path)));
    const output = execFileSync(process.execPath, ['scripts/build-lesson-schedule-sy2627.mjs', '--check'], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true
    });
    expect(output).toContain('--check: both files match the Desk calendar');
    schedulePaths.forEach((path, index) => {
      const after = readFileSync(resolve(repo, path));
      expect(after.equals(before[index])).toBe(true);
      expect(createHash('sha256').update(after).digest('hex')).toBe(scheduleSha256);
    });
  });
});

describe('CED helper data and refresh', () => {
  it.each(['4.1-4.2', '4.1–4.2'])('translates full range %s without adding lessons or changing grade decimals', (key) => {
    const dom = createDesk();
    try {
      const expected = '2.3 · Estimating Probabilities Using Simulation · Day 1 / '
        + '2.3 · Estimating Probabilities Using Simulation · Day 2';
      expect(dom.window.cedLabel(key).text).toBe(expected);
      expect(dom.window.cedDisplayText('Drills ' + key)).toBe('Drills ' + expected);
      expect(dom.window.cedReferenceText('Finish Topic ' + key + '. Your grade is 83.2.'))
        .toBe('Finish ' + expected + '. Your grade is 83.2.');
    } finally { dom.window.close(); }
  });

  it('treats a range spanning different OLD units as unmapped', () => {
    const dom = createDesk();
    try {
      expect(dom.window.cedLabel('4.1-5.2')).toMatchObject({ mapped: false, text: 'Lesson' });
      expect(dom.window.cedReferenceText('Review Topic 4.1-5.2.')).toBe('Review Lesson.');
    } finally { dom.window.close(); }
  });

  it.each(['4.2-1', '4.1-1000'])('treats malformed or oversized range %s as an unmapped lesson', (key) => {
    const dom = createDesk();
    try {
      expect(dom.window.cedLabel(key)).toMatchObject({ mapped: false, text: 'Lesson' });
      expect(dom.window.cedDisplayText('Quiz ' + key)).toBe('Quiz Lesson');
    } finally { dom.window.close(); }
  });

  it('describes compound OLD keys through their actual CED coverage', () => {
    const dom = createDesk();
    try {
      expect(dom.window.cedTopicCoverage(['4.1-2', '4.3', '9.4+9.5']))
        .toBe('CED topics 2.3–2.4 · ★ Beyond the Exam');
      expect(dom.window.cedLabel('4.1-2').text)
        .toBe('2.3 · Estimating Probabilities Using Simulation · Day 1 / 2.3 · Estimating Probabilities Using Simulation · Day 2');
    } finally { dom.window.close(); }
  });

  it('the offline fallback exactly matches the authoritative crosswalk', () => {
    const dom = createDesk();
    try {
      expect(JSON.parse(JSON.stringify(dom.window.CED2026_CROSSWALK))).toEqual(crosswalk);
      expect(dom.window.cedLabel('3.1').text).toBe('1.10 · Investigative Question & Data Collection · Day 1');
      expect(dom.window.cedLabel('9.6').mapped).toBe(false);
      expect(dom.window.cedLabel('9.6').text).not.toContain('9.6');
    } finally { dom.window.close(); }
  });

  it('refreshes cached and already-built cell labels when live metadata changes', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      const cell = win.d('3.1', 'OLD 3.1', 3);
      expect(cell.ced.text).toContain('Investigative Question');
      win.REGISTRY.lessons['3.1'] = { ced2026: { ...crosswalk['3.1'], newLabel: 'Updated live title' } };
      expect(win.htm(cell, 'Oct 1')).toContain('Updated live title');
      win.REGISTRY.lessons['3.1'].ced2026.newLabel = 'Second live title';
      expect(win.cedLabel('3.1').text).toContain('Second live title');
      win.REGISTRY.lessons['3.1'].ced2026 = null;
      expect(win.htm(cell, 'Oct 1')).not.toMatch(/3\.1|Updated live title|Second live title/);
    } finally { win.close(); }
  });
});

describe('student calendar CED labels', () => {
  it.each(['B', 'E'])('renders every current core lesson in period %s without OLD labels', (period) => {
    const dom = createDesk({ period });
    const win = dom.window;
    try {
      const visible = collectCalendar(win);
      const core = Object.entries(crosswalk).filter(([, entry]) => entry.status === 'core');
      expect([...visible.keys()].filter(key => /^\d+\.\d+$/.test(key)).sort()).toEqual(core.map(([key]) => key).sort());
      for (const [oldKey, entry] of core) {
        const cell = visible.get(oldKey);
        const foldedKeys = core.filter(([, other]) => other.newTopic === entry.newTopic).map(([key]) => key);
        const day = foldedKeys.length > 1 ? ' · Day ' + (foldedKeys.indexOf(oldKey) + 1) : '';
        expect(cell.heading).toBe(entry.newTopic + ' · ' + entry.newLabel + day);
        expect(cell.text).toContain(entry.newTopic + ' · ' + entry.newLabel);
        expect(cell.text).not.toMatch(/\b[6-9]\.\d+\b|Unit [6-9]|\(old |→/);
        expect(cell.aria).not.toMatch(/\b[6-9]\.\d+\b|Unit [6-9]|\(old |→/);
        expect(cell.classes).toContain('cell-u' + entry.newUnit);
        const scheduled = JSON.parse(readFileSync(resolve(repo, schedulePaths[0]), 'utf8')).lessons[oldKey].periods[period];
        const date = new win.Date(cell.timestamp);
        expect([date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-'))
          .toBe(scheduled.split('-').map(Number).join('-'));
      }
    } finally { win.close(); }
  });

  it('numbers every folded group in actual pacing order, including three-day chi-square', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      const groups = new Map();
      for (const row of win.S) {
        const cell = row[3];
        const entry = cell && crosswalk[cell.t];
        if (!entry || entry.status !== 'core') continue;
        if (!groups.has(entry.newTopic)) groups.set(entry.newTopic, []);
        groups.get(entry.newTopic).push(cell);
      }
      const folded = [...groups.values()].filter(cells => cells.length > 1);
      expect(folded).toHaveLength(10);
      for (const cells of folded) {
        cells.forEach((cell, index) => {
          const label = win.cedLabel(cell.t);
          expect(label.day).toBe(index + 1);
          expect(label.days).toBe(cells.length);
          expect(label.text).toMatch(new RegExp(' · Day ' + (index + 1) + '$'));
          expect(win.htm(cell, 'Oct 1')).not.toContain('(old ');
        });
      }
      expect(groups.get('3.14').map(cell => cell.t)).toEqual(['8.1', '8.4', '8.5']);
    } finally { win.close(); }
  });

  it('renders a real bonus fixture with its own tone without adding it to the school schedule', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      expect(win.S.some(row => row[3] && row[3].t === '9.5')).toBe(false);
      const bonus = win.d('9.5', '9.5 · Test for Slope', 9);
      win.S = [[2026, 8, 2, bonus, bonus]];
      win.rCal();
      const cell = win.document.querySelector('[data-topic="9.5"]');
      expect(cell.classList.contains('cell-bonus')).toBe(true);
      expect(cell.textContent).toContain('★ Beyond the Exam · Slope inference');
      expect(cell.textContent).not.toContain('9.5');
      expect(deskSource).toMatch(/--bonus\s*:/);
      expect(deskSource).toMatch(/--bonus-t\s*:/);
    } finally { win.close(); }
  });

  it('renders PC/poster events without reading the removed baked event maps', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      Object.defineProperties(win.REGISTRY, {
        progressChecks: { get() { throw new Error('Dead baked PCs were read'); } },
        posters: { get() { throw new Error('Dead baked posters were read'); } }
      });
      const visible = collectCalendar(win);
      for (let unit = 1; unit <= 5; unit += 1) {
        expect(visible.get('U' + unit + '-PC1').text).toContain('U' + unit + ' PC 1/2');
        expect(visible.get('U' + unit + '-Poster').text).toContain('U' + unit + ' Poster');
      }
      expect([...visible.values()].some(cell => /Unit [6-9]|U[6-9]\b/.test(cell.text))).toBe(false);
      const baked = declarationSource('BAKED_REGISTRY', '{', '}');
      expect(baked).not.toMatch(/"progressChecks"\s*:|"posters"\s*:/);
    } finally { win.close(); }
  });

  it('keeps click routing on the OLD key while displaying its NEW topic', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      const lesson = win.d('3.1', '3.1 OLD title', 3);
      win.S = [[2026, 8, 2, lesson, lesson]];
      win.rCal();
      win.document.querySelector('[data-topic="3.1"]').click();
      expect(win.maybeBumpThenOpen).toHaveBeenCalledWith(lesson, 'Sep 2');
      expect(lesson.t).toBe('3.1');
      expect(lesson.u).toBe(3);
      expect(lesson.n).toBe('3.1 OLD title');
    } finally { win.close(); }
  });
});

describe('progress and teacher bridge', () => {
  it('orders real progress segments by the five CED units, then bonus and review', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      win.rProg();
      expect([...win.document.querySelectorAll('.prog-seg')].map(node => node.textContent))
        .toEqual(['U1', 'U2', 'U3', 'U4', 'U5', 'Rev']);
      const bonus = win.d('9.5', 'Old bonus', 9);
      win.S.push([2027, 4, 10, bonus, bonus]);
      win.rProg();
      expect([...win.document.querySelectorAll('.prog-seg')].map(node => node.textContent))
        .toEqual(['U1', 'U2', 'U3', 'U4', 'U5', '★', 'Rev']);
    } finally { win.close(); }
  });

  it.each([
    { role: 'student', allowed: false },
    { role: null, allowed: false },
    { role: 'teacher', allowed: true },
    { role: 'teacher', preview: true, allowed: false },
    { role: 'teacher', viewAs: true, allowed: false }
  ])('gates the header and tooltip bridge for $role / preview $preview / view-as $viewAs', (session) => {
    const dom = createDesk(session);
    const win = dom.window;
    try {
      const lesson = win.d('3.1', '3.1 → 1.10 · Investigative Question & Data Collection', 3);
      win.showResourcePanel(lesson, 'Oct 1');
      const header = win.document.getElementById('resource-header').textContent;
      expect(header).toMatch(/^1\.10 · Investigative Question & Data Collection/);
      expect(header).toContain('CED Unit 1');
      win.sTip({}, new win.Date(2026, 9, 1), lesson, 'Oct 1');
      const tooltip = win.tip.textContent;
      expect(tooltip).toContain('1.10 · Investigative Question & Data Collection');
      if (session.allowed) {
        expect(header).toContain('(old 3.1: video "Unit 3 Lesson 1", worksheet u3_lesson1)');
        expect(tooltip).toContain('(old 3.1)');
      } else {
        expect(header).not.toMatch(/3\.1|u3_lesson1|Unit 3 Lesson 1/);
        expect(tooltip).not.toMatch(/3\.1|\(old /);
      }
    } finally { win.close(); }
  });

  it('keeps archived calendar cell text and colors intact', () => {
    const dom = createDesk();
    const win = dom.window;
    try {
      win.cYear = 'SY25-26';
      const lesson = win.d('8.4', 'Expected Counts', 8);
      expect(win.cls(lesson)).toBe('cell-u8');
      expect(win.htm(lesson, 'Apr 10')).toContain('8.4');
      win.cYear = 'SUMMER26';
      expect(win.cls(lesson)).toBe('cell-u8');
    } finally { win.close(); }
  });
});
