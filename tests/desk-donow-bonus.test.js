import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';

// BONUS_DONOW_SPEC: one banked-bonus sentence under the Do Now grade pill.
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

const FNS = ['_walletBonusResponse', '_walletBonusFooterText', '_bonusSummary', '_walletBonusBlock',
  '_doNowBonusText', '_clearDoNowBonus', 'renderDoNowBonus'];

function sandbox(receipts) {
  const dom = new JSDOM('<div id="donow-bonus" style="display:none"></div>');
  const s = {
    window: dom.window, document: dom.window.document, quarterOfDate: () => 1,
    _walletFetchBonusReceipts: vi.fn(async () => receipts),
  };
  createContext(s);
  runInContext(FNS.map(fnSrc).join('\n'), s);
  return { s, host: dom.window.document.getElementById('donow-bonus'), close: () => dom.window.close() };
}

const screen = { src: 'bonus', i: 'BONUS-screen', sc: 3, response: JSON.stringify({ quarter: 'Q1', grade: 'P', title: 'Screen Time' }) };
const candle = { src: 'bonus', i: 'BONUS-candle', sc: 5, response: JSON.stringify({ quarter: 'Q1', grade: 'E', title: 'Candle Tests' }) };

describe('Do Now bonus line', () => {
  it('stays hidden and empty when nothing is banked', async () => {
    const { s, host, close } = sandbox([]);
    try {
      await s.renderDoNowBonus();
      expect(host.style.display).toBe('none');
      expect(host.textContent).toBe('');
    } finally { close(); }
  });

  it('renders every banked sheet with its letter, points and the sum', async () => {
    const { s, host, close } = sandbox([screen, candle]);
    try {
      await s.renderDoNowBonus();
      expect(host.style.display).toBe('block');
      expect(host.textContent).toBe('Bonus banked: Screen Time P (+3) · Candle Tests E (+5) = +8 at quarter end');
      expect(host.title).toBe('Added at the end of the quarter to whichever track helps you more.');
    } finally { close(); }
  });

  it('never shows a projected grade, only what is banked', async () => {
    const { s, host, close } = sandbox([screen, candle]);
    try {
      await s.renderDoNowBonus();
      expect(host.textContent).not.toMatch(/grade becomes|up to \d/i);
    } finally { close(); }
  });

  it('shows the applied sentence once the quarter closed', async () => {
    const applied = { src: 'bonus_applied', i: 'BONUS-APPLIED-Q1', sc: 87, response: JSON.stringify({ adjustedGrade: 87, placement: 'work' }) };
    const { s, host, close } = sandbox([screen, applied]);
    try {
      await s.renderDoNowBonus();
      expect(host.textContent).toBe('Applied to your Work track — quarter grade 87.');
      expect(host.title).toBe('');
    } finally { close(); }
  });

  it('ignores rows from another quarter', async () => {
    const old = { src: 'bonus', i: 'BONUS-old', sc: 5, response: JSON.stringify({ quarter: 'Q2', grade: 'E', title: 'Old' }) };
    const { s, host, close } = sandbox([old]);
    try {
      await s.renderDoNowBonus();
      expect(host.style.display).toBe('none');
    } finally { close(); }
  });

  it('agrees with the My Ledger block (same helper, same sheets and points)', () => {
    const { s, close } = sandbox([screen, candle]);
    try {
      const block = s._walletBonusBlock([screen, candle]);
      const lines = Array.from(block.children).slice(1, -1).map(el => el.textContent);
      expect(lines).toEqual(['Screen Time — P (+3)', 'Candle Tests — E (+5)']);
      expect(s._doNowBonusText(s._bonusSummary([screen, candle]))).toContain('= +8');
    } finally { close(); }
  });

  it('clearing empties the host and hides it', async () => {
    const { s, host, close } = sandbox([screen]);
    try {
      await s.renderDoNowBonus();
      s._clearDoNowBonus();
      expect(host.style.display).toBe('none');
      expect(host.textContent).toBe('');
    } finally { close(); }
  });

  it('renderDoNowGrades clears the line on entry and re-renders it after the pill', () => {
    const src = fnSrc('renderDoNowGrades');
    expect(src).toContain('_clearDoNowBonus()');
    expect(src.indexOf('host.appendChild(pill)')).toBeLessThan(src.indexOf('renderDoNowBonus()'));
  });
});
