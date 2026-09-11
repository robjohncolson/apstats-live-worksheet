// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../teacher-dashboard.html', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../teacher-workspace.js', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../ap_stats_roadmap_square_mode.html', import.meta.url), 'utf8');
const doms = [];
const tick = () => new Promise(r => setTimeout(r, 20));
const response = data => ({ ok: true, status: 200, json: async () => data });
const saved = { itemId: 'WS-U1L1-Q1', source: 'worksheet', recordedAt: '2026-09-10T14:00:00Z', score: 1, response: '<img src=x onerror=alert(1)>' };
const student = { studentId: 's1', username: 'apple_cat', realName: 'Same Name', section: 'PeriodB', schoologyUid: '123', savedWork: { available: true, recent: [saved], pendingGrading: 0 }, gradebook: { quarters: {} } };
async function make() {
  const errors = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html.replace(/<script[^>]*src=[\s\S]*?<\/script>/g, ''), { url: 'https://example.test/teacher-dashboard.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  doms.push(dom);
  const w = dom.window;
  w.fetch = vi.fn(async url => {
    if (url === 'data/work-manifest.json') return response({ units: [{ lessons: [{ lesson: '1.1', activities: [{ activity: 'worksheet', itemIds: [saved.itemId] }] }] }] });
    if (url.includes('/recent?')) return response({ ok: true, submissions: [saved] });
    if (url.includes('/grade')) return response({ ok: true, quarters: {}, units: {}, students: [student] });
    if (url.includes('/roster/list')) return response({ ok: true, students: [{ ...student, currentPassword: 'private-fixture' }] });
    return response({ ok: true, rows: [], messages: [], heatmap: {} });
  });
  w.rosterClient = { token: () => null, current: () => ({ role: 'teacher' }) };
  await tick(); w.eval(workspace); await tick();
  w.teacherWorkspace.loaded({ ok: true, students: [student, { ...student, studentId: 's2', username: 'pear_cat' }] });
  return { w, doc: w.document, errors };
}
afterEach(() => { doms.splice(0).forEach(d => d.window.close()); });
describe('integrated teacher workspace', () => {
  it('organizes tools, filters duplicate names by identity and opens one student panel', async () => {
    const { w, doc, errors } = await make();
    expect(errors).toEqual([]);
    expect(doc.querySelectorAll('[data-workspace-tab]')).toHaveLength(4);
    expect(doc.querySelector('#workspace-class-details #gb-tbody')).not.toBeNull();
    const buttons = doc.querySelectorAll('#workspace-roster .student-name');
    buttons[1].click(); await tick();
    expect(w._tscCurrentStudentId).toBe('s2');
    expect(doc.getElementById('tsc-drawer').getAttribute('aria-hidden')).toBe('false');
    expect(doc.querySelector('[data-student-tab=overview]').getAttribute('aria-pressed')).toBe('true');
    w.closeTscDrawer();
    doc.getElementById('workspace-search').value = 'apple';
    doc.getElementById('workspace-search').dispatchEvent(new w.Event('input'));
    expect(doc.querySelectorAll('#workspace-roster .student-name')).toHaveLength(1);
  });
  it('opens the same panel from pacing, grades, gradebook, rewards, triage and messages', async () => {
    const { w, doc } = await make();
    const payload = { ok: true, students: [student] };
    w.lastGradesPayload = payload; w.lastPacingPayload = payload;
    w.WalletLogic = { walletReadiness: () => null }; w._summerScheduleData = { lessons: [] };
    w.renderPacingOverview(payload); w.renderGradesTable(payload);
    w.renderTrainerPractice({ ...payload, students: [{ ...student, trainer: { procedures: 2, avgScore: .8 } }] });
    w.managedStudents = [student]; w.renderManagedStudents();
    w._paintWalletProposals([{ studentId: student.studentId, studentName: student.realName, username: student.username }]);
    w.renderTriage({ heatmap: { A: { weak: 1, total: 1, pctWeak: 100 } }, students: [{ ...student, weakSkills: ['A'] }] });
    w.renderStudentInbox([{ senderUsername: student.username, text: 'hello', createdAt: saved.recordedAt }]);
    for (const selector of ['#pacing-tbody', '#grades-tbody', '#trainer-tbody', '#manage-students-tbody', '#triage-list', '#inbox-list']) {
      const name = doc.querySelector(selector + ' .student-name');
      expect(name, selector).not.toBeNull();
      name.click(); await tick(); expect(w._tscCurrentStudentId).toBe('s1'); w.closeTscDrawer();
    }
    expect(w.fetch.mock.calls.some(([url]) => url.includes('/lesson-unlocks'))).toBe(false);
  });
  it('loads through the public button, opts into metadata and uses the selected period', async () => {
    const { w, doc } = await make();
    w.rosterClient.token = () => 'teacher-fixture';
    const select = doc.getElementById('workspace-period'); select.value = 'PeriodE';
    select.dispatchEvent(new w.Event('change'));
    expect(select.disabled).toBe(true);
    await tick();
    expect(w.fetch.mock.calls.some(([url]) => url.includes('/class/grades?section=PeriodE&includeSavedWork=1'))).toBe(true);
    expect(select.disabled).toBe(false);
  });
  it('saves an explicitly entered Schoology link for the selected ID only', async () => {
    const { w, doc } = await make();
    doc.querySelectorAll('#workspace-roster .student-name')[1].click(); await tick();
    const form = doc.querySelector('#workspace-account form');
    form.querySelector('input').value = '987654';
    form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    const call = w.fetch.mock.calls.find(([, options]) => options && options.method === 'PATCH');
    expect(call[0]).toContain('/roster/s2/schoology-uid');
    expect(JSON.parse(call[1].body)).toEqual({ schoologyUid: '987654' });
  });
  it('distinguishes failed data, pending grading, missing grade and a real zero', async () => {
    const { w, doc } = await make();
    const s = { ...student, savedWork: { available: true, recent: [], pendingGrading: 2 }, gradebook: { quarters: { Q1: { columns: [{ key: 'missing', title: 'Due lesson', due: true }, { key: 'zero', due: true }, { key: 'unknown' }], cells: { missing: null, zero: 0 } } } } };
    w.teacherWorkspace.loaded({ ok: true, students: [s] });
    expect(doc.getElementById('workspace-attention-list').textContent).toContain('2 response(s) awaiting grading');
    expect(doc.getElementById('workspace-attention-list').textContent).toContain('1 due items without a grade');
    w.teacherWorkspace.failed();
    expect(doc.getElementById('workspace-feed').textContent).toContain('unavailable');
    expect(doc.getElementById('workspace-feed').textContent).not.toContain('No saved submissions');
  });
  it('shows safe saved responses and opens a read-only worksheet separately from the student app', async () => {
    const { w, doc } = await make();
    doc.querySelector('#workspace-roster .student-name').click(); await tick();
    expect(doc.querySelector('#tsc-recent-list pre').textContent).toBe(saved.response);
    expect(doc.querySelector('#tsc-recent-list img')).toBeNull();
    doc.querySelector('#tsc-recent-list button').click();
    expect(doc.querySelector('#workspace-worksheet iframe').getAttribute('src')).toBe('u1_lesson1_live.html?viewAsUserId=s1');
    expect(doc.getElementById('tsc-action-view-as').textContent).toBe('View student app');
    w.closeTscDrawer();
    expect(doc.querySelector('#workspace-worksheet iframe')).toBeNull();
  });
  it('fetches passwords only on explicit reveal and removes them on close', async () => {
    const { w, doc } = await make();
    doc.querySelector('#workspace-roster .student-name').click(); await tick();
    expect(w.fetch.mock.calls.some(([url]) => url.includes('/roster/list'))).toBe(false);
    Array.from(doc.querySelectorAll('#workspace-account button')).find(b => b.textContent === 'Reveal current sign-in password').click(); await tick();
    expect(doc.getElementById('workspace-account').textContent).toContain('private-fixture');
    w.closeTscDrawer(); expect(doc.body.textContent).not.toContain('private-fixture');
  });
  it('embeds the dashboard, gates teachers and routes deprecated review to recent work', () => {
    const block = desk.slice(desk.indexOf('var _teacherWorkspaceFocus'), desk.indexOf('var _GRADE_CHECKIN_KEY'));
    expect(block).toContain("typeof _deskIsTeacher !== 'function' || !_deskIsTeacher()");
    expect(block).toContain('teacher-dashboard.html?workspace=1&view=');
    expect(block).not.toContain('window.open');
    expect(block).not.toContain('teacher-classroom.html');
    expect(block).not.toContain('teacher-code-generator.html');
    expect(block).toContain('event.source !== frame.contentWindow');
    expect(desk).toContain("function openNightlyReview() {\n    openTeacherTools('recent');");
  });
});
