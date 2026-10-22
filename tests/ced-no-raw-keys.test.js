// @vitest-environment node
// tests/ced-no-raw-keys.test.js — CED2026_SINGLE_SOURCE_SPEC.md §4 (follow-alongs guard).
//
// Old lesson keys ("3.5", "3.6-7") are storage ids; students never read them. This renders the
// student-facing strings with the REAL Desk functions + the shared label helper for every
// scheduled lesson and fails on any "1.13"-shaped number that is not a CED topic of that lesson.
// Known-safe numbers are excluded by CONTEXT (part of a bigger number like 84.3, or a percent
// like 3.5%), never by allow-listing values.
//
// Allowed on purpose (spec §2): data-* attributes, ids, URLs, hover titles "stored as 3.5", and
// the "Schoology: <column>" tag, which names the column Schoology has TODAY (old titles until
// tools/schoology_rename_columns.py runs and SCHOOLOGY_TITLES_CED flips).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { cedTopicLabel, expandedTopicKeys, CED_CROSSWALK } from '../lib/ced-label.mjs';
import { buildGradebookColumns } from '../roster-server/gradebook-grid.js';
import { cedAssignmentTitle, cedRetitleGradebook } from '../roster-server/ced-titles.js';
import { SCHOOLOGY_TITLES_CED } from '../roster-server/grade-config.js';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
const desk = deskHtml();
const desk_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this
const CED_SOURCE = read('js/ced2026-crosswalk.js') + '\n' + read('js/ced2026-labels.js');
const SCHEDULE = JSON.parse(read('data/lesson-schedule.json'));
const COLUMN_TITLES = JSON.parse(read('data/ced-column-titles.json')).columns;
const LESSON_KEYS = Object.keys(SCHEDULE.lessons);
const opened = [];
afterEach(() => opened.splice(0).forEach((win) => win.close()));

