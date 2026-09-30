// desk-why-so-low.test.js — the "Why so low?" grade coach in the Do Now card.
// Hybrid: an instant deterministic breakdown (from cached /grade + /donow) plus
// an optional grounded AI mini-chat. Static parse of the Desk HTML; no DOM exec.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

describe('Why-so-low coach: markup + wiring', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: #donow-helper host lives in the Do Now card', () => {
    expect(DESK).toMatch(/<div\s+id="donow-helper"/);
  });

  it('02: helper styling is present', () => {
    expect(DESK).toMatch(/#donow-helper\s+\.wsl-btn/);
    expect(DESK).toMatch(/#donow-helper\s+\.wsl-panel/);
  });

  it('03: _gradeQuartersCache is declared and cached from /grade', () => {
    expect(DESK).toMatch(/var\s+_gradeQuartersCache\s*=\s*null/);
    expect(DESK).toMatch(/_gradeQuartersCache\s*=\s*quarters/);
  });

  it('04: renderDoNowGrades calls renderWhySoLow (typeof-guarded)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/typeof\s+renderWhySoLow\s*===\s*'function'/);
    expect(body).toMatch(/renderWhySoLow\(curQ,\s*q\)/);
    // The helper host is cleared on every entry (no stale breakdown).
    expect(body).toMatch(/getElementById\('donow-helper'\)/);
  });
});

describe('Why-so-low coach: renderWhySoLow', () => {
  const body = DESK ? fnBody(DESK, 'renderWhySoLow') : '';

  it('10: renders nothing when there is no grade to explain', () => {
    expect(body).toMatch(/quarterGrade/);
    expect(body).toMatch(/if\s*\(grade\s*==\s*null\)\s*return/);
  });

  it('11: renders a "Why so low?" button', () => {
    expect(body).toMatch(/Why so low\?/);
    expect(body).toMatch(/wsl-btn/);
  });

  it('12: panel renders lazily on first open (built flag)', () => {
    expect(body).toMatch(/_renderCoachPanel\(panel,\s*ctx\)/);
    expect(body).toMatch(/built/);
  });
});

describe('Why-so-low coach: _buildCoachContext shape', () => {
  const body = DESK ? fnBody(DESK, '_buildCoachContext') : '';

  it('20: carries the quarter grade + both tracks + ceiling', () => {
    expect(body).toMatch(/quarterGrade/);
    expect(body).toMatch(/pcAvg/);
    expect(body).toMatch(/workAvg/);
    expect(body).toMatch(/ceiling/);
  });

  it('21: pulls the next task from _donowData', () => {
    expect(body).toMatch(/_donowData/);
    expect(body).toMatch(/nextTask/);
  });

  it('22: weakLessons = cached lessons graded under 75, top 6', () => {
    expect(body).toMatch(/_gradeLessonsCache/);
    expect(body).toMatch(/lessonGrade\s*<\s*75/);
    expect(body).toMatch(/slice\(0,\s*6\)/);
  });
});

describe('Why-so-low coach: bottleneck diagnosis (40% gate)', () => {
  const body = DESK ? fnBody(DESK, '_coachBottleneckText') : '';

  it('30: flags a sub-40 track as the cap', () => {
    expect(body).toMatch(/<\s*40/);
    expect(body).toMatch(/40% gate/);
  });

  it('31: otherwise points to the stronger track + ceiling', () => {
    expect(body).toMatch(/stronger track/);
  });
});

describe('Why-so-low coach: _coachAsk (AI mini-chat)', () => {
  const body = DESK ? fnBody(DESK, '_coachAsk') : '';

  it('40: POSTs to the cr AI server /api/ai/coach', () => {
    expect(body).toMatch(/RAILWAY_SERVER_URL/);
    expect(body).toMatch(/\/api\/ai\/coach/);
    expect(body).toMatch(/method:\s*'POST'/);
  });

  it('41: sends the grounded context + message + history', () => {
    expect(body).toMatch(/context:\s*ctx/);
    expect(body).toMatch(/message:\s*message/);
    expect(body).toMatch(/history:\s*history/);
  });

  it('42: soft-fails to the still-visible instant facts', () => {
    expect(body).toMatch(/AI coach is unavailable right now/);
    // distinct copy for an unconfigured (503) service
    expect(body).toMatch(/503/);
    expect(body).toMatch(/not set up right now/);
  });

  it('43: shows a thinking state and re-enables the button in finally', () => {
    expect(body).toMatch(/thinking/i);
    expect(body).toMatch(/finally/);
    expect(body).toMatch(/askBtn\.disabled\s*=\s*false/);
  });
});

