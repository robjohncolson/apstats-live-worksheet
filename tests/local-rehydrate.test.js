// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(ROOT).filter(f => /^u\d+_lesson.+_live\.html$/.test(f));
const html = readFileSync(resolve(ROOT, 'u6_lesson1-2_live.html'), 'utf8');
const prefix = 'WS-U6L1-2';
const keyOf = row => `${row.source}|${row.itemId}|${row.attempt ?? 1}`;
const blankRow = (overrides = {}) => ({ studentId: 'student-1', source: 'worksheet', itemId: prefix + '-q1', response: 'random', ts: 1, ...overrides });
const frqRow = (overrides = {}) => blankRow({ source: 'frq', itemId: prefix + '-reflect1', response: 'My saved explanation', ...overrides });
const windows = [];

// Like worksheet-graded-note.test.js, run actual worksheet functions in jsdom,
// without unrelated timers, ledger healing, or external network scripts.
function extractFn(name) {
    const match = new RegExp('(?:async )?function ' + name + '\\s*\\(').exec(html);
    if (!match) throw new Error('Missing function: ' + name);
    const open = html.indexOf('{', match.index);
    let depth = 0;
    for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++;
        if (html[i] === '}' && --depth === 0) return html.slice(match.index, i + 1);
    }
    throw new Error('Unclosed function: ' + name);
}

async function boot(rows = [], prior = new Map()) {
    const dom = new JSDOM('<body><input id="worksheetName"><input id="worksheetUsername"><input id="worksheetPeriod"><div><input class="blank" data-question-id="WS-U6L1-2-q1" data-answer="random"></div><div><textarea id="reflect1"></textarea></div></body>', {
        url: 'https://ws.test/u6_lesson1-2_live.html', runScripts: 'outside-only',
    });
    const w = dom.window;
    windows.push(w);
    // Allow jsdom's initial DOMContentLoaded before installing the real triggers.
    await new Promise(resolve => w.setTimeout(resolve, 0));
    w.OfflineQueue = { all: vi.fn(async () => rows), keyOf };
    w.rosterClient = { studentId: () => 'student-1', current: () => ({ username: 'student', expired: false }), token: () => 'token' };
    w.gradebookClient = { fetchPrior: vi.fn(async () => prior), record: vi.fn() };
    w.recordBlankToGradebook = vi.fn();
    w.recordReflectionDraft = vi.fn();
    w.eval("var _lrHydratedOwner = null; const UNIT_ID = 'U6L1-2';\n" + [
        'gbWsPrefix', 'normalize', 'checkAnswer', 'hydratePriorAnswers',
        '_lrResetForeignRestores', '_markLocalRestored', '_markLocalSaved', 'hydrateLocalAnswers', '_markRestored',
        '_lrShowExpiredBanner', '_wallAccessGranted', '_removeSigninWall', '_showSigninWall', '_checkSigninWall', 'restoreSavedUser',
    ].map(extractFn).join('\n'));
    // Suppress only the automatic initial timer; test calls control hydration.
    const timer = w.setTimeout;
    w.setTimeout = () => 0;
    const start = html.indexOf('        // Hydration trigger:');
    const end = html.indexOf('        })();', start) + '        })();'.length;
    w.eval(html.slice(start, end));
    w.setTimeout = timer;
    return { w, blank: w.document.querySelector('.blank'), ta: w.document.querySelector('textarea') };
}

afterEach(() => {
    for (const w of windows.splice(0)) {
        if (!w.realClientIntegration) expect(w.gradebookClient?.record).not.toHaveBeenCalled();
        if (!w.realClientIntegration) expect(w.recordBlankToGradebook).not.toHaveBeenCalled();
        expect(w.recordReflectionDraft).not.toHaveBeenCalled();
        w.close();
    }
});

