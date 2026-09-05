// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { computeDonow } from '../roster-server/donow.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
const desk = read('ap_stats_roadmap_square_mode.html');
const cedSource = read('js/ced2026-crosswalk.js') + '\n' + read('js/ced2026-labels.js');
const manifest = JSON.parse(read('data/work-manifest.json'));
const opened = [];
const foldedTitle = '1.10 · Investigative Question & Data Collection · Day 1';

function fnBody(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(desk);
  if (!match) throw new Error('Function not found: ' + name);
  let depth = 0;
  for (let i = desk.indexOf('{', match.index); i < desk.length; i++) {
    if (desk[i] === '{') depth++;
    else if (desk[i] === '}' && --depth === 0) return desk.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced function: ' + name);
}

function boot(names, values = {}) {
  const ids = ['donow-card', 'donow-msg', 'donow-grades', 'bf-header', 'bf-modepick',
    'bf-result', 'bf-overlay', 'my-receipts-body', 'my-gradebook-body', 'my-gradebook-qtabs',
    'day-grade-overlay', 'day-grade-header', 'day-grade-body'];
  const dom = new JSDOM(ids.map((id) => '<div id="' + id + '"></div>').join(''), {
    runScripts: 'outside-only', url: 'https://school.test/desk.html',
  });
  opened.push(dom);
  const win = dom.window;
  win.eval(cedSource);
  Object.assign(win, { cYear: 'SY26-27', _deskIsTeacher: () => false, ...values });
  win.eval(names.map(fnBody).join('\n'));
  return win;
}

afterEach(() => opened.splice(0).forEach((dom) => dom.window.close()));

function taskAt(oldKey) {
  const completed = [];
  for (const unit of manifest.units) {
    for (const lesson of unit.lessons) {
      if (lesson.lesson === oldKey) return computeDonow(completed, manifest);
      for (const activity of lesson.activities) {
        completed.push(...activity.itemIds.map((item_id) => ({ item_id })));
      }
    }
  }
  throw new Error('Lesson missing from live manifest: ' + oldKey);
}

describe('CED labels preserve Do Now and coach identities', () => {
  it('translates explicit AI lesson references while preserving decimal grades and original chat context', async () => {
    const answer = 'Topic 8.4 can raise your grade by 3.5%. Try Unit 3 Lesson 1 next. Review Unit 8 and U9.';
    const context = { biggestWin: { lesson: '8.4', score: 3.5 } };
    const history = [];
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: answer }) }));
    const win = boot(['_coachAsk'], { fetch });
    const transcript = win.document.createElement('div');
    const button = win.document.createElement('button');
    win.document.body.append(transcript, button);
    await win._coachAsk(context, 'What next?', transcript, history, button);
    expect(transcript.querySelector('.coach').textContent).toContain('3.14 ·');
    expect(transcript.querySelector('.coach').textContent).toContain(foldedTitle);
    expect(transcript.querySelector('.coach').textContent).toContain('3.5%');
    expect(transcript.querySelector('.coach').textContent).not.toContain('8.4');
    expect(transcript.querySelector('.coach').textContent).not.toMatch(/Unit 8|U9/);
    expect(transcript.querySelector('.coach').textContent).toContain('CED topics 3.14');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ context, message: 'What next?', history: [] });
    expect(history[1]).toEqual({ role: 'assistant', content: answer });
    expect(button.disabled).toBe(false);
  });

  it('maps every lesson key in the live Do Now manifest, including combined worksheets', () => {
    const win = boot([]);
    const keys = manifest.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.lesson));
    expect(keys).toHaveLength(71);
    for (const key of keys) {
      const label = win.cedLabel(key);
      expect(label.mapped, key).toBe(true);
      expect(label.text, key).not.toMatch(/\b[6-9]\.\d+\b/);
    }
  });

  it('explains locked lessons with CED names without changing either gate key', () => {
    const showDialog = vi.fn();
    const win = boot(['_resourcePanelEsc', '_showLessonLockedDialog'], { showDialog });
    win._showLessonLockedDialog('3.2', '3.1', 'Sep 10');
    const message = showDialog.mock.calls[0][1];
    expect(message).toContain('1.10 ·');
    expect(message).toContain('Day 2');
    expect(message).toContain('Day 1');
    expect(message).not.toMatch(/\b3\.[12]\b/);
  });

  it('keeps hydrated lesson labels literal in the locked-dialog HTML sink', () => {
    const win = boot(['_resourcePanelEsc', '_showLessonLockedDialog']);
    const message = win.document.createElement('div');
    win.showDialog = (_icon, html) => { message.innerHTML = html; };
    win.configureCedLabels({ lessons: { '3.1': { ced2026: {
      status: 'core', newTopic: '1.10', newUnit: 1, newLabel: '<img src=x onerror=alert(1)>'
    } } } });
    win._showLessonLockedDialog('3.2', '3.1', 'Sep 10');
    expect(message.querySelector('img')).toBeNull();
    expect(message.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(message.textContent).toContain('Day 1');
  });

  it.each(['3.1', '4.1-2'])('renders the actual live manifest task %s while retaining its OLD lesson key', async (oldKey) => {
    const task = { ok: true, ...taskAt(oldKey) };
    const snapshot = JSON.stringify(task);
    const fetch = vi.fn(async () => ({ json: async () => task }));
    const selectApp = vi.fn(() => 'quiz');
    const win = boot(['renderDoNow'], {
      ROSTER_SERVICE_URL: 'https://roster.test', rosterClient: { token: () => 'session' },
      fetch, WalletLogic: { appForNextTask: selectApp }, _donowData: null, _dnNextApp: null,
    });
    await win.renderDoNow();
    const text = win.document.getElementById('donow-msg').textContent;
    expect(task.nextTask.lesson).toBe(oldKey);
    expect(task.nextTask.unit).toBe(oldKey === '3.1' ? 'U1' : 'U2');
    expect(text).toContain(oldKey === '3.1' ? foldedTitle : '2.3 ·');
    expect(text).not.toContain(oldKey);
    expect(win._donowData).toBe(task);
    expect(selectApp).toHaveBeenCalledWith(task.nextTask);
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer session');
    expect(JSON.stringify(task)).toBe(snapshot);
  });

  it('translates coach facts while handing its original context to follow-up requests', () => {
    const ask = vi.fn();
    const win = boot(['_coachBottleneckText', '_renderCoachPanel'], { _coachAsk: ask });
    const panel = win.document.createElement('div');
    const context = {
      quarter: 'Q1', grade: 72, ceiling: 93, pcAvg: 80, workAvg: 72,
      biggestWin: { lesson: '3.1', label: 'worksheet', score: 35 },
      blooket: { due: 2, done: 0, todo: ['8.4'], track: 0 },
      flashcardGate: [{ lesson: '3.2' }],
      weakLessons: [{ lesson: '3.1', grade: 55, worksheet: 35, quizTotal: 0 }],
    };
    const snapshot = JSON.stringify(context);
    win._renderCoachPanel(panel, context);
    expect(panel.textContent).toContain(foldedTitle);
    expect(panel.textContent).toContain('3.14 ·');
    expect(panel.textContent).not.toMatch(/\b3\.[12]\b|\b8\.4\b/);
    panel.querySelector('.wsl-ask').click();
    expect(ask.mock.calls[0][0]).toBe(context);
    expect(JSON.stringify(context)).toBe(snapshot);
  });
});