describe('Why-so-low coach: XSS-safe rendering', () => {
  it('50: panel builder uses textContent, never innerHTML with data', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/textContent/);
    // The only innerHTML use is the clear-to-empty reset.
    const innerHtmlAssigns = body.match(/\.innerHTML\s*=\s*([^;]+)/g) || [];
    for (const a of innerHtmlAssigns) {
      expect(a).toMatch(/=\s*''/);
    }
  });
});

describe('Why-so-low coach: review folds (open-panel preservation, races, a11y)', () => {
  it('60: _coachPanelOpen detects an expanded panel', () => {
    expect(DESK).toMatch(/function\s+_coachPanelOpen\s*\(/);
    const body = fnBody(DESK, '_coachPanelOpen');
    expect(body).toMatch(/\.wsl-panel/);
    expect(body).toMatch(/display\s*!==\s*'none'/);
  });

  it('61: renderWhySoLow bails when a panel is already open (preserve chat)', () => {
    const body = fnBody(DESK, 'renderWhySoLow');
    expect(body).toMatch(/if\s*\(_coachPanelOpen\(\)\)\s*return/);
  });

  it('62: renderDoNowGrades only clears the helper when no panel is open', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/!_coachPanelOpen\(\)/);
  });

  it('63: _coachAsk guards writes with isConnected (no orphaned-node write)', () => {
    const body = fnBody(DESK, '_coachAsk');
    expect(body).toMatch(/cEl\.isConnected/);
    expect(body).toMatch(/askBtn\.isConnected/);
  });

  it('64: the Enter path is gated by the in-flight (disabled) button', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/if\s*\(ask\.disabled\)\s*return/);
  });

  it('65: single-track bottleneck branches (PC/Work not started yet)', () => {
    const body = fnBody(DESK, '_coachBottleneckText');
    expect(body).toMatch(/has not started yet/);
    expect(body).toMatch(/wkNum\s*&&\s*!pcNum/);
    expect(body).toMatch(/pcNum\s*&&\s*!wkNum/);
  });

  it('66: transcript is an aria-live log region', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/setAttribute\('role',\s*'log'\)/);
    expect(body).toMatch(/setAttribute\('aria-live',\s*'polite'\)/);
  });

  it('67: button + prompt adapt to a healthy grade (not always "Why so low?")', () => {
    const wsl = fnBody(DESK, 'renderWhySoLow');
    expect(wsl).toMatch(/Grade breakdown/);
    expect(wsl).toMatch(/grade\s*<\s*80/);
    const panel = fnBody(DESK, '_renderCoachPanel');
    expect(panel).toMatch(/What should I focus on\?/);
  });

  it('68: privacy note is accurate (never your name)', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/never your name/);
  });

  it('70: _buildCoachContext carries quizTotal + strips the unit U-prefix', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/quizTotal/);
    expect(body).toMatch(/replace\(\/\^\[Uu\]\//);
  });

  it('71: _renderCoachPanel only shows a quiz line when quizTotal > 0 (no "quiz not done" for no-quiz topics)', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/w\.quizTotal\s*>\s*0/);
  });
});

describe('Why-so-low coach: prioritize by biggest deficit (worst component)', () => {
  it('80: _buildCoachContext computes each lesson lowest component + a biggestWin', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/w\.low/);
    expect(body).toMatch(/comps\.reduce/);
    expect(body).toMatch(/ctx\.biggestWin\s*=/);
  });

  it('81: weakLessons are ranked worst-component-first, not by overall grade', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    // sort key falls back to grade only when a lesson has no graded component
    expect(body).toMatch(/a\.low \? a\.low\.score : a\.grade/);
  });

  it('82: _renderCoachPanel leads with the biggest win + suppresses nextTask when present', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/ctx\.biggestWin/);
    expect(body).toMatch(/Biggest win/);
    expect(body).toMatch(/if \(!ctx\.biggestWin && ctx\.nextTask/);
  });
});

