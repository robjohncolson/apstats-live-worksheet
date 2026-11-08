// @vitest-environment node
// Real sign-in clients, deck scoring, finish UI, marks, ledger client and offline queue.
// Only network responses, timers and unrelated Desk presentation are controlled here.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { deskHtml, deskSource, fnBodyOf } from './helpers/desk-source.js';

const SOURCE = deskSource();
const TOPIC = '4.7';
const USERS = {
  Alice: { studentId: 'student-a', username: 'Alice', token: 'token-a', realName: 'Alice', section: 'B' },
  Bob: { studentId: 'student-b', username: 'Bob', token: 'token-b', realName: 'Bob', section: 'B' },
};
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const clientSources = ['roster-client.js', 'gradebook-client.js', 'offline-queue.js'].map(read);
const functionNames = [...new Set([
  ...[...SOURCE.matchAll(/(?:async\s+)?function\s+(_ft\w+)\s*\(/g)].map(match => match[1]),
  'getStudentEmail', 'getStudentMarks', 'recordProgress', '_marksAliasKeys', '_migrateMarksAliases',
  'submitSignIn', '_nfSubmitPassword', '_srsRoundId', '_mayScore',
  '_bfParseCsv', '_bfRowsToDeck', '_bfShuffle', '_bfLoadDeckSlices', '_bfCreditNote',
  '_bfShowQuizUI', '_bfCloseUI', 'closeBlooketFlashcards', '_rvRestoreActions', 'openBlooketFlashcards',
  '_blooketCommit', '_blooketPatchGradeCache', '_studentMarkSave', '_deskDoneRow',
])];

function declaration(name, kind) {
  const pattern = kind === 'const'
    ? new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);')
    : new RegExp('var\\s+' + name + '\\s*=\\s*\\{[\\s\\S]*?\\n\\};');
  const match = pattern.exec(SOURCE);
  if (!match) throw new Error('Missing Desk declaration: ' + name);
  return kind === 'const' ? 'var ' + name + ' = ' + match[1] + ';' : match[0];
}

function response(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => String(data) };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  for (let i = 0; i < 12; i++) await new Promise(setImmediate);
}

