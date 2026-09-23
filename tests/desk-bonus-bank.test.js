import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnSrc(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  if (!match) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html.indexOf('{', match.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(match.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

function sandbox() {
  const dom = new JSDOM('');
  const WalletLogic = { computePoints: vi.fn(rows => ({ total: rows.length, today: rows.length })) };
  dom.window.WalletLogic = WalletLogic;
  const s = { window: dom.window, document: dom.window.document, WalletLogic, quarterOfDate: () => 1, fetch: vi.fn() };
  createContext(s);
  runInContext(['_walletBonusResponse', '_walletBonusBlock', '_walletComputePoints', '_walletFetchBonusReceipts'].map(fnSrc).join('\n'), s);
  return { s, close: () => dom.window.close() };
}

describe('Desk bonus bank', () => {
  it('renders E/P/I, deduplicates sheets, uses safe text and the exact footer without placement words', () => {
    const { s, close } = sandbox();
    try {
      const e = { src: 'bonus', i: 'BONUS-screen', sc: 5, response: JSON.stringify({ quarter: 'Q1', grade: 'E', title: '<b>Screen Time</b>' }) };
      const block = s._walletBonusBlock([e, e, { src: 'bonus', itemId: 'BONUS-deletions', sc: 3 }, { src: 'bonus', item: 'BONUS-third', sc: 1, response: 'bad json' }]);
      expect(block.textContent).toContain('<b>Screen Time</b> — E (+5)');
      expect(block.textContent).toContain('deletions — P (+3)');
      expect(block.textContent).toContain('third — I (+1)');
      expect(block.lastChild.textContent).toBe('Applied at the end of the quarter.');
      expect(block.textContent).not.toMatch(/track|floor|helps/i);
      expect(block.querySelector('b')).toBeNull();
      expect(block.children).toHaveLength(5);
    } finally { close(); }
  });

  it('shows only the current quarter application and retains its sheets', () => {
    const { s, close } = sandbox();
    try {
      const rows = [{ src: 'bonus', i: 'BONUS-sheet', sc: 5 }, { src: 'bonus_applied', i: 'BONUS-APPLIED-Q2', sc: 90 }];
      expect(s._walletBonusBlock(rows).lastChild.textContent).toBe('Applied at the end of the quarter.');
      rows.push({ src: 'bonus_applied', i: 'BONUS-APPLIED-Q1', sc: 70, response: '{"adjustedGrade":85}' });
      const block = s._walletBonusBlock(rows);
      expect(block.textContent).toContain('sheet — E (+5)');
      expect(block.lastChild.textContent).toBe('Bonus applied — quarter grade 85');
      expect(block.textContent).not.toMatch(/track|floor|helps/i);
      delete rows[2].response;
      expect(s._walletBonusBlock(rows).lastChild.textContent).toBe('Bonus applied — quarter grade 70');
      expect(s._walletBonusBlock([])).toBeNull();
      expect(s._walletBonusBlock([{ src: 'bonus', i: 'BONUS-old', sc: 5, response: '{"quarter":"Q2"}' }])).toBeNull();
    } finally { close(); }
  });

  it('excludes both bonus sources from points and the ordinary feed', () => {
    const { s, close } = sandbox();
    try {
      const work = { src: 'worksheet', i: 'WS-1', sc: 1 };
      expect(s._walletComputePoints([work, { src: 'bonus', sc: 5 }, { src: 'bonus_applied', sc: 80 }]).total).toBe(1);
      expect(s.WalletLogic.computePoints).toHaveBeenCalledWith([work]);
      const paint = fnSrc('_walletPaint');
      expect(paint).toMatch(/receipts = receipts\.filter\(function \(r\) \{ return r\.src !== 'bonus' && r\.src !== 'bonus_applied'; \}\)/);
      expect(paint.indexOf('receipts = receipts.filter')).toBeLessThan(paint.indexOf('_walletRenderGroupedReceipts(host, receipts'));
    } finally { close(); }
  });

  it('loads unsigned bonus ledger rows with response metadata', async () => {
    const { s, close } = sandbox();
    try {
      s.window.rosterClient = { token: () => 'token', studentId: () => 'student' };
      s.window.ROSTER_SERVICE_URL = 'https://example.test';
      s.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [
        { source: 'bonus', item_id: 'BONUS-sheet', score: '5', response: '{"grade":"E"}' },
        { source: 'worksheet', item_id: 'WS-1', score: 1 }
      ] }) });
      expect(await s._walletFetchBonusReceipts()).toEqual([{ src: 'bonus', i: 'BONUS-sheet', sc: 5, response: '{"grade":"E"}' }]);
      expect(s.fetch.mock.calls[0][0]).toBe('https://example.test/ledger/student/student?prefix=BONUS-');
      // Teacher view-as: the VIEWED student's ledger, still with the teacher's token.
      s._viewAsContext = () => ({ studentId: 'viewed-kid' });
      await s._walletFetchBonusReceipts();
      expect(s.fetch.mock.calls[1][0]).toBe('https://example.test/ledger/student/viewed-kid?prefix=BONUS-');
      expect(s.fetch.mock.calls[1][1].headers.Authorization).toBe(s.fetch.mock.calls[0][1].headers.Authorization);
      s._viewAsContext = () => null;
      s.fetch.mockRejectedValue(new Error('offline'));
      expect(await s._walletFetchBonusReceipts()).toEqual([]);
    } finally { close(); }
  });
});