describe('Why-so-low coach: Blooket make-up awareness', () => {
  it('90: _buildCoachContext carries workTracks + a blooket summary (track/due/done/todo)', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/workTracks/);
    expect(body).toMatch(/q\.blooketDue/);
    expect(body).toMatch(/blooketTodo/);
    expect(body).toMatch(/ctx\.blooket\s*=/);
  });

  it('91: weakLessons carry per-lesson blooket + hasBlooket (vs "no Blooket exists")', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/blooket:\s*\(typeof l\.blooket/);
    expect(body).toMatch(/hasBlooket:\s*!!l\.hasBlooket/);
  });

  it('92: _renderCoachPanel surfaces the Blooket make-up line (80% via flashcards)', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/ctx\.blooket\s*&&\s*ctx\.blooket\.due\s*>\s*0/);
    expect(body).toMatch(/Blooket:/);
    expect(body).toMatch(/flashcards/);
    expect(body).toMatch(/80%/);
  });

  it('93: a weak-lesson line mentions Blooket ONLY when the lesson has one', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/w\.hasBlooket/);
    expect(body).toMatch(/Blooket not done/);
  });
});

describe('Why-so-low coach: PC-not-open + flashcard gate', () => {
  it('A1: _buildCoachContext threads pcDue (defaults false so a missing field never invents PC work)', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/pcDue:\s*!!\(q && q\.pcDue === true\)/);
  });

  it('A2: _buildCoachContext builds flashcardGate from worksheet-done-but-flashcard-owed lessons', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/flashcardGate/);
    expect(body).toMatch(/_fl\.hasBlooket/);          // lesson must actually have flashcards
    expect(body).toMatch(/_fcws\s*>=\s*60/);          // worksheet done
    expect(body).toMatch(/_fbl\s*<\s*80/);            // flashcards still owed (same signals as _isLessonComplete)
  });

  it('A3: _renderCoachPanel explains unfinished flashcards without blocking other lessons', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).toMatch(/ctx\.flashcardGate/);
    expect(body).toMatch(/Flashcards to finish/);
    expect(body).toMatch(/Nothing is locked; every lesson stays open\./);   // the lesson gate went on 2026-09-10
  });
});

describe('coach facts match the zero-date rule (teacher 2026-09-26: "does this AI coach have accurate understanding of the dynamics?")', () => {
  it('_buildCoachContext ships the Missing-work list with zero dates and counting/tentative flags', () => {
    const body = fnBody(DESK, '_buildCoachContext');
    expect(body).toMatch(/ctx\.missing = _coachMissingList\(\)/);
    const helper = fnBody(DESK, '_coachMissingList');
    expect(helper).toMatch(/_zeroCurrentWarnings\(\)/);
    expect(helper).toMatch(/past: Boolean\(w\.past\)/);
    expect(helper).toMatch(/slice\(0, 12\)/);
  });
  it('"First:" is the missing work (counting now, else soonest date); the low recorded score follows as "Then:"', () => {
    const fn = new Function('cedLabel', fnBody(DESK, '_coachFirstText') + '\nreturn _coachFirstText;')((k) => ({ text: 'Topic ' + k }));
    expect(fn([])).toBe('');
    expect(fn([{ lesson: '1.1', kind: 'worksheet', zeroDate: '2026-09-20', day: 'Sun 9/20', past: true },
               { lesson: '1.3', kind: 'quiz', zeroDate: '2026-09-27', day: 'Sun 9/27', past: false }]))
      .toBe('\u26A0 First: Topic 1.1 worksheet counts as 0 right now — any score replaces a 0.');
    expect(fn([{ lesson: '1.3', kind: 'worksheet', zeroDate: '2026-09-27', day: 'Sun 9/27', past: false },
               { lesson: '1.3', kind: 'quiz', zeroDate: '2026-09-27', day: 'Sun 9/27', past: false },
               { lesson: '1.3', kind: 'blooket', zeroDate: '2026-09-27', day: 'Sun 9/27', past: false },
               { lesson: '1.4', kind: 'worksheet', zeroDate: '2026-09-29', day: 'Tue 9/29', past: false }]))
      .toBe('\u26A0 First: Topic 1.3 worksheet; Topic 1.3 quiz; Topic 1.3 flashcards become a 0 after Sun 9/27 — turn in anything before then and there is no 0.');
    const panel = fnBody(DESK, '_renderCoachPanel');
    expect(panel).toContain("firstLine ? 'Then: your ' : '\ud83c\udfaf Biggest win: your '".replace('\\ud83c\\udfaf', '🎯'));
  });
  it('the panel never says un-done work "counts as 0 until you do it", never caps a deck at 80%, never says "unlock"', () => {
    const body = fnBody(DESK, '_renderCoachPanel');
    expect(body).not.toMatch(/count as 0 until you do them/);
    expect(body).not.toMatch(/Make one up to 80%/);
    expect(body).not.toMatch(/unlock/i);
    expect(body).toContain('Work counts as 0 only once its zero date passes');
    expect(body).toContain('A deck not played by its zero date counts as 0.');
    expect(body).toContain('Nothing is locked; every lesson stays open.');
  });
});