describe('CED flashcard titles preserve deck and resume keys', () => {
  it('keeps the original topic in every mode-picker action', () => {
    const quick = vi.fn(), timed = vi.fn(), review = vi.fn();
    const win = boot(['_bfShowModePicker'], {
      _bfHideQuizUI: () => {}, _bfStartQuick: quick, _ftStart: timed, _rvStart: review,
      _fcFlag: () => true, BLOOKET_FULLDECK_SECONDS: 20,
    });
    const launcher = win.document.createElement('button');
    win._bfShowModePicker(launcher, '3.1');
    expect(win.document.getElementById('bf-header').textContent).toContain(foldedTitle);
    win.document.querySelectorAll('#bf-modepick button').forEach((button) => button.click());
    for (const action of [quick, timed, review]) expect(action).toHaveBeenCalledWith(launcher, '3.1');
  });

  it.each([
    ['_rvStart', '_rvState', 'Review'],
    ['_bfStartQuick', '_bfState', 'Quick check'],
    ['_ftStart', '_ftState', 'Timed deck'],
  ])('%s displays the CED title but fetches and records the original deck', async (name, stateKey, prefix) => {
    const deck = [{ qnum: 1, q: 'Example', choices: ['A', 'B'], correctIdx: 0 }];
    const csvPath = vi.fn(() => 'u3_l1_blooket.csv');
    const fetch = vi.fn(async () => ({ ok: true, text: async () => 'fixture' }));
    const win = boot([name], {
      _bfCsvPath: csvPath, fetch, _bfParseCsv: () => [], _bfRowsToDeck: () => deck,
      _bfShuffle: (cards) => cards, _bfShowQuizUI: () => {}, _bfLoadProgress: () => null,
      _bfLoadDifficultyTags: async () => ({}), _bfSelectTop10: (cards) => cards,
      _bfSaveProgress: () => {}, _bfRenderCard: () => {}, _bfKeydownHandler: () => {},
      _ftCreateRound: (cards) => ({ deck: cards }), _ftRenderCard: () => {}, _ftKeydownHandler: () => {},
      _rvRenderCard: () => {}, _rvKeydownHandler: () => {},
      FlashcardSrs: { dueCards: () => ['u3_l1_blooket.csv#1'], dayIndex: () => 0 },
      FlashcardStore: {}, _srsFoldedState: () => ({ store: { save: () => {} }, log: [], folded: {} }),
      BLOOKET_FULLDECK_SECONDS: 20, [stateKey]: {},
    });
    await win[name](null, '3.1');
    expect(win.document.getElementById('bf-header').textContent).toContain(prefix + ' — ' + foldedTitle);
    expect(csvPath).toHaveBeenCalledWith('3.1');
    expect(fetch).toHaveBeenCalledWith('u3_l1_blooket.csv');
    expect(win[stateKey].topic).toBe('3.1');
  });
});