function fnBody(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(desk_SRC);
  if (!match) throw new Error('Desk function not found: ' + name);
  let depth = 0;
  for (let i = desk_SRC.indexOf('{', match.index); i < desk_SRC.length; i++) {
    if (desk_SRC[i] === '{') depth++;
    else if (desk_SRC[i] === '}' && --depth === 0) return desk_SRC.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function declaration(name, opening, closing) {
  const match = new RegExp('const\\s+' + name + '\\s*=').exec(desk_SRC);
  if (!match) throw new Error('Desk declaration not found: ' + name);
  let depth = 0;
  for (let i = desk_SRC.indexOf(opening, match.index); i < desk_SRC.length; i++) {
    if (desk_SRC[i] === opening) depth++;
    if (desk_SRC[i] === closing && --depth === 0) return desk_SRC.slice(match.index, i + 1) + ';';
  }
  throw new Error('Unbalanced Desk declaration: ' + name);
}

// The CED topics a set of old keys may print ('3.6-7' → ['1.13']).
function cedTopicsOf(oldKeys) {
  const topics = new Set();
  for (const key of oldKeys.flatMap((k) => expandedTopicKeys(k))) {
    const label = cedTopicLabel(key);
    if (label.status === 'core') topics.add(label.topic);
  }
  return topics;
}

// "1.13"-shaped numbers that are not part of a bigger number or a percent.
function dottedNumbers(text) {
  return String(text).match(/(?<![\d.])[1-9]\.\d{1,2}(?![\d%]|\.\d)/g) || [];
}

function expectNoRawKeys(text, oldKeys, where) {
  const allowed = cedTopicsOf(oldKeys);
  const leaks = dottedNumbers(text).filter((n) => !allowed.has(n));
  expect(leaks, where + ': ' + JSON.stringify(text)).toEqual([]);
}

function newWindow(html = '') {
  const dom = new JSDOM(html, { url: 'https://desk.test/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only' });
  opened.push(dom.window);
  return dom.window;
}

describe('the checker itself', () => {
  it('flags an old key and ignores grades, percents and the lesson’s own CED topic', () => {
    expect(dottedNumbers('3.1 Blooket · 84.3 · 3.5% · 1.10 Day 1')).toEqual(['3.1', '1.10']);
    expect([...cedTopicsOf(['3.1'])]).toEqual(['1.10']);
  });
});

describe('crosswalk coverage: no silent fallthrough to the old key', () => {
  it('every scheduled lesson has a crosswalk entry and labels without a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const key of LESSON_KEYS) {
      expect(CED_CROSSWALK.map[key], key).toBeTruthy();
      expect(cedTopicLabel(key).status, key).not.toBe('unmapped');
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('every core entry maps to exactly one CED topic inside its CED unit; every bonus entry names its unit', () => {
    for (const [key, entry] of Object.entries(CED_CROSSWALK.map)) {
      expect(['core', 'bonus'], key).toContain(entry.status);
      if (entry.status === 'bonus') {
        expect(entry.newTopic, key).toBeNull();
        expect(entry.bonusUnit, key).toBeGreaterThanOrEqual(1);
        continue;
      }
      expect(entry.newTopic, key).toMatch(/^[1-5]\.\d{1,2}$/);
      expect(Number(entry.newTopic.split('.')[0]), key).toBe(entry.newUnit);
      expect(String(entry.newLabel || '').trim(), key).not.toBe('');
    }
  });

  it('names the five CED units', () => {
    expect(Object.keys(CED_CROSSWALK.units)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('Desk tile header (showResourcePanel)', () => {
  // A signed-in teacher outside preview is the worst case: the old-key bridge exists, but only
  // as the header's hover title.
  function createDesk() {
    const win = newWindow('<div id="cg"></div><div id="pb"></div><div id="pl"></div><div id="resource-header"></div><div id="tip"></div>');
    win.REGISTRY = { lessons: {} };
    win.localStorage.setItem('apstats_user_role', 'teacher');
    win.rosterClient = { current: () => ({ studentId: 'fixture', role: 'teacher' }) };
    win.eval(CED_SOURCE);
    win.configureCedLabels(() => win.REGISTRY);
    Object.assign(win, {
      cP: 'B', cYear: 'SY26-27', tdy: () => new win.Date(2026, 8, 2), getStudentMarks: () => ({}),
      getStudentEmail: () => '', calNextUpTopic: () => null, localLessonState: () => '',
      _prevTopicInSequence: () => null, paintDonowCells: () => {}, maybeBumpThenOpen: () => {},
      hTip: () => {}, mTip: () => {}, _pollArchive: {}, _calPageOffset: 0, _calOnToday: false,
      _calStepWeeks: 2, _calNextUp: null, _todayLessonInf: null, _todayLessonDS: '',
      tip: win.document.getElementById('tip'),
    });
    const functions = ['d', 'groupTopics', 'groupLabel', 'eq', '_resourcePanelEsc', '_deskIsTeacher',
      'cedTeacherBridgeAllowed', 'getRegistryEntry', 'getAllRegistryEntries', 'sTip', 'lookupTopic'];
    win.eval('var R="review",OFF="off",EX="exam",PO="post",NC="noclass";\n'
      + 'var DN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];\n'
      + functions.map(fnBody).join('\n') + '\n'
      + declaration('VIDEO_MINUTES', '{', '}'));
    const panel = fnBody('showResourcePanel');
    win.eval(panel.slice(0, panel.indexOf("    let html = '';")) + '}');
    return win;
  }

  it('prints only the CED label for every scheduled lesson; the old key lives in the hover title', () => {
    const win = createDesk();
    for (const key of LESSON_KEYS) {
      const lesson = win.d(key, key, 1);
      win.showResourcePanel(lesson, 'Oct 1');
      const header = win.document.getElementById('resource-header');
      expectNoRawKeys(header.textContent, [key], 'tile header ' + key);
      win.sTip({}, new win.Date(2026, 9, 1), lesson, 'Oct 1');
      const tipText = win.tip.textContent.replace(/\(stored as [^)]*\)/g, '');
      expectNoRawKeys(tipText, [key], 'calendar tooltip ' + key);
    }
  });
});

describe('Desk missing-work rows', () => {
  const ROW_FNS = ['_zeroSchoologyTitle', '_gradebookSchoologyTitle', '_zeroLessonByKey', '_zeroSchoologyTag',
    '_zeroDayText', '_zeroWhenText', '_pastDueWhenText', '_pastDueCardRow', '_zeroCardActionButton', '_zeroCardRow'];
  const gradeLessons = Object.entries(SCHEDULE.lessons).map(([lessonKey, l]) => ({
    lessonKey, unit: l.unit, worksheetKey: l.worksheetKey, quizTotal: 1, hasBlooket: true, blooketBonus: false,
  }));

  function boot(gradebook) {
    const win = newWindow('<div id="host"></div>');
    win.eval(CED_SOURCE);
    Object.assign(win, { _gradeLessonsCache: gradeLessons, _gradeGradebookCache: gradebook || null,
      _zeroOpenLesson() {}, _zeroOpenQuiz() {}, _zeroOpenFlashcards() {}, _snapOpenAssignment() {} });
    win.eval('var DESK_SCHOOLOGY_TITLES_CED = false;\n' + ROW_FNS.map(fnBody).join('\n'));
    return win;
  }

  const rows = (win) => LESSON_KEYS.flatMap((key) => ['worksheet', 'quiz', 'blooket'].map((kind) => {
    const w = { lessonKey: key, kind, past: true, dueDate: '2026-09-25', zeroDate: '2026-10-08' };
    return { key, kind, zero: win._zeroCardRow(w), later: win._pastDueCardRow(w) };
  }));

  it('labels every row in CED numbering (the Schoology tag aside)', () => {
    const win = boot();
    for (const { key, kind, zero, later } of rows(win)) {
      for (const row of [zero, later]) {
        const text = [...row.childNodes].filter((n) => !n.classList || !n.classList.contains('wz-sgy'))
          .map((n) => n.textContent).join(' ');
        expectNoRawKeys(text, [key], 'missing-work row ' + key + ' ' + kind);
        const button = row.querySelector('button');
        expectNoRawKeys(button.getAttribute('aria-label'), [key], 'row button ' + key);
      }
    }
  });

  it('the Schoology tag names today’s Schoology column (fixture `old`), and follows the server’s schoologyTitle', () => {
    const PREFIX = { worksheet: 'FA', quiz: 'QUIZ', blooket: 'BL' };
    const groupOf = (key, kind) => (kind === 'quiz' ? key
      : SCHEDULE.lessons[key].unit + '.' + SCHEDULE.lessons[key].worksheetKey);
    const today = boot();
    for (const { key, kind, zero } of rows(today)) {
      const entry = COLUMN_TITLES[PREFIX[kind] + ':' + groupOf(key, kind)];
      expect(zero.querySelector('.wz-sgy').textContent).toBe('Schoology: ' + entry.old);
    }
    // After the rename the server sends CED schoologyTitles; the tag follows them.
    const gradebook = { quarters: { Q: { columns: buildGradebookColumns(
      { lessons: gradeLessons, quarters: { Q: { units: [1, 2, 3, 4, 5, 6, 7, 8, 9], pcUnits: [] } } }, 'Q') } } };
    for (const col of gradebook.quarters.Q.columns) col.schoologyTitle = COLUMN_TITLES[col.key].ced;
    const renamed = boot(gradebook);
    for (const { key, kind, zero } of rows(renamed)) {
      const entry = COLUMN_TITLES[PREFIX[kind] + ':' + groupOf(key, kind)];
      expect(zero.querySelector('.wz-sgy').textContent).toBe('Schoology: ' + entry.ced);
    }
  });

  it('the Desk fallback flag matches roster-server SCHOOLOGY_TITLES_CED', () => {
    const match = /var DESK_SCHOOLOGY_TITLES_CED = (true|false);/.exec(desk_SRC);
    expect(match).toBeTruthy();
    expect(match[1] === 'true').toBe(SCHOOLOGY_TITLES_CED);
  });
});

describe('Desk Do Now and coach', () => {
  it('Do Now names every lesson by its CED label', async () => {
    for (const key of LESSON_KEYS) {
      const els = {};
      const el = (id) => (els[id] = els[id] || { id, textContent: '', className: '', style: {} });
      const labels = createContext({});
      labels.window = labels;
      runInContext(CED_SOURCE, labels);
      const sandbox = {
        cedLabel: labels.cedLabel, document: { getElementById: el }, console,
        window: { ROSTER_SERVICE_URL: 'https://roster.test', rosterClient: { token: () => 'tok' } },
        fetch: async () => ({ json: async () => ({ ok: true,
          nextTask: { unit: 'U1', lesson: key, activity: 'worksheet', progress: { done: 1, total: 4 } } }) }),
      };
      createContext(sandbox);
      runInContext(fnBody('renderDoNow') + '\nthis.__rd = renderDoNow;', sandbox);
      await sandbox.__rd();
      expect(el('donow-msg').textContent).toMatch(/^Do Now: /);
      expectNoRawKeys(el('donow-msg').textContent, [key], 'Do Now ' + key);
    }
  });

  it('the why-so-low coach panel names every lesson by its CED label', () => {
    const win = newWindow('<div id="panel"></div>');
    win.eval(CED_SOURCE);
    win.eval(['_coachFirstText', '_coachBottleneckText', '_effortTopicNumber', '_renderCoachPanel'].map(fnBody).join('\n'));
    const missing = LESSON_KEYS.map((lesson, i) => ({ lesson, kind: ['worksheet', 'quiz', 'blooket'][i % 3], past: i % 2 === 0, day: 'Thu 10/8' }));
    for (const key of LESSON_KEYS) {
      const ctx = {
        quarter: 'Q1', grade: 84.3, ceiling: 97.5, pcAvg: 62.5, workAvg: 88.1,
        missing: missing.filter((m) => m.lesson === key),
        biggestWin: { lesson: key, label: 'quiz', score: 41 },
        blooket: { due: 3, done: 1, track: 33, todo: [key] },
        flashcardGate: [{ lesson: key }],
        weakLessons: [{ lesson: key, quizTotal: 1, quiz: 40, worksheet: 75, hasBlooket: true, blooket: null }],
        lessonsGraded: 12, lessonsTotal: 20, lessonsDue: 14,
      };
      const panel = win.document.getElementById('panel');
      win._renderCoachPanel(panel, ctx);
      expectNoRawKeys(panel.textContent, [key], 'coach panel ' + key);
    }
  });
});

describe('Calculator Skills modal (APSTAT_PARK_TRAINER_ABSORB_2_SPEC §5)', () => {
  // Every catalogue skill, each in every chip state, through the REAL Desk renderer.
  const FUNCTIONS = ['_calcProgressDate', '_calcProgressHasRecord', '_calcProgressChip', '_calcProgressUnitOf',
    '_calcProgressSummary', '_calcProgressMessage', '_calcProgressFilter', '_calcProgressRow', '_renderCalcProgress', 'closeCalcProgress'];
  const VARS = ['_calcProgressCache', '_calcProgressUnit', 'CALC_PROGRESS_MONTHS'];
  const STATES = [
    { mastered: true, clears: 3, rung: 2, nextReview: '2026-10-24', lastQuality: 5 },
    { due: true, overdueDays: 2, clears: 1, rung: 1, nextReview: '2026-10-14', lastQuality: 4 },
    { clears: 2, rung: 2 }, {}, { eligible: false },
  ];

  it('prints only CED labels for every catalogue skill topic', async () => {
    const { CALCULATOR_LEVELS } = await import('../apstat-park/calculator-curriculum.mjs');
    expect(CALCULATOR_LEVELS.length).toBe(32);
    const start = desk.indexOf('<div id="calc-progress-overlay"');
    const markup = desk.slice(start, desk.indexOf('<!-- ═══ Game Window (Study Break) ═══ -->', start));
    const win = newWindow(markup);
    win.eval(CED_SOURCE);
    win.eval(VARS.map((name) => new RegExp('var ' + name + ' = [^\n]*').exec(desk_SRC)[0]).join('\n') + '\n'
      + 'function _openParkSolo() {}\n' + FUNCTIONS.map(fnBody).join('\n'));
    for (const state of STATES) {
      const skills = CALCULATOR_LEVELS.map((level) => ({ skillId: level.skillId, title: level.title, topic: level.topic,
        unit: null, eligible: true, clears: 0, rung: 0, repetitions: 0, intervalDays: 0, nextReview: null,
        lastQuality: null, mastered: false, due: false, overdueDays: 0, ...state }));
      win._renderCalcProgress({ ok: true, skills });
      const box = win.document.querySelector('#calc-progress-overlay .dialog-box');
      const rows = [...box.querySelectorAll('.calc-progress-row')];
      expect(rows).toHaveLength(32);
      for (const row of rows) {
        const level = CALCULATOR_LEVELS.find((l) => l.skillId === row.getAttribute('data-skill'));
        expectNoRawKeys(row.textContent, [level.topic], 'calculator skill ' + level.skillId);
      }
      const topics = CALCULATOR_LEVELS.map((level) => level.topic);
      expectNoRawKeys(box.textContent, topics, 'Calculator Skills modal');
    }
  });
});

describe('Dogecoin presence dropdown (teacher sees WHERE a classmate is)', () => {
  // railway_client.js announces a worksheet by file name: "U3 L3", "U3 L6-7" (the old key).
  const worksheetFiles = execFileSync('git', ['ls-files', 'u*_lesson*_live.html'], { cwd: repo, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  const announced = worksheetFiles.map((f) => /^u(\d+)_lesson([\d.\-]+)_live\.html$/.exec(f))
    .filter(Boolean).map((m) => ({ lesson: 'U' + m[1] + ' L' + m[2], key: m[1] + '.' + m[2] }));

  it('labels every worksheet location in CED numbering, never "U3 L3"', () => {
    expect(announced.length).toBeGreaterThan(60);
    const win = newWindow('');
    win.eval(CED_SOURCE);
    win.eval('function _deskEsc(s) { return String(s); }\n' + declaration('DogePresence', '{', '}') + '\nwindow.DogePresence = DogePresence;');
    for (const { lesson, key } of announced) {
      const loc = { surface: 'worksheet', lesson, onDesk: false };
      const chip = win.DogePresence._locationChip(loc, true);
      const where = win.DogePresence._whereSentence(loc, true);
      expect(chip, key).not.toMatch(/\bU\d+ L[\d.-]+\b/);
      expect(where, key).not.toMatch(/\bU\d+ L[\d.-]+\b/);
      expectNoRawKeys(chip, [key], 'presence chip ' + key);
      expectNoRawKeys(where, [key], 'presence where ' + key);
      // Students only ever see the coarse surface.
      expect(win.DogePresence._locationChip(loc, false)).toContain('>Worksheet<');
    }
  });
});

describe('gradebook column titles (roster-server gradebook-grid → ced-titles)', () => {
  const lessons = Object.entries(SCHEDULE.lessons).map(([lessonKey, l]) => ({
    lessonKey, unit: l.unit, worksheetKey: l.worksheetKey, quizTotal: 1, hasBlooket: true, blooketBonus: false,
  }));
  const gradebook = () => cedRetitleGradebook({ weights: { Lesson: 25, Quizzes: 17.5, Blooket: 7.5 }, quarters: { Q1: {
    columns: buildGradebookColumns({ lessons, quarters: { Q1: { units: [1, 2, 3, 4, 5, 6, 7, 8, 9], pcUnits: [1, 2, 3, 4, 5] } } }, 'Q1'),
    cells: {}, categoryAverages: {}, v3Total: 88.2, schoologyTotal: 86.4,
  } } });

  it('every column title is CED; since rename day the Schoology title is the same CED title', () => {
    for (const col of gradebook().quarters.Q1.columns) {
      expectNoRawKeys(col.title, col.topicKeys, 'column ' + col.key);
      expect(col.schoologyTitle, col.key).toBe(COLUMN_TITLES[col.key][SCHOOLOGY_TITLES_CED ? 'ced' : 'old']);
    }
  });

  it('the in-app My Gradebook renders without old keys', () => {
    const win = newWindow('<div id="my-gradebook-body"></div><div id="my-gradebook-qtabs"></div>');
    win.eval(CED_SOURCE);
    Object.assign(win, { cYear: 'SY26-27', _deskIsTeacher: () => false, _activeGradebook: gradebook(), _lessonDateMap: () => ({}) });
    win.eval(['_myGradebookCatOrder', '_gradeBand', '_myGradebookColourKey', 'renderMyGradebook'].map(fnBody).join('\n'));
    win.renderMyGradebook('Q1');
    expectNoRawKeys(win.document.getElementById('my-gradebook-body').textContent, LESSON_KEYS, 'My Gradebook');
  });

  it('class-snapshot assignment titles are CED', () => {
    for (const lesson of lessons) {
      for (const track of ['worksheet', 'quiz', 'blooket']) {
        const group = track === 'quiz' ? [lesson.lessonKey] : expandedTopicKeys(lesson.unit + '.' + lesson.worksheetKey);
        expectNoRawKeys(cedAssignmentTitle(lesson, track), group, 'snapshot ' + lesson.lessonKey + ' ' + track);
      }
    }
  });
});

describe('one crosswalk, one helper (vendored copies are byte-identical)', () => {
  const same = (a, b) => expect(readFileSync(resolve(repo, b)).equals(readFileSync(resolve(repo, a))), b + ' vs ' + a).toBe(true);

  it('follow-alongs + roster-server copies match the sources (run scripts/sync-ced-crosswalk.mjs)', () => {
    same('lib/ced-label.js', 'js/ced2026-labels.js');
    same('lib/ced-label.js', 'roster-server/lib/ced-label.js');
    same('lib/ced-label.mjs', 'roster-server/lib/ced-label.mjs');
    same('2026-crosswalk.json', 'roster-server/data/2026-crosswalk.json');
    execFileSync(process.execPath, [resolve(repo, 'scripts/build-ced2026-label-data.mjs'), '--check']);
  });

  it('the crosswalk carries only the known top-level keys', () => {
    expect(Object.keys(CED_CROSSWALK).sort()).toEqual(['generatedAt', 'map', 'schema', 'source', 'units']);
  });

  const cr = resolve(repo, '../curriculum_render');
  it.skipIf(!existsSync(cr))('curriculum_render copies match (skipped when the sibling repo is absent)', () => {
    for (const target of ['data/2026-crosswalk.json', 'railway-server/data/2026-crosswalk.json']) {
      same('2026-crosswalk.json', resolve(cr, target));
    }
  });
});