// Each test boots a Desk sandbox (coachSandbox); under full-suite load that can
// exceed the 5 s default though the file passes alone.
describe('coach credits a PC on file and work done ahead (EFFORT_VISIBILITY_SPEC §3)', { timeout: 20_000 }, () => {
  const CAL = [[2026, 9, 13, { t: 'U1-PC2', kind: 'pc', admin: 2, u: 1 }, { t: '3.1', u: 1 }]];
  const LESSONS = [
    { lessonKey: '1.2', due: { B: '2026-09-09' }, lessonGradeNoQuiz: 70, lessonGrade: 70 },
    { lessonKey: '1.6', due: { B: '2026-10-05' }, lessonGradeNoQuiz: 100, Q: 67, lessonGrade: 90 },
    { lessonKey: '1.7', due: { B: '2026-10-06' }, Cws: 80, lessonGrade: 80 },
  ];
  async function coachSandbox() {
    const { createContext, runInContext } = await import('node:vm');
    const { JSDOM } = await import('jsdom');
    await import('../lib/effort-facts.js');
    const dom = new JSDOM('<div></div>');
    const s = {
      document: dom.window.document, window: dom.window, console,
      EffortFacts: globalThis.EffortFacts,
      S: CAL, cP: 'B', tdy: () => new Date(2026, 8, 27),
      _donowData: null,
      _gradeUnitsCache: { U1: { pcRawPct: 66.7 } }, _gradeLessonsCache: LESSONS,
      _gradeQuartersCache: { Q1: { quarterGrade: 45, lessonsDue: 9, workAvg: 31, pcUnits: [1, 2] } },
      _zeroCurrentWarnings: () => [],
      _coachAsk: () => {},
      cedLabel: k => ({ mapped: true, id: k, text: 'Topic ' + k }),
      cedReferenceText: t => t,
    };
    createContext(s);
    runInContext(['_zeroTodayIso', '_zeroDayText', '_effortPcSchedule', '_effortTopicNumber', '_effortFacts',
      '_coachMissingList', '_coachFirstText', '_coachBottleneckText', '_buildCoachContext', '_renderCoachPanel']
      .map(name => fnBody(DESK, name)).join('\n'), s);
    return { s, close: () => dom.window.close() };
  }

  it('_buildCoachContext carries pcOnFile (the object) and ahead (the list, at most 8)', async () => {
    const t = await coachSandbox();
    try {
      const ctx = t.s._buildCoachContext('Q1', t.s._gradeQuartersCache.Q1);
      expect(JSON.parse(JSON.stringify(ctx.pcOnFile))).toEqual({ unit: 1, pct: 66.7, counting: false, countsFrom: '2026-10-13', day: 'Tue 10/13',
        all: [{ unit: 1, pct: 66.7, counting: false, countsFrom: '2026-10-13', day: 'Tue 10/13' }] });
      expect(ctx.ahead.map(a => a.lessonKey)).toEqual(['1.6', '1.7']);
      expect(ctx.aheadCount).toBe(2);
      expect(fnBody(DESK, '_buildCoachContext')).toContain('ctx.ahead = _ef.ahead.slice(0, 8);');
    } finally { t.close(); }
  });

  it('the instant panel prints the PC line + strategy and the ahead line right under the tracks, before the bottleneck', async () => {
    const t = await coachSandbox();
    try {
      const ctx = t.s._buildCoachContext('Q1', t.s._gradeQuartersCache.Q1);
      const panel = t.s.document.createElement('div');
      t.s._renderCoachPanel(panel, ctx);
      const lines = [...panel.querySelector('.wsl-facts').children].map(el => el.textContent);
      const tracksAt = lines.findIndex(text => text.startsWith('PC mastery:'));
      expect(lines[tracksAt + 1]).toBe('Progress Check so far: 67% (paper) — counts from Tue 10/13. To finish the quarter with your 67%, your Work average has to reach 40% — you are at 31%, so bring it up by at least 9 points. Once both tracks are at least 40%, your grade is the higher one, and yours would be the Progress Check.');
      expect(lines[tracksAt + 2]).toBe("Ahead of the calendar: 2 lessons already done (1.6, 1.7). They already count in your Desk grade; Schoology catches up when each lesson's column opens.");
      expect(lines[tracksAt + 3]).toMatch(/40% gate/);   // the bottleneck sentence follows
    } finally { t.close(); }
  });

  it('no PC on file and nothing ahead: the panel adds nothing', async () => {
    const t = await coachSandbox();
    try {
      const panel = t.s.document.createElement('div');
      t.s._renderCoachPanel(panel, { quarter: 'Q1', grade: 45, pcAvg: null, workAvg: 31, pcOnFile: null, ahead: [] });
      expect(panel.querySelector('.wsl-effort-pc')).toBeNull();
      expect(panel.querySelector('.wsl-effort-ahead')).toBeNull();
    } finally { t.close(); }
  });
});