describe('local rehydration rollout', () => {
    it.each(files)('%s has one marker for each phase and the hydration hooks', file => {
        const source = readFileSync(resolve(ROOT, file), 'utf8');
        expect(source.split('// LR1: hydrateLocalAnswers')).toHaveLength(2);
        expect(source.split('// LR2: expired wall')).toHaveLength(2);
        expect(source).toContain('async function hydrateLocalAnswers()');
        expect(source).toMatch(/finally \{[^\n]*finish\(diagnosticRun, prior\); hydrateLocalAnswers\(\);/);
        expect(source).toContain("addEventListener('gb-row-saved'");
        expect(source).toContain("addEventListener('roster-session-changed', function ()");
    });
});

describe('local answer hydration', () => {
    it('paints queued blanks and textareas, uses latest sequence, and deduplicates badges', async () => {
        const { w, blank, ta } = await boot([
            blankRow({ response: 'old', transportSequence: 2, ts: 100 }),
            blankRow({ transportSequence: 3 }), frqRow(),
            frqRow({ response: 'appeal text', kind: 'appeal', ts: 9 }),
            blankRow({ response: ' ', ts: 99 }),
        ]);
        w._markRestored(blank);
        await w.hydratePriorAnswers();
        await new Promise(resolve => w.setTimeout(resolve, 0));
        expect(blank.value).toBe('random');
        expect(blank.classList.contains('correct')).toBe(true);
        expect(ta.value).toBe('My saved explanation');
        for (const el of [blank, ta]) {
            expect(el.dataset.restored).toBe('1');
            expect(el.dataset.localOnly).toBe('1');
            expect(el.nextSibling.textContent).toBe('↻ kept on this device — not saved to your grade yet');
            expect(el.nextSibling.className).toBe('restored-badge local-only');
        }
        await w.hydrateLocalAnswers();
        expect(w.document.querySelectorAll('.restored-badge')).toHaveLength(2);
    });

    it('keeps the server answer and plain restored badge', async () => {
        const { w, blank } = await boot([blankRow()], new Map([[prefix + '-q1', { response: 'server answer' }]]));
        await w.hydratePriorAnswers();
        await new Promise(resolve => w.setTimeout(resolve, 0));
        expect(blank.value).toBe('server answer');
        expect(blank.nextSibling.textContent).toBe('↻ restored');
        expect(blank.dataset.localOnly).toBeUndefined();
    });

    it('does not restore another student’s rows', async () => {
        const { w, blank, ta } = await boot([blankRow({ studentId: 'other' }), frqRow({ studentId: 'other' })]);
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('');
        expect(ta.value).toBe('');
    });

    it('does not restore another worksheet’s rows', async () => {
        const { w, blank, ta } = await boot([blankRow({ itemId: 'WS-U1L1-q1' }), frqRow({ itemId: 'WS-U1L1-reflect1' })]);
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('');
        expect(ta.value).toBe('');
    });

    it('does not overwrite edited targets or existing values', async () => {
        const { w, blank, ta } = await boot([blankRow(), frqRow()]);
        blank.dataset.gbEdited = '1';
        ta.value = 'in progress';
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('');
        expect(ta.value).toBe('in progress');
    });

    it('flips only the matching saved badge and restores the original style', async () => {
        const { w, blank, ta } = await boot([blankRow(), frqRow()]);
        w._markRestored(blank);
        const savedStyle = blank.nextSibling.style.cssText;
        await w.hydrateLocalAnswers();
        w.dispatchEvent(new w.CustomEvent('gb-row-saved', { detail: { key: keyOf(blankRow()), studentId: 'student-1', transportSequence: 1 } }));
        expect(blank.dataset.localOnly).toBeUndefined();
        expect(blank.nextSibling.className).toBe('restored-badge');
        expect(blank.nextSibling.textContent).toBe('↻ restored');
        expect(blank.nextSibling.style.cssText).toBe(savedStyle);
        expect(ta.dataset.localOnly).toBe('1');
    });

    it('handles absent or rejected queues without throwing or changing the page', async () => {
        const { w, blank } = await boot();
        delete w.OfflineQueue;
        await expect(w.hydrateLocalAnswers()).resolves.toBeUndefined();
        w.OfflineQueue = { keyOf, all: async () => { throw new Error('IndexedDB unavailable'); } };
        await expect(w.hydrateLocalAnswers()).resolves.toBeUndefined();
        expect(blank.value).toBe('');
        expect(w.document.querySelector('.restored-badge')).toBeNull();
    });

    it('shows expiry immediately while leaving the wall open and inputs enabled', async () => {
        const { w, blank, ta } = await boot();
        w.rosterClient.current = () => ({ username: 'student', expired: true });
        w._checkSigninWall();
        w._checkSigninWall();
        w.restoreSavedUser();
        expect(w.document.querySelectorAll('#gb-no-identity-nudge')).toHaveLength(1);
        expect(w.document.querySelector('#gb-no-identity-nudge a').getAttribute('href')).toBe('ap_stats_roadmap_square_mode.html');
        expect(w.document.getElementById('ws-signin-wall')).toBeNull();
        expect(w.document.getElementById('worksheetName').value).toContain('expired — sign in again');
        expect(blank.disabled).toBe(false);
        expect(ta.disabled).toBe(false);
    });
});


describe('ownership and drain reconciliation', () => {
    it.each(['storage', 'roster-session-changed'])('clears foreign restores before %s hydration', async event => {
        const { w, blank, ta } = await boot([blankRow(), frqRow()]);
        await w.hydrateLocalAnswers();
        blank.classList.add('revealed', 'graded-E');
        w.rosterClient.studentId = () => 'student-B';
        w.gradebookClient.fetchPrior.mockImplementation(async () => {
            expect(blank.value).toBe('');
            expect(ta.value).toBe('');
            return new Map();
        });
        w.dispatchEvent(event === 'storage' ? new w.StorageEvent('storage', { key: 'apstats_roster.v1' }) : new w.Event(event));
        expect(blank.value).toBe('');
        expect(blank.className).toBe('blank');
        expect(blank.dataset.restoredOwner).toBeUndefined();
        expect(w.document.querySelector('.restored-badge')).toBeNull();
        expect(w.gradebookClient.fetchPrior).toHaveBeenCalledTimes(1);
    });

    it('clears server-restored values when the account changes', async () => {
        const { w, blank } = await boot([], new Map([[prefix + '-q1', { response: 'server A' }]]));
        await w.hydratePriorAnswers();
        expect(blank.dataset.restoredOwner).toBe('student-1');
        w.rosterClient.studentId = () => 'student-B';
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('');
    });

    it.each(['__WS_READ_ONLY__', '__VIEW_AS_STUDENT_ID__'])('skips local hydration for %s', async flag => {
        const { w, blank } = await boot([blankRow()]);
        w[flag] = true;
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('');
        expect(w.OfflineQueue.all).not.toHaveBeenCalled();
    });

    it.each([
        { studentId: 'student-B', transportSequence: 10 },
        { studentId: 'student-1', transportSequence: 9 },
    ])('rejects saved events for another owner or older version: %j', async detail => {
        const { w, blank } = await boot([blankRow({ transportSequence: 10 })]);
        await w.hydrateLocalAnswers();
        w.dispatchEvent(new w.CustomEvent('gb-row-saved', { detail: { key: keyOf(blankRow()), ...detail } }));
        expect(blank.dataset.localOnly).toBe('1');
    });

    it('debounces a server refetch when saved rows were drained before local reads', async () => {
        const { w } = await boot();
        vi.useFakeTimers();
        w.setTimeout = setTimeout; w.clearTimeout = clearTimeout;
        try {
            await w.hydratePriorAnswers();
            for (let i = 0; i < 3; i++) w.dispatchEvent(new w.CustomEvent('gb-row-saved', { detail: { key: 'unknown' } }));
            await vi.advanceTimersByTimeAsync(1499);
            expect(w.gradebookClient.fetchPrior).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(w.gradebookClient.fetchPrior).toHaveBeenCalledTimes(2);
        } finally { vi.useRealTimers(); }
    });

    it('recovers a real 401-captured row and never posts A answers using B credentials', async () => {
        const { w, blank } = await boot();
        w.realClientIntegration = true;
        w.ROSTER_SERVICE_URL = 'https://roster.test';
        w.localStorage.setItem('apstats_roster.v1', JSON.stringify({ studentId: 'student-1', token: 'token-A' }));
        w.fetch = vi.fn(async (_url, options) => {
            if (options?.method === 'POST') return { ok: false, status: 401, json: async () => ({ ok: false }) };
            return { ok: true, status: 200, json: async () => ({ ok: true, rows: [] }) };
        });
        for (const file of ['offline-queue.js', 'roster-client.js', 'gradebook-client.js']) w.eval(readFileSync(resolve(ROOT, file), 'utf8'));
        w.eval(['gbUnitFromItemId', 'recordBlankToGradebook', 'healLocalAnswersToLedger'].map(extractFn).join('\n'));
        const healStart = html.indexOf('        // Heal trigger:');
        const healEnd = html.indexOf('        })();', healStart) + '        })();'.length;
        w.eval(html.slice(healStart, healEnd));
        const result = await w.gradebookClient.record({ source: 'worksheet', itemId: prefix + '-q1', response: 'random' });
        expect(result).toMatchObject({ ok: false, reason: 'auth', queued: true });
        await w.hydratePriorAnswers();
        await w.hydrateLocalAnswers();
        expect(blank.value).toBe('random');
        expect(blank.nextSibling.className).toBe('restored-badge local-only');
        const record = vi.spyOn(w.gradebookClient, 'record');
        w.localStorage.setItem('apstats_roster.v1', JSON.stringify({ studentId: 'student-B', token: 'token-B' }));
        w.dispatchEvent(new w.StorageEvent('storage', { key: 'apstats_roster.v1' }));
        expect(blank.value).toBe('');
        await new Promise(resolve => w.setTimeout(resolve, 650));
        expect(record).not.toHaveBeenCalled();
        const posts = w.fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
        expect(posts.length).toBeGreaterThan(0);
        expect(posts.every(([, options]) => JSON.parse(options.body).token === 'token-A')).toBe(true);
        expect((await w.OfflineQueue.all())[0].studentId).toBe('student-1');
    });
});
