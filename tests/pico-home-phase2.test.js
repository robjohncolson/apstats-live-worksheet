// @vitest-environment node
/**
 * tests/pico-home-phase2.test.js
 *
 * Pico Desk Phase 2 (PICO_DESK_SPEC.md "Phase 2 — lesson panel + My Grade"), on the real Desk
 * (tests/journeys/harness.js boots the checked-in page with its own scripts against a fake
 * roster). The Desk's resource panel and ledger window are wrapped, not rewritten:
 *   - a lesson tile opens the Pico-framed panel listing every action the Desk panel lists,
 *     the selection starts on the first not-done action, Esc closes and restores focus, and
 *     the Desk's own handlers still fire;
 *   - My Grade shows the same ledger text with and without the flag;
 *   - with the flag off, neither the panel nor the ledger carries any Pico DOM.
 */

import { describe, it, expect, vi } from 'vitest';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const NOW = '2026-10-07T14:00:00.000Z';   // Wed Oct 7 2026, 10am school time

function gradeFixture() {
  return {
    ok: true, asOf: NOW, units: [], completion: {}, lessons: [], gradebook: {},
    quarters: { Q1: { quarterGrade: 87.5, pcAvg: 82, workAvg: 87.5, lessonsDue: 7, lessonsGraded: 5, lessonsTotal: 10 } },
  };
}

async function boot(flagOn) {
  const harness = await bootDesk({
    now: NOW,
    url: DESK_URL + (flagOn ? '?home=park' : ''),
    roster: { grades: gradeFixture() },
  });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog && dialog.style.display !== 'none') harness.document.getElementById('dialog-btn').click();
  // The harness signs in through the classic form, which leaves the name finder (opened by the
  // sign-in modal) showing on top; close it the Desk's way, as a student who signed in would.
  if (typeof harness.window.closeNameFinder === 'function') harness.window.closeNameFinder();
  await harness.waitFor(() => harness.document.querySelector('#donow-grades .qpill:not(.qpill-missing) .qgrade'),
    { message: 'Do Now grade pill did not render' });
  // These suites check where focus goes back for a KEYBOARD user (Tab marks one); a pointer
  // user gets nothing focused instead (tests/pico-home-keys.test.js).
  harness.document.body.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  // Tab also suspends hover (a key was pressed); a real mouse move wakes it again, as in a browser.
  harness.document.body.dispatchEvent(new harness.window.MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
  return harness;
}

const norm = (text) => String(text || '').replace(/\s+/g, ' ').trim();

// The Desk panel's own action rows, in its order (flag off): every row (section child after
// the heading, or a top-level element) that holds a link / button / input.
function deskActionRows(doc) {
  const body = doc.getElementById('resource-body');
  const rows = [];
  const hasControl = (n) => n.matches('a, button, label, input') || !!n.querySelector('a, button, input');
  for (const node of body.children) {
    const head = node.firstElementChild;
    const isSection = node.tagName === 'DIV' && head && head.classList.contains('chicago') && !hasControl(head) && node.children.length > 1;
    if (isSection) {
      [...node.children].slice(1).forEach((child) => { if (hasControl(child)) rows.push(norm(child.textContent)); });
    } else if (hasControl(node)) {
      rows.push(norm(node.textContent));
    }
  }
  return rows;
}

function picoRows(doc) {
  return [...doc.querySelectorAll('#resource-body .pico-row')];
}

// The first lesson tile on the Pico week strip (and its day).
function firstLessonTile(win, doc) {
  const days = win.PicoHome.days();
  const index = days.findIndex((d) => d.kind === 'lesson');
  expect(index, 'no lesson tile on this week').toBeGreaterThanOrEqual(0);
  return { day: days[index], tile: doc.querySelectorAll('#pico-tiles .tile')[index] };
}

async function openPanelFromTile(harness) {
  const { window: win, document: doc } = harness;
  const { day, tile } = firstLessonTile(win, doc);
  tile.focus();
  tile.click();
  await harness.waitFor(() => doc.querySelector('#resource-body .pico-lesson-list') && doc.activeElement !== tile,
    { message: 'the Pico lesson panel did not open' });
  return { day, tile };
}