function openDesk(storage = {}) {
  const html = deskHtml();
  const start = html.indexOf('<div id="bf-overlay"');
  const modal = html.slice(start, html.indexOf('<!-- ═══ Resource Panel', start));
  const dom = new JSDOM('<!doctype html><body>' + modal + `
    <input id="signin-username"><input id="signin-password" value="1234">
    <div id="signin-error"></div><button id="signin-ok"></button>
    <input id="nf-pw" value="1234"><div id="nf-pw-error"></div><button id="nf-pw-ok"></button>
    </body>`, { url: 'https://desk.test/', runScripts: 'outside-only' });
  const win = dom.window;
  const posts = [];
  const dialogs = [];
  const outcomes = [];
  let failMarks = false;
  let offline = false;
  let gradeRead = async () => {};
  let nextTimer = 0;
  win.setTimeout = () => ++nextTimer;
  win.setInterval = () => ++nextTimer;
  win.clearTimeout = () => {};
  win.clearInterval = () => {};
  for (const [key, value] of Object.entries(storage)) win.localStorage.setItem(key, value);
  const originalSet = win.Storage.prototype.setItem;
  win.Storage.prototype.setItem = function (key, value) {
    if (failMarks && key.startsWith('apstats_desk_marks_')) throw new Error('quota');
    return originalSet.call(this, key, value);
  };
  Object.assign(win, {
    ROSTER_SERVICE_URL: 'https://roster.test', SUPABASE_URL: 'https://legacy.test', SUPABASE_ANON_KEY: 'test',
    fetch: async (url, options = {}) => {
      const path = String(url);
      if (path.endsWith('/roster/verify')) {
        const { username } = JSON.parse(options.body);
        return response({ ok: true, ...USERS[username] });
      }
      if (path.endsWith('/ledger/record')) {
        if (offline) throw new Error('offline');
        posts.push(JSON.parse(options.body));
        return response({ ok: true, ledgerId: 'row-' + posts.length });
      }
      if (path.startsWith('https://legacy.test/')) return response({ ok: true });
      if (path === 'data/blooket-deck-slices.json') return response(JSON.parse(read(path)));
      if (path === 'u4_l7_l8_blooket.csv') return response(read(path));
      throw new Error('Unexpected fetch: ' + path);
    },
    showDialog: (...args) => dialogs.push(args),
    registerStudent() {}, updateStudentMenu() {}, closeSignInModal() {}, closeNameFinder() {},
    _resetGradeStateForIdentitySwitch() {}, _srsAppendLog() {}, _walletRefreshZeroCard() {}, _bfKeydownHandler() {},
    _bfCsvPath: () => 'u4_l7_l8_blooket.csv', renderDoNowGrades: (...args) => gradeRead(...args),
    cedLabel: () => ({ text: 'Random Variables' }),
  });
  for (const source of clientSources) win.eval(source);
  win.eval([
    ...['BLOOKET_FULLDECK_SECONDS', 'BLOOKET_DECK_CARDS', 'BLOOKET_RESUME_MAX_AGE_MS', 'BLOOKET_START_STALE_MS']
      .map(name => declaration(name, 'const')),
    ...['_ftState', '_bfState', '_rvState'].map(name => declaration(name, 'var')),
    'var _bfDeckSlices = null, _gradeLessonsCache = null, _lastResourcePanel = null, _marksAliasMigratedFor = null;',
    ...functionNames.map(name => fnBodyOf(SOURCE, name)),
  ].join('\n'));
  const render = win._ftRenderOutcome;
  win._ftRenderOutcome = function (...args) {
    outcomes.push(args[2]);
    return render(...args);
  };

  return {
    win, posts, outcomes, dialogs,
    failMarks(value) { failMarks = value; },
    offline(value) { offline = value; },
    gradeRead(fn) { gradeRead = fn; },
    marks(username) { return JSON.parse(win.localStorage.getItem('apstats_desk_marks_' + username) || '{}'); },
    snapshot() { return Object.fromEntries(Object.keys(win.localStorage).map(key => [key, win.localStorage.getItem(key)])); },
    async signIn(username, route = 'Desk') {
      if (route === 'other app') {
        expect((await win.rosterClient.signIn(username, '1234')).ok).toBe(true);
      } else if (route === 'name finder') {
        win._nfPicked = { username };
        await win._nfSubmitPassword();
      } else {
        win.document.getElementById('signin-username').value = username;
        await win.submitSignIn();
      }
      expect(win.rosterClient.studentId()).toBe(USERS[username].studentId);
    },
    async open() { await win._ftStart(null, TOPIC); await settle(); },
    async finish() {
      const round = win._ftState.round;
      expect(round.total).toBe(30);
      while (!win._ftDone(round)) win._ftRecordOutcome(round, 'correct', 1000);
      await win._ftFinish();
      await settle();
    },
    async retry() {
      const button = win.document.getElementById('bf-retry-save');
      expect(button, 'a recoverable finished result offers a save action').not.toBeNull();
      button.click();
      await settle();
    },
    close() { win.Storage.prototype.setItem = originalSet; win.close(); },
  };
}