describe('CED receipt and grade displays preserve recorded evidence', () => {
  it.each(['WS-U8-L4-Q1', 'WS-U8L4-Q1'])('labels %s while keeping its signed payload, verification QR, and worksheet URL', (itemId) => {
    const payload = { i: itemId, src: 'worksheet', sc: 0.84 };
    const receipt = { compact: Buffer.from(JSON.stringify(payload)).toString('base64url') + '.test-signature', id: 'receipt-id' };
    const snapshot = JSON.stringify(receipt);
    const lookup = vi.fn(() => ({ urls: { worksheet: 'u8_lesson4_live.html' } }));
    const qr = vi.fn(), verify = vi.fn(), open = vi.fn();
    const win = boot(['_receiptPayload', '_receiptVerifyUrl', '_receiptViewUrl', '_walletReceiptRow'], {
      getRegistryEntry: lookup, _renderReceiptQr: qr, _walletVerifyAndCheck: verify,
      _reviewByItem: {}, open,
    });
    const row = win._walletReceiptRow(receipt);
    expect(row.textContent).toContain('3.14 ·');
    expect(row.textContent).not.toContain(itemId);
    expect(row.textContent).toContain('84%');
    expect(lookup).toHaveBeenCalledWith('8.4');
    [...row.querySelectorAll('button')].find((button) => button.textContent.includes('View')).click();
    [...row.querySelectorAll('button')].find((button) => button.textContent.includes('Verify')).click();
    expect(open).toHaveBeenCalledWith('u8_lesson4_live.html', '_blank', 'noopener');
    expect(verify.mock.calls[0][0]).toBe(receipt);
    expect(qr.mock.calls[0][1]).toContain(encodeURIComponent(receipt.compact));
    expect(JSON.stringify(receipt)).toBe(snapshot);
  });

  it('retains the day-grade date filter and every score while translating the lesson title', () => {
    const lessons = [{ lessonKey: '8.4', topicName: 'Topic 8.4', lessonGrade: 83.2,
      due: { B: '2027-03-11', E: '2027-03-12' }, blooket: 90, Q: 72, Cws: 80 }];
    const snapshot = JSON.stringify(lessons);
    const win = boot(['openDayGrade'], { _gradeLessonsCache: lessons, _attachDayGradeKeyHandler: () => {} });
    win.openDayGrade('Mar 11');
    const text = win.document.getElementById('day-grade-body').textContent;
    expect(text).toContain('3.14 ·');
    expect(text).not.toContain('8.4');
    for (const value of ['83.2', '90.0%', '72%', '80%']) expect(text).toContain(value);
    win.openDayGrade('Mar 10');
    expect(win.document.getElementById('day-grade-body').textContent).toBe('No lessons due this day.');
    expect(JSON.stringify(lessons)).toBe(snapshot);
  });

  it('keeps gradebook columns, scores, totals and due filtering while translating titles', () => {
    const gradebook = { weights: { Lesson: 15 }, quarters: { Q1: {
      columns: [
        { key: 'FA:3.1', kind: 'followalong', category: 'Lesson', title: '3.1 Follow-Along', topicKeys: ['3.1'], due: true },
        { key: 'FA:8.4', kind: 'followalong', category: 'Lesson', title: '8.4 Follow-Along', topicKeys: ['8.4'], due: false },
      ], cells: { 'FA:3.1': 84 }, categoryAverages: { Lesson: 84 },
      v3Total: 91.2, schoologyTotal: 82.7,
    } } };
    const snapshot = JSON.stringify(gradebook);
    const win = boot(['_myGradebookCatOrder', '_gradeBand', 'renderMyGradebook'], {
      _activeGradebook: gradebook, _lessonDateMap: () => ({}),
    });
    win.renderMyGradebook('Q1');
    const text = win.document.getElementById('my-gradebook-body').textContent;
    expect(text).toContain('1.10');
    expect(text).not.toMatch(/\b3\.1\b|\b8\.4\b/);
    expect(text).not.toContain('3.14');
    for (const score of ['84.0', '91.2', '82.7']) expect(text).toContain(score);
    expect(JSON.stringify(gradebook)).toBe(snapshot);
  });
});