describe('Phase 2 -- lesson panel', { timeout: 90_000 }, () => {
  it('a lesson tile opens the Desk panel in the Pico frame, listing every action the Desk lists', async () => {
    const off = await boot(false);
    let expected;
    let inf;
    let ds;
    try {
      // The same lesson the flag-on run will open (first lesson tile of today's week).
      const on = await boot(true);
      try {
        const { day } = await openPanelFromTile(on);
        inf = day.inf;
        ds = day.ds;
        const doc = on.document;
        expect(doc.getElementById('resource-overlay').classList.contains('pico-lesson')).toBe(true);
        const box = doc.querySelector('#resource-overlay .dialog-box');
        expect(box.classList.contains('pico-frame')).toBe(true);
        expect(box.getAttribute('role')).toBe('dialog');
        // Title bar = the tile's weekday + date.
        const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        expect(doc.getElementById('pico-lesson-bar').textContent)
          .toBe(DOW[day.date.getDay()] + ' ' + MON[day.date.getMonth()] + ' ' + day.date.getDate());
        // The Desk's own header and body are inside the frame, untouched by id.
        expect(box.contains(doc.getElementById('resource-header'))).toBe(true);
        expect(box.contains(doc.getElementById('resource-body'))).toBe(true);
        var picoList = picoRows(doc).map((row) => norm(row.textContent));
      } finally {
        on.teardown();
      }

      off.window.showResourcePanel(inf, ds);
      expected = deskActionRows(off.document);
    } finally {
      off.teardown();
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(picoList).toEqual(expected);
  });

  it('the selection starts on the first not-done action (and follows the panel status)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { day } = await openPanelFromTile(harness);
      const rows = picoRows(doc);
      const selected = rows.findIndex((row) => row.classList.contains('is-selected'));
      expect(selected).toBeGreaterThanOrEqual(0);
      // A new student: nothing is done, so the first row carrying a status is the recommendation.
      const firstWithStatus = rows.findIndex((row) => /\bVideo \d/.test(row.textContent)
        || row.querySelector('.worksheet-done-slot, .desk-quiz-done-slot'));
      expect(selected).toBe(firstWithStatus);
      expect(rows[selected].parentNode.querySelector('.sp-triangleBlue')).not.toBeNull();
      expect(rows[selected].contains(doc.activeElement)).toBe(true);
      // ArrowDown moves the outline; the triangle stays.
      doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      expect(rows[(selected + 1) % rows.length].classList.contains('is-selected')).toBe(true);
      expect(rows[selected].parentNode.querySelector('.sp-triangleBlue')).not.toBeNull();

      // Visit the video the Desk's way: the recommendation moves to the next not-done row.
      if (/\bVideo \d/.test(rows[firstWithStatus].textContent)) {
        win.recordLinkVisit(String(day.inf.t), 'video');
        await harness.waitFor(() => /✓ visited/.test(doc.getElementById('resource-body').textContent),
          { message: 'the Desk panel did not re-render after the visit' });
        await harness.waitFor(() => doc.querySelector('#resource-body .pico-lesson-list'));
        const after = picoRows(doc);
        const triangleRow = after.findIndex((row) => row.parentNode.querySelector('.sp-triangleBlue'));
        expect(triangleRow).toBeGreaterThan(firstWithStatus);
        expect(after[triangleRow].querySelector('.worksheet-done-slot, .desk-quiz-done-slot')).not.toBeNull();
      }
    } finally {
      harness.teardown();
    }
  });

  it('Esc closes the panel and focus returns to the tile', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { tile } = await openPanelFromTile(harness);
      doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      await harness.waitFor(() => doc.activeElement === tile, { message: 'focus did not return to the tile' });
    } finally {
      harness.teardown();
    }
  });

  it('the Desk handlers in the rows still fire (Done / flashcards → studentMark, links → recordLinkVisit)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await openPanelFromTile(harness);
      const studentMark = vi.fn();
      const recordLinkVisit = vi.fn();
      win.studentMark = studentMark;
      win.recordLinkVisit = recordLinkVisit;
      const markBtn = [...doc.querySelectorAll('#resource-body .pico-row button')]
        .find((b) => !b.disabled && /studentMark/.test(b.getAttribute('onclick') || ''));
      expect(markBtn, 'no enabled Done / flashcards button in the panel').toBeTruthy();
      markBtn.click();
      expect(studentMark).toHaveBeenCalledTimes(1);
      expect(studentMark.mock.calls[0][0]).toBe(markBtn);
      const link = [...doc.querySelectorAll('#resource-body .pico-row a[onclick]')]
        .find((a) => /recordLinkVisit/.test(a.getAttribute('onclick')));
      expect(link).toBeTruthy();
      link.addEventListener('click', (e) => e.preventDefault(), { once: true });
      link.click();
      expect(recordLinkVisit).toHaveBeenCalledTimes(1);
    } finally {
      harness.teardown();
    }
  });

  it('flag off: the panel keeps the Desk DOM (no Pico frame, rows or fold)', async () => {
    const harness = await boot(false);
    try {
      const { document: doc, window: win } = harness;
      const before = doc.getElementById('resource-overlay').outerHTML;
      expect(before).not.toMatch(/pico/i);
      const S = win.eval('S');      // the Desk's top-level let/const, read by name
      const MN = win.eval('MN');
      const row = S.find((r) => r[3] && typeof r[3] === 'object' && /^\d+\.\d+/.test(r[3].t));
      win.showResourcePanel(row[3], MN[row[1]] + ' ' + row[2]);
      const overlay = doc.getElementById('resource-overlay');
      expect(overlay.style.display).toBe('block');
      await new Promise((r) => setTimeout(r, 30));
      expect(overlay.outerHTML).not.toMatch(/pico/i);
      const box = overlay.querySelector('.dialog-box');
      expect([...box.children].map((c) => c.id || c.tagName)).toEqual(['resource-header', 'resource-body', 'DIV']);
    } finally {
      harness.teardown();
    }
  });
});