describe('Finished flashcard attribution through real sign-in and ledger clients', () => {
  it.each(['Desk', 'name finder'])('saves the first finished deck after %s sign-in', async route => {
    const h = openDesk();
    try {
      await h.signIn('Alice', route);
      await h.open();
      await h.finish();
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0]).toMatchObject({ token: 'token-a', itemId: 'BL-U4-L7-DESK_DAY', score: 100 });
      expect(h.marks('Alice')['4.7|blooket'].score).toBe(100);
      expect(h.win.document.querySelector('.bf-outcome').textContent).toContain('Saved');
    } finally { h.close(); }
  });

  it.each(['Desk', 'other app'])('rejects a failed-save retry after a %s account switch', async route => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      await h.open();
      h.failMarks(true);
      await h.finish();
      expect(h.outcomes.at(-1)).toMatchObject({ error: true });
      const before = h.posts.length;
      await h.signIn('Bob', route);
      h.failMarks(false);
      await h.retry();
      expect(h.outcomes.at(-1)).toMatchObject({ error: true, ownerChanged: true });
      expect(h.posts).toHaveLength(before);
      expect(h.marks('Alice')).toEqual({});
      expect(h.marks('Bob')).toEqual({});
      expect(h.win.document.querySelector('.bf-outcome').textContent).toMatch(/sign.in|account/i);
    } finally { h.close(); }
  });

  it('rejects a new commit when a stable legacy identity disagrees with the roster session', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      await h.signIn('Bob', 'other app');
      expect(h.win.getStudentEmail()).toBe('Alice');
      const outcome = await h.win._blooketCommit(null, TOPIC, 100, true);
      await settle();
      expect(outcome).toMatchObject({ error: true, ownerChanged: true });
      expect(h.posts).toEqual([]);
      expect(h.marks('Alice')).toEqual({});
      expect(h.marks('Bob')).toEqual({});
    } finally { h.close(); }
  });

  it('rejects an already-best replay when the roster changes during the first grade read', async () => {
    const h = openDesk({
      apstats_desk_marks_Alice: JSON.stringify({
        '4.7|blooket': { ts: '2026-11-01T00:00:00.000Z', score: 100 },
      }),
    });
    const grade = deferred();
    try {
      await h.signIn('Alice');
      await h.open();
      // A lower replay skips _studentMarkSave and sends its own ledger row.
      // Its only admission check before that send follows the grade refresh.
      h.win._ftRecordOutcome(h.win._ftState.round, 'wrong', 1000);
      h.gradeRead(() => grade.promise);
      const finishing = h.finish();
      await settle();
      expect(h.win._ftScore(h.win._ftState.round)).toBeLessThan(100);
      await h.signIn('Bob', 'other app');
      grade.resolve();
      await finishing;
      expect(h.posts).toEqual([]);
      expect(h.outcomes.at(-1)).toMatchObject({ error: true, ownerChanged: true });
      expect(h.marks('Alice')['4.7|blooket'].score).toBe(100);
      expect(h.marks('Bob')).toEqual({});
    } finally { grade.resolve(); h.close(); }
  });

  it.each([
    ['username casing', 'Alice', 'alice'],
    ['trimmed proxy alias', '  ALICE@ROSTER.LOCAL  ', ' alice '],
  ])('accepts same-student retry after %s changes', async (_label, legacy, typedUsername) => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      await h.open();
      h.failMarks(true);
      await h.finish();
      expect(h.outcomes.at(-1)).toMatchObject({ error: true });
      const fetch = h.win.fetch;
      h.win.fetch = async (url, options) => {
        if (String(url).endsWith('/roster/verify')) {
          // The real endpoint matches without case and omits username; the
          // real client must therefore retain the spelling submitted to it.
          const { username, ...session } = USERS.Alice;
          return response({ ok: true, ...session, token: 'token-a-renewed' });
        }
        return fetch(url, options);
      };
      expect((await h.win.rosterClient.signIn(typedUsername, '1234')).ok).toBe(true);
      expect(h.win.rosterClient.current().username).toBe(typedUsername);
      h.win.localStorage.setItem('apstats_desk_student_email', legacy);
      h.failMarks(false);
      await h.retry();
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0]).toMatchObject({ token: 'token-a-renewed', score: 100 });
      expect(h.outcomes.at(-1)).toMatchObject({ saved: true });
    } finally { h.close(); }
  });

  it('the commit boundary itself refuses an explicitly admitted identity after an account switch', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      const identity = h.win._ftCaptureOwner();
      await h.signIn('Bob');
      const outcome = await h.win._blooketCommit(null, TOPIC, 100, true, identity);
      await settle();
      expect(outcome).toMatchObject({ error: true, ownerChanged: true });
      expect(h.posts).toEqual([]);
      expect(h.marks('Alice')).toEqual({});
      expect(h.marks('Bob')).toEqual({});
    } finally { h.close(); }
  });

  it('explains a direct Done refusal when the Desk and roster identities disagree', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      await h.signIn('Bob', 'other app');
      const previousDialogs = h.dialogs.length;
      expect(await h.win._studentMarkSave(null, TOPIC, 'worksheet', 100)).toBe(false);
      await settle();
      expect(h.dialogs.length).toBeGreaterThan(previousDialogs);
      expect(h.dialogs.at(-1).join(' ')).toMatch(/sign.in|account/i);
      expect(h.posts).toEqual([]);
      expect(h.marks('Alice')).toEqual({});
      expect(h.marks('Bob')).toEqual({});
    } finally { h.close(); }
  });

  it('accepts the same roster student when sign-in replaces the synthesized legacy alias', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice', 'other app');
      expect(h.win.getStudentEmail()).toBe('Alice@roster.local');
      await h.open();
      h.failMarks(true);
      await h.finish();
      await h.signIn('Alice');
      h.failMarks(false);
      await h.retry();
      expect(h.outcomes.at(-1)).toMatchObject({ saved: true });
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0].token).toBe('token-a');
      expect(h.marks('Alice')['4.7|blooket'].score).toBe(100);
    } finally { h.close(); }
  });

  it.each(['Desk', 'other app'])('keeps the round owner when a %s switch happens before finishing', async route => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      await h.open();
      await h.signIn('Bob', route);
      await h.finish();
      expect(h.outcomes.at(-1)).toMatchObject({ error: true, ownerChanged: true });
      expect(h.posts).toEqual([]);
      expect(h.marks('Alice')).toEqual({});
      expect(h.marks('Bob')).toEqual({});
    } finally { h.close(); }
  });

  it('does not score a read-only practice round after leaving the read-only view', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice');
      h.win.__WS_READ_ONLY__ = true;
      await h.open();
      h.win.__WS_READ_ONLY__ = false;
      await h.finish();
      expect(h.posts).toEqual([]);
      expect(h.marks('Alice')).toEqual({});
      expect(h.win.document.querySelector('.bf-outcome').textContent).toContain('Not recorded');
    } finally { h.close(); }
  });

  it('resumes the same partial sitting after the same student normalizes their legacy alias', async () => {
    const h = openDesk();
    try {
      await h.signIn('Alice', 'other app');
      await h.open();
      const roundId = h.win._ftState.roundId;
      function answerCurrentCard() {
        const round = h.win._ftState.round;
        const card = round.deck[h.win._ftCurrentIdx(round)];
        h.win._ftAnswer(card.correctIdx);
      }
      answerCurrentCard();
      expect(h.win._ftState.round.order).toHaveLength(29);
      await h.signIn('Alice');
      h.win._ftRenderCard();
      answerCurrentCard();
      const queue = [...h.win._ftState.round.order];
      expect(queue).toHaveLength(28);
      h.win.closeBlooketFlashcards();
      await h.open();
      expect(h.win._ftState.roundId).toBe(roundId);
      expect([...h.win._ftState.round.order]).toEqual(queue);
      expect(h.posts).toEqual([]);
    } finally { h.close(); }
  });
});

