import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teacher-dashboard.html'), 'utf8');

function sandbox() {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const $ = id => document.getElementById(id);
  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const s = {
    document, window: dom.window, $, escHtml, teacherSecret: () => 'secret', _pcAuthOk: () => true,
    studentNameHtml: r => escHtml(r.realName), showError: vi.fn(), postJson: vi.fn(), fetchJson: vi.fn()
  };
  createContext(s);
  runInContext(html.slice(html.indexOf('    function _qcQuarter()'), html.indexOf("    $('qc-freeze-btn').addEventListener")), s);
  $('section-filter').value = 'B';
  return { s, $, close: () => dom.window.close() };
}

const deltas = { ok: true, quarter: 'Q1', frozenCount: 1, deltas: [{
  realName: 'Student', frozen: 70, current: 70, delta: 0,
  bonus: { points: 5, sheets: [{ itemId: 'BONUS-screen', title: 'Screen Time, Two Deletions', grade: 'E', points: 5 }], applied: { adjustedGrade: 90 } }
}] };
const audit = { ok: true, rows: [{ realName: 'Student', frozenGrade: 70, points: 5, workBefore: 35, workAfter: 40, switched: true, adjustedGrade: 90, sheets: ['BONUS-screen'] }], skipped: [], applied: 0 };

describe('Quarter bonus dashboard', () => {
  it('renders Banked and Applied, including bonus-only rows with a plain zero delta', () => {
    const { s, $, close } = sandbox();
    try {
      s.renderQuarterDeltas(deltas);
      expect($('qc-wrap').textContent).toContain('Banked');
      expect($('qc-wrap').textContent).toContain('Applied');
      const cells = $('qc-tbody').querySelectorAll('td');
      expect(cells[3].textContent).toBe('0');
      expect(cells[3].style.color).toBe('');
      expect(cells[4].textContent).toBe('5');
      expect(cells[4].title).toBe('Screen Time, Two Deletions — E (+5)');
      expect(cells[5].textContent).toBe('90');
      // Closed = the number the teacher enters: the applied grade when present, else frozen.
      expect($('qc-wrap').textContent).toContain('Closed');
      expect(cells[6].textContent).toBe(String(deltas.deltas[0].closed != null ? deltas.deltas[0].closed : deltas.deltas[0].frozen));
      s.renderQuarterDeltas({ ...deltas, deltas: [{ ...deltas.deltas[0], closed: undefined, bonus: { points: 5, applied: null } }] });
      const row = $('qc-tbody').lastChild;
      expect(row.children[5].textContent).toBe('—');
      expect(row.children[6].textContent).toBe(String(deltas.deltas[0].frozen));
      s.renderQuarterDeltas({ ...deltas, deltas: [{ ...deltas.deltas[0], bonus: { points: 5, applied: { adjustedGrade: 90, appliedAt: 'x', stale: true } } }] });
      expect($('qc-tbody').lastChild.children[5].textContent).toContain('stale');
    } finally { close(); }
  });

  it('previews then confirms dryRun:false, disables Confirm in flight and reloads deltas', async () => {
    const { s, $, close } = sandbox();
    try {
      s.renderQuarterDeltas(deltas);
      s.postJson.mockResolvedValueOnce({ status: 200, data: audit });
      await s.previewQuarterBonus();
      expect(s.postJson).toHaveBeenCalledWith('/class/quarter/apply-bonus', { quarter: 'Q1', section: 'B', dryRun: true }, 'secret');
      expect($('qc-bonus-wrap').textContent).toContain('1 students · 1 flip the floor · 0 already applied');
      expect($('qc-bonus-wrap').textContent).toContain('✓ Yes');
      expect($('qc-bonus-wrap').textContent).toContain('35 → 40');
      let resolveApply;
      s.postJson.mockImplementationOnce(() => new Promise(resolve => { resolveApply = resolve; }));
      s.fetchJson.mockResolvedValue({ status: 200, data: deltas });
      const button = $('qc-bonus-confirm');
      const pending = button.onclick();
      expect(button.disabled).toBe(true);
      expect(s.postJson).toHaveBeenLastCalledWith('/class/quarter/apply-bonus', { quarter: 'Q1', section: 'B', dryRun: false }, 'secret');
      resolveApply({ status: 200, data: { ...audit, applied: 1, errors: ['Example error'] } });
      await pending;
      expect($('qc-bonus-status').textContent).toBe('Applied: 1. Errors: Example error');
      expect(s.fetchJson).toHaveBeenCalledWith('/class/quarter/deltas?quarter=Q1&section=B', 'secret');
      expect($('qc-bonus-confirm')).toBeNull();
    } finally { close(); }
  });

  it('requires a freeze, handles empty audits and shows migration 0036 guidance', async () => {
    const { s, $, close } = sandbox();
    try {
      s.fetchJson.mockResolvedValue({ status: 200, data: { ok: true, frozenCount: 0, deltas: [] } });
      await s.previewQuarterBonus();
      expect(s.postJson).not.toHaveBeenCalled();
      expect($('qc-bonus-hint').textContent).toBe('Freeze the quarter first.');
      s.renderQuarterDeltas(deltas);
      s.postJson.mockResolvedValue({ status: 200, data: { ok: true, rows: [], skipped: [{ reason: 'already applied' }] } });
      await s.previewQuarterBonus();
      expect($('qc-bonus-wrap').textContent).toContain('Nothing banked for Q1 in this section.');
      expect($('qc-bonus-wrap').textContent).toContain('1 already applied');
      expect($('qc-bonus-confirm')).toBeNull();
      s.postJson.mockResolvedValue({ status: 503, data: {} });
      await s.previewQuarterBonus();
      expect(s.showError.mock.calls[0][0]).toContain('0036_item_ledger_bonus_source.sql');
    } finally { close(); }
  });

  it('cannot confirm a preview after changing the quarter or section', async () => {
    const { s, $, close } = sandbox();
    try {
      s.renderQuarterDeltas(deltas);
      s.renderQuarterBonus(audit, s._qcScope());
      $('qc-quarter').value = 'Q2';
      await $('qc-bonus-confirm').onclick();
      expect(s.postJson).not.toHaveBeenCalled();
      $('qc-quarter').value = 'Q1';
      $('section-filter').value = 'E';
      await $('qc-bonus-confirm').onclick();
      expect(s.postJson).not.toHaveBeenCalled();
    } finally { close(); }
  });
});