const key = (win, target, k) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('Phase 2 -- review fixes', { timeout: 90_000 }, () => {
  it('Esc goes to the topmost dialog: Day grade closes first, the panel stays; a second Esc closes the panel', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { tile } = await openPanelFromTile(harness);
      const dayGradeBtn = [...doc.querySelectorAll('#pico-lesson-day .pico-day-btn')].find((b) => b.textContent === 'Day grade');
      dayGradeBtn.focus();
      dayGradeBtn.click();
      const dayGrade = doc.getElementById('day-grade-overlay');
      expect(dayGrade.style.display).not.toBe('none');
      // Focus moved into the Day grade dialog (the Desk leaves it behind otherwise).
      expect(dayGrade.contains(doc.activeElement)).toBe(true);

      key(win, doc.activeElement, 'Escape');
      expect(dayGrade.style.display).toBe('none');
      expect(doc.getElementById('resource-overlay').style.display).toBe('block');
      await harness.waitFor(() => doc.activeElement === dayGradeBtn, { message: 'focus did not come back to Day grade' });

      // Even with focus left inside the panel while Day grade is open, Pico passes the key through.
      dayGradeBtn.click();
      dayGradeBtn.focus();
      key(win, dayGradeBtn, 'Escape');
      expect(dayGrade.style.display).toBe('none');
      expect(doc.getElementById('resource-overlay').style.display).toBe('block');

      key(win, doc.activeElement, 'Escape');
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      await harness.waitFor(() => doc.activeElement === tile, { message: 'focus did not return to the tile' });
    } finally {
      harness.teardown();
    }
  });

  it('focus returns to the re-rendered tile for the same lesson after a Pico re-render', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { day, tile } = await openPanelFromTile(harness);
      win.PicoHome.render();   // e.g. an async grade refresh: every tile node is replaced
      const index = win.PicoHome.days().findIndex((d) => d.date.getTime() === day.date.getTime());
      const fresh = doc.querySelectorAll('#pico-tiles .tile')[index];
      expect(fresh).not.toBe(tile);
      expect(doc.contains(tile)).toBe(false);
      key(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => doc.activeElement === fresh, { message: 'focus did not reach the re-rendered tile' });
    } finally {
      harness.teardown();
    }
  });

  it('My Grade from the sign returns focus to the re-rendered sign grade box', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const gradeBox = doc.querySelector('#pico-sign .sign-grade');
      gradeBox.focus();
      gradeBox.click();
      await harness.waitFor(() => doc.getElementById('app-wallet-overlay').style.display === 'block');
      win.PicoHome.render();
      const fresh = doc.querySelector('#pico-sign .sign-grade');
      expect(fresh).not.toBe(gradeBox);
      doc.getElementById('pico-mygrade-close').click();
      await harness.waitFor(() => doc.activeElement === fresh, { message: 'focus did not reach the re-rendered grade box' });
    } finally {
      harness.teardown();
    }
  });

  // Teacher report 2026-10-07: hover is VISUAL ONLY. A hovered row takes the outline and the
  // selection, but focus (and so the browser's Enter) stays where the keyboard put it.
  it('hovering a row outlines it but never moves focus; Enter still activates the focused row', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await openPanelFromTile(harness);
      const rows = picoRows(doc);
      const a = rows.findIndex((row) => row.contains(doc.activeElement));
      const b = (a + 1) % rows.length;
      const focusedBefore = doc.activeElement;
      rows[b].dispatchEvent(new win.MouseEvent('mouseenter'));
      await new Promise((r) => setTimeout(r, 220));   // the hover dwell (160 ms)
      expect(rows[b].classList.contains('is-selected')).toBe(true);
      expect(rows[b].classList.contains('is-active')).toBe(true);
      expect(doc.activeElement).toBe(focusedBefore);
      expect(rows[b].contains(doc.activeElement)).toBe(false);
      // The browser's Enter activates the focused control: row A's, never the hovered row B's.
      const clicked = [];
      rows.forEach((row, i) => row.addEventListener('click', (e) => { clicked.push(i); e.preventDefault(); }));
      key(win, doc.activeElement, 'Enter');
      doc.activeElement.click();   // jsdom has no Enter activation; this is the browser's default action
      expect(clicked).toEqual([a]);

      // A secondary control inside the hovered row keeps focus (e.g. the AP Classroom fallback link).
      // The click above (recordLinkVisit) re-renders the panel; let it settle and re-read the rows.
      await new Promise((r) => setTimeout(r, 220));
      const withSecondary = picoRows(doc).find((row) => row.querySelectorAll('a').length > 1);
      if (withSecondary) {
        const secondary = withSecondary.querySelectorAll('a')[1];
        secondary.focus();
        withSecondary.dispatchEvent(new win.MouseEvent('mouseenter'));
        await new Promise((r) => setTimeout(r, 220));   // the hover dwell (160 ms)
        expect(secondary.isConnected).toBe(true);
        expect(doc.activeElement).toBe(secondary);
      }
    } finally {
      harness.teardown();
    }
  });

  it('never intercepts keys in a typing target (textarea inside the panel)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await openPanelFromTile(harness);
      const rows = picoRows(doc);
      const selectedBefore = rows.findIndex((row) => row.classList.contains('is-selected'));
      const textarea = doc.createElement('textarea');
      rows[0].appendChild(textarea);
      textarea.focus();
      const down = new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      textarea.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(textarea);
      expect(rows.findIndex((row) => row.classList.contains('is-selected'))).toBe(selectedBefore);
      // Hovering another row does not pull focus out of the textarea either.
      rows[1].dispatchEvent(new win.MouseEvent('mouseenter'));
      expect(doc.activeElement).toBe(textarea);
      const esc = new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      textarea.dispatchEvent(esc);
      expect(doc.getElementById('resource-overlay').style.display).toBe('block');
    } finally {
      harness.teardown();
    }
  });

  it('poll results: the panel steps aside for the board result screen and comes back with focus on the button', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await harness.waitFor(() => win._classroomBoardHandle && typeof win._classroomBoardHandle.showResultScreen === 'function',
        { timeoutMs: 3000, message: 'the classroom board did not mount' });
      // A fixture poll archived on the first lesson tile's day (the Desk's own _pollArchive).
      const { day } = firstLessonTile(win, doc);
      const iso = day.date.getFullYear() + '-' + String(day.date.getMonth() + 1).padStart(2, '0') + '-' + String(day.date.getDate()).padStart(2, '0');
      win.eval('_pollArchive[' + JSON.stringify(iso) + '] = [{ question: "Fixture poll?", options: ["A", "B"], tally: [3, 5] }];');
      const { tile } = await openPanelFromTile(harness);
      const pollBtn = doc.querySelector('#pico-lesson-day .pico-day-btn[data-poll]');
      expect(pollBtn, 'no poll button for a day with an archived poll').toBeTruthy();
      expect(pollBtn.textContent).toBe('Class poll results (1)');
      pollBtn.focus();
      pollBtn.click();

      // The result screen is showing on the board, and the panel is not covering it.
      const screen = doc.querySelector('#classroom-board-mount [data-classroom-result-screen]');
      expect(screen.style.transform).toBe('translateY(0)');
      expect(doc.querySelector('[data-classroom-result-question]').textContent).toBe('Fixture poll?');
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      expect(screen.contains(doc.activeElement)).toBe(true);   // focus on its close button
      expect(doc.activeElement).not.toBe(tile);

      // Dismiss it: the same lesson panel re-opens, focus back on the poll button.
      doc.querySelector('[data-classroom-result-close]').click();
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'block',
        { message: 'the panel did not re-open' });
      await harness.waitFor(() => doc.activeElement && doc.activeElement.matches('#pico-lesson-day .pico-day-btn[data-poll]'),
        { message: 'focus did not return to the poll button' });
      expect(doc.getElementById('pico-lesson-bar').textContent).toMatch(new RegExp(String(day.date.getDate()) + '$'));

      // The board's own 2 s auto-dismiss brings the panel back too.
      doc.activeElement.click();
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'block',
        { timeoutMs: 4000, message: 'the panel did not re-open after the auto-dismiss' });

      // And Esc still closes it back to the tile it was first opened from.
      key(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => doc.activeElement === tile || (doc.activeElement && doc.activeElement.matches('#pico-tiles .tile')),
        { message: 'focus did not return to the tile' });
    } finally {
      harness.teardown();
    }
  });

  // Opens the first lesson tile's panel with a fixture poll and presses its poll button.
  async function openPollResult(harness) {
    const { document: doc, window: win } = harness;
    await harness.waitFor(() => win._classroomBoardHandle && typeof win._classroomBoardHandle.showResultScreen === 'function',
      { timeoutMs: 3000, message: 'the classroom board did not mount' });
    const { day } = firstLessonTile(win, doc);
    const iso = day.date.getFullYear() + '-' + String(day.date.getMonth() + 1).padStart(2, '0') + '-' + String(day.date.getDate()).padStart(2, '0');
    win.eval('_pollArchive[' + JSON.stringify(iso) + '] = [{ question: "Fixture poll?", options: ["A", "B"], tally: [3, 5] }];');
    await openPanelFromTile(harness);
    doc.querySelector('#pico-lesson-day .pico-day-btn[data-poll]').click();
    const screen = doc.querySelector('#classroom-board-mount [data-classroom-result-screen]');
    expect(screen.style.transform).toBe('translateY(0)');
    expect(win.PicoHome.hasPollReturn()).toBe(true);
    return { day, screen };
  }

  it('poll results: opening another day before dismissal cancels the return (no flip back)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { day } = await openPollResult(harness);
      // Another lesson tile (a different day) while the result screen is still showing.
      const days = win.PicoHome.days();
      const other = days.findIndex((d) => d.kind === 'lesson' && d.date.getTime() !== day.date.getTime());
      expect(other, 'the week needs a second lesson day').toBeGreaterThanOrEqual(0);
      doc.querySelectorAll('#pico-tiles .tile')[other].click();
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'block'
        && doc.querySelector('#resource-body .pico-lesson-list'), { message: 'the second panel did not open' });
      expect(win.PicoHome.hasPollReturn()).toBe(false);
      const otherTitle = doc.getElementById('pico-lesson-bar').textContent;
      expect(otherTitle).toMatch(new RegExp(' ' + days[other].date.getDate() + '$'));
      // Dismiss the result screen: the second day's panel stays.
      doc.querySelector('[data-classroom-result-close]').click();
      await new Promise((r) => setTimeout(r, 80));
      expect(doc.getElementById('pico-lesson-bar').textContent).toBe(otherTitle);
      expect(win._lastResourcePanel.inf).toBe(days[other].inf);
      // Close it; nothing re-opens later either (the board's 2 s timer was already cleared).
      key(win, doc.activeElement, 'Escape');
      await new Promise((r) => setTimeout(r, 2300));
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });

  it('poll results: a nav button before dismissal cancels the return', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await openPollResult(harness);
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
      expect(win.PicoHome.hasPollReturn()).toBe(false);
      doc.querySelector('[data-classroom-result-close]').click();
      await new Promise((r) => setTimeout(r, 80));
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('poll results: the board being torn down cancels the return (observer disconnected, no re-open)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const { screen } = await openPollResult(harness);
      win._classroomBoardHandle.destroy();
      expect(doc.contains(screen)).toBe(false);
      await harness.waitFor(() => !win.PicoHome.hasPollReturn(), { message: 'the pending return was not cancelled' });
      await new Promise((r) => setTimeout(r, 2300));   // past the board's own auto-dismiss window
      expect(doc.getElementById('resource-overlay').style.display).toBe('none');
      expect(win.PicoHome.hasPollReturn()).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  // Teacher report 2026-10-07: a hovered row never takes focus (hover is visual only).
  it('a hovered row makes no focus call at all (keyboard moves still focus and scroll)', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      await openPanelFromTile(harness);
      const rows = picoRows(doc);
      const b = (rows.findIndex((row) => row.classList.contains('is-selected')) + 1) % rows.length;
      const control = rows[b].querySelector('a[href], button:not([disabled]), a, button');
      const calls = [];
      const original = control.focus;
      control.focus = function (options) { calls.push(options); return original.call(this, options); };
      rows[b].dispatchEvent(new win.MouseEvent('mouseenter'));
      await new Promise((r) => setTimeout(r, 220));   // the hover dwell (160 ms)
      expect(calls).toEqual([]);
      key(win, doc.activeElement, 'ArrowUp');
      control.focus = original;
      const backCalls = [];
      const a = rows[(b - 1 + rows.length) % rows.length].querySelector('a[href], button:not([disabled]), a, button');
      expect(doc.activeElement).toBe(a);
      const nativeFocus = win.HTMLElement.prototype.focus;
      a.focus = function (options) { backCalls.push(options); return nativeFocus.call(this, options); };
      key(win, doc.activeElement, 'ArrowDown');
      key(win, doc.activeElement, 'ArrowUp');
      expect(backCalls).toEqual([undefined]);
    } finally {
      harness.teardown();
    }
  });

  it('pins the Desk status wording the triangle reads (a wording change must fail here)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const desk = readFileSync(resolve(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');
    // The panel's own status strings, as the Desk writes them.
    expect(desk).toContain('&#10003; Completed</button>');
    expect(desk).toContain("'Flashcards ✓ perfected'");
    expect(desk).toContain("'Flashcards ✓ done — redo to improve'");
    expect(desk).toContain('&#10003; visited</span>');
    expect(desk).toContain('">Done</button>');
    expect(desk).toContain('class="worksheet-done-slot"');
    expect(desk).toContain('class="desk-quiz-done-slot"');

    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const row = (html) => { const d = doc.createElement('div'); d.innerHTML = html; return d; };
      const status = (html) => win.PicoHome.rowStatus(row(html));
      expect(status('<a>Quiz</a><span class="desk-quiz-done-slot"><button disabled>✓ Completed</button></span>')).toBe('done');
      expect(status('<a>Blooket Review</a><span class="desk-quiz-done-slot"><button>Flashcards ✓ perfected</button></span>')).toBe('done');
      expect(status('<a>Blooket Review</a><span class="desk-quiz-done-slot"><button>Flashcards ✓ done — redo to improve</button></span>')).toBe('done');
      expect(status('<a>Video 1</a> <span>✓ visited</span>')).toBe('done');
      expect(status('<a>Video 1</a>')).toBe('todo');
      expect(status('<a>Follow-Along Worksheet</a><span class="worksheet-done-slot"><button disabled>Done</button></span>')).toBe('todo');
      expect(status('<button>🤖 Tutor prompt — copy to clipboard</button>')).toBe(null);
    } finally {
      harness.teardown();
    }
  });
});