describe('Finished result recovery stays with the original roster account', () => {
  it('keeps both pending owners while offline recovery queues only the returning original student', async () => {
    const h = openDesk();
    const grade = deferred();
    let reread;
    try {
      await h.signIn('Alice');
      await h.open();
      h.gradeRead(() => grade.promise);
      const finishingAlice = h.finish();
      await settle();
      h.win.closeBlooketFlashcards();
      await h.signIn('Bob');
      h.gradeRead(async () => {});
      h.failMarks(true);
      await h.open();
      await h.finish();
      grade.resolve();
      await finishingAlice;
      reread = openDesk(h.snapshot());
      await reread.signIn('Alice');
      reread.offline(true);
      await reread.open();
      expect(reread.win._ftState.round.order).toHaveLength(0);
      await reread.retry();
      expect(reread.posts).toEqual([]);
      expect(await reread.win.OfflineQueue.all()).toMatchObject([
        { studentId: 'student-a', itemId: 'BL-U4-L7-DESK_DAY', score: 100 },
      ]);
      reread.win.closeBlooketFlashcards();
      await reread.signIn('Bob');
      await reread.open();
      expect(reread.win._ftState.round.order).toHaveLength(0);
      expect(reread.win.document.getElementById('bf-retry-save')).not.toBeNull();
      expect((await reread.win.OfflineQueue.all()).map(row => row.studentId)).toEqual(['student-a']);
    } finally { h.close(); reread?.close(); }
  });

  it('survives a switch during the first grade read, window close and reload, then saves for the returning owner', async () => {
    const h = openDesk();
    const grade = deferred();
    let reread;
    try {
      await h.signIn('Alice');
      await h.open();
      const originalRound = JSON.parse(JSON.stringify(h.win._ftState.round));
      let reads = 0;
      h.gradeRead(() => { reads++; return grade.promise; });
      const finishing = h.finish();
      await settle();
      expect(reads).toBe(1);
      await h.signIn('Bob', 'other app');
      grade.resolve();
      await finishing;
      expect(h.posts).toEqual([]);
      expect(h.outcomes.at(-1)).toMatchObject({ error: true, ownerChanged: true });
      h.win.closeBlooketFlashcards();
      reread = openDesk(h.snapshot());
      await reread.signIn('Bob');
      await reread.open();
      expect(reread.win.document.getElementById('bf-retry-save')).toBeNull();
      expect(reread.win._ftState.round.order).toHaveLength(30);
      reread.win.closeBlooketFlashcards();
      await reread.signIn('Alice');
      await reread.open();
      expect(reread.win._ftState.round.deck).toEqual(originalRound.deck);
      expect(reread.win._ftState.round.order).toHaveLength(0);
      expect(reread.win.document.getElementById('bf-retry-save').textContent).toContain('Save your finished run');
      await reread.retry();
      expect(reread.posts).toHaveLength(1);
      expect(reread.posts[0]).toMatchObject({ token: 'token-a', itemId: 'BL-U4-L7-DESK_DAY', score: 100 });
      expect(reread.marks('Alice')['4.7|blooket'].score).toBe(100);
      expect(reread.marks('Bob')).toEqual({});
      reread.win.closeBlooketFlashcards();
      await reread.open();
      expect(reread.win.document.getElementById('bf-retry-save')).toBeNull();
      expect(reread.win._ftState.round.order).toHaveLength(30);
    } finally { h.close(); reread?.close(); }
  });

  it('keeps two students\' finished results for the same topic independently', async () => {
    const h = openDesk();
    let reread;
    try {
      h.failMarks(true);
      await h.signIn('Alice');
      await h.open();
      await h.finish();
      h.win.closeBlooketFlashcards();
      await h.signIn('Bob');
      await h.open();
      await h.finish();
      h.win.closeBlooketFlashcards();
      reread = openDesk(h.snapshot());
      await reread.signIn('Alice');
      await reread.open();
      expect(reread.win._ftState.round.order).toHaveLength(0);
      await reread.retry();
      reread.win.closeBlooketFlashcards();
      await reread.signIn('Bob');
      await reread.open();
      expect(reread.win._ftState.round.order).toHaveLength(0);
      await reread.retry();
      expect(reread.posts.map(post => post.token)).toEqual(['token-a', 'token-b']);
      expect(reread.posts.every(post => post.score === 100)).toBe(true);
      expect(reread.marks('Alice')['4.7|blooket'].score).toBe(100);
      expect(reread.marks('Bob')['4.7|blooket'].score).toBe(100);
    } finally { h.close(); reread?.close(); }
  });

  it('keeps two already-open sittings for the same owner and topic independently', async () => {
    const first = openDesk();
    let second;
    let reread;
    try {
      await first.signIn('Alice');
      await first.open();
      second = openDesk(first.snapshot());
      await second.open();
      second.win._ftStartOver();
      await settle();
      const firstId = first.win._ftState.roundId;
      const secondId = second.win._ftState.roundId;
      expect(secondId).not.toBe(firstId);
      const secondRound = second.win._ftState.round;
      second.win._ftRecordOutcome(secondRound, 'wrong', 1000);
      first.failMarks(true);
      second.failMarks(true);
      await first.finish();
      // Model the other tab seeing storage written after both sittings were opened.
      for (const [key, value] of Object.entries(first.snapshot())) second.win.localStorage.setItem(key, value);
      await second.finish();
      reread = openDesk(second.snapshot());
      await reread.open();
      expect(reread.win._ftState.roundId).toBe(firstId);
      await reread.retry();
      reread.win.closeBlooketFlashcards();
      await reread.open();
      expect(reread.win._ftState.roundId).toBe(secondId);
      expect(reread.win._ftState.round.order).toHaveLength(0);
      await reread.retry();
      expect(reread.posts).toHaveLength(2);
      expect(reread.posts[0]).toMatchObject({ token: 'token-a', score: 100 });
      expect(reread.posts[1].token).toBe('token-a');
      expect(reread.posts[1].score).toBeLessThan(100);
      expect(reread.marks('Alice')['4.7|blooket'].score).toBe(100);
    } finally { first.close(); second?.close(); reread?.close(); }
  });

  it('a late successful finish cannot clear a newer partial sitting from another tab', async () => {
    const first = openDesk();
    const grade = deferred();
    let second;
    try {
      await first.signIn('Alice');
      await first.open();
      second = openDesk(first.snapshot());
      await second.open();
      second.win._ftStartOver();
      await settle();
      const newerId = second.win._ftState.roundId;
      expect(newerId).not.toBe(first.win._ftState.roundId);
      first.gradeRead(() => grade.promise);
      const finishing = first.finish();
      await settle();
      const key = second.win._ftResumeKey();
      const newerResume = second.win.localStorage.getItem(key);
      first.win.localStorage.setItem(key, newerResume);
      grade.resolve();
      await finishing;
      expect(first.posts).toHaveLength(1);
      const remaining = JSON.parse(first.win.localStorage.getItem(key));
      expect(remaining[TOPIC].roundId).toBe(newerId);
      expect(remaining[TOPIC].round.order).toHaveLength(30);
    } finally { first.close(); second?.close(); }
  });

  it('does not describe an original-owner save as lost when identity changes during the final grade refresh', async () => {
    const h = openDesk();
    const lastGrade = deferred();
    try {
      await h.signIn('Alice');
      await h.open();
      let reads = 0;
      h.gradeRead(() => ++reads === 1 ? Promise.resolve() : lastGrade.promise);
      const finishing = h.finish();
      await settle();
      expect(reads).toBe(2);
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0].token).toBe('token-a');
      await h.signIn('Bob', 'other app');
      lastGrade.resolve();
      await finishing;
      const copy = h.win.document.querySelector('.bf-outcome').textContent;
      expect(copy).toMatch(/saved|recorded/i);
      expect(copy).not.toMatch(/not saved|could not save/i);
      expect(h.posts).toHaveLength(1);
      expect(h.marks('Bob')).toEqual({});
    } finally { h.close(); }
  });
});