describe('coach reply is shown as plain text (teacher 2026-09-26: the live reply showed literal ** asterisks)', () => {
  it('_coachPlainText strips bold, underscores, backticks and heading marks, keeps the words', () => {
    const fn = new Function(fnBody(DESK, '_coachPlainText') + '\nreturn _coachPlainText;')();
    expect(fn('fix your **1.1 worksheet at 70%** first')).toBe('fix your 1.1 worksheet at 70% first');
    expect(fn('## Plan\n- __1.3 quiz__ becomes a 0 after `Sun 9/27`')).toBe('Plan\n- 1.3 quiz becomes a 0 after Sun 9/27');
    expect(fn(null)).toBe('');
    expect(fnBody(DESK, '_coachAsk')).toContain('_coachPlainText(answer)');
  });
});

describe('a topic\u2019s full title appears once (teacher 2026-09-26: the live reply repeated it four times)', () => {
  it('_coachOnceTopics keeps the first "Topic 1.3" and shortens the rest to "1.3"; other topics keep their own first mention', () => {
    const fn = new Function(fnBody(DESK, '_coachOnceTopics') + '\nreturn _coachOnceTopics;')();
    expect(fn('Do the Topic 1.3 worksheet, the Topic 1.3 quiz and the Topic 1.3 flashcards. Then Topic 1.4 and Topic 1.3 again.'))
      .toBe('Do the Topic 1.3 worksheet, the 1.3 quiz and the 1.3 flashcards. Then Topic 1.4 and 1.3 again.');
    expect(fn('Lesson 2.1 then lesson 2.1')).toBe('Lesson 2.1 then 2.1');
    expect(fnBody(DESK, '_coachAsk')).toContain('cedReferenceText(_coachOnceTopics(_coachPlainText(answer)))');
  });
});