describe('Phase 2 -- My Grade', { timeout: 90_000 }, () => {
  async function ledgerText(harness) {
    const { document: doc, window: win } = harness;
    win.openWallet();
    const content = doc.getElementById('wallet-content');
    let last = '';
    await harness.waitFor(async () => {
      await new Promise((r) => setTimeout(r, 120));
      const now = norm(content.textContent);
      const stable = now && now === last;
      last = now;
      return stable;
    }, { timeoutMs: 6000, message: 'the ledger never settled' });
    return last;
  }

  it('renders the same ledger text with and without the flag, with the official grade on top', async () => {
    const off = await boot(false);
    let offText;
    try {
      offText = await ledgerText(off);
      expect(off.document.getElementById('app-wallet-overlay').outerHTML).not.toMatch(/pico/i);
    } finally {
      off.teardown();
    }

    const on = await boot(true);
    try {
      const doc = on.document;
      const myGrade = doc.querySelector('#pico-home .navbtn[data-nav="MY GRADE"]');
      myGrade.focus();
      myGrade.click();
      const onText = await ledgerText(on);
      expect(onText).toBe(offText);
      const overlay = doc.getElementById('app-wallet-overlay');
      expect(overlay.classList.contains('pico-mygrade')).toBe(true);
      expect(overlay.querySelector('.app-window').classList.contains('pico-frame')).toBe(true);
      // The head shows the sign's number, which is the Do Now pill's.
      const pill = doc.querySelector('#donow-grades .qpill:not(.qpill-missing) .qgrade').textContent;
      expect(doc.querySelector('#pico-grade-head .grade-num').textContent).toBe(pill);
      expect(doc.querySelector('#pico-sign .grade-num').textContent).toBe(pill);
      // The head sits above the Pico ledger (tests/pico-home-mygrade.test.js), then the Desk's
      // own content, all in one scroll area under the status strip.
      const win = overlay.querySelector('.app-window');
      expect(doc.getElementById('pico-grade-head').nextElementSibling).toBe(doc.getElementById('pico-ledger'));
      expect(doc.getElementById('pico-ledger').nextElementSibling).toBe(doc.getElementById('wallet-content'));
      expect(doc.getElementById('wallet-content').parentElement).toBe(doc.getElementById('pico-mygrade-body'));
      expect(win.contains(doc.getElementById('pico-mygrade-close'))).toBe(true);
      // ✕ closes through the Desk's own destroyWallet; focus returns to MY GRADE.
      doc.getElementById('pico-mygrade-close').click();
      expect(overlay.style.display).toBe('none');
      await on.waitFor(() => doc.activeElement === myGrade, { message: 'focus did not return to MY GRADE' });
    } finally {
      on.teardown();
    }
  });
});
