// @vitest-environment node
/**
 * tests/pico-home-phase3.test.js
 *
 * Pico Desk Phase 3 (PICO_DESK_SPEC.md "Phase 3 — remaining windows"). Every other Desk window /
 * dialog opened from the Pico home sits inside a plain Pico frame: the dialog's content is
 * unchanged, the frame's title bar carries the dialog's own title, its ✕ calls the dialog's own
 * close, and Esc behaves exactly as it does with the flag off. With the flag off nothing is
 * framed and the dialogs' DOM is byte-identical to before pico-home.js ran.
 *
 * Runs on the real Desk (tests/journeys/harness.js), plus one jsdom check of the raw markup.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const REPO = resolve(__dirname, '..');
const DESK = readFileSync(resolve(REPO, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const PICO = readFileSync(resolve(REPO, 'pico-home.js'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';

// Every registry overlay, how the Desk opens it, and the title the dialog itself shows.
// `null` title = the dialog has no title of its own (an alert), so the bar is empty.
const CASES = [
  { overlay: 'dialog-overlay', open: (w) => w._menuAbout(), title: '' },
  { overlay: 'donow-bump-overlay', open: (w, d) => { d.getElementById('donow-bump-overlay').style.display = 'block'; }, title: '' },
  { overlay: 'signin-overlay', open: (w) => w.openSignInModal(), title: 'Sign In' },
  { overlay: 'signup-overlay', open: (w) => w._switchToSignUp(), title: 'Create your account' },
  { overlay: 'pwchange-overlay', open: (w) => w.openPwChangeModal(true), title: 'Change Your Password' },
  { overlay: 'namefinder-overlay', open: (w, d) => { w._nfEnsureOverlay(); d.getElementById('namefinder-overlay').style.display = 'flex'; }, title: '' },
  { overlay: 'day-grade-overlay', open: (w) => w.openDayGrade('Oct 5'), title: 'Day grade — Oct 5' },
  { overlay: 'grade-help-overlay', open: (w) => w.openGradeHelp(), title: 'How your grade works' },
  { overlay: 'my-gradebook-overlay', open: (w) => w.openMyGradebook(), title: 'My Gradebook' },
  { overlay: 'my-receipts-overlay', open: (w) => w.openMyReceipts(), title: 'My Receipts' },
  { overlay: 'bf-overlay', open: (w, d) => { d.getElementById('bf-header').textContent = 'Flashcards'; d.getElementById('bf-overlay').style.display = 'block'; }, title: 'Flashcards' },
  { overlay: 'student-dm-modal', open: (w) => w._openStudentDmModal(), title: 'Message your teacher' },
  { overlay: 'teacher-nudge-modal', open: (w) => w._openTeacherNudgeModal('beta_fox'), title: 'Message student' },
  { overlay: 'app-bulletin-overlay', open: (w) => w.openBulletin(), title: 'School Bulletin' },
  { overlay: 'app-snapshot-overlay', open: (w) => w.openSnapshot(), title: 'Class Snapshot' },
  { overlay: 'app-week-overlay', open: (w) => w.openApp('week'), title: 'This Week' },
  { overlay: 'app-ti84-overlay', open: (w) => w.openApp('ti84'), title: 'TI-84 Trainer' },
  { overlay: 'app-quiz-overlay', open: (w) => w.openApp('quiz'), title: 'AP Stats Quiz' },
  { overlay: 'app-formulas-overlay', open: (w) => w.openApp('formulas'), title: 'Formula Lab' },
  { overlay: 'app-dok-overlay', open: (w) => w.openApp('dok'), title: 'DOK Ladders' },
  { overlay: 'app-teachertools-overlay', open: (w) => w.openTeacherTools(), title: 'Teacher workspace' },
  // Legacy window: openNightlyReview() now opens the workspace; the overlay is still in the Desk, so
  // it is opened the way the Desk shows it.
  { overlay: 'app-nightlyreview-overlay', open: (w, d) => { d.getElementById('app-nightlyreview-overlay').style.display = 'block'; }, title: '🌙 Nightly Review' },
  { overlay: 'app-gradecheckin-overlay', open: (w) => w.openGradeCheckin(), title: '📈 Grade Check-in' },
  { overlay: 'app-progress-overlay', open: (w, d) => { d.getElementById('app-progress-overlay').style.display = 'block'; }, title: 'My Progress' },
  { overlay: 'override-gate-modal', open: (w, d) => { d.getElementById('override-gate-modal').style.display = 'block'; }, title: 'Override lesson gate' },
  { overlay: 'verify-qr-overlay', open: (w) => w.openVerifyQR(), title: String.fromCodePoint(128269) + ' Verify a Record' },
  { overlay: 'reconcile-qr-overlay', open: (w) => w.openReconcileQR(), title: String.fromCodePoint(128241) + ' Guest Reconcile' },
  { overlay: 'guest-pass-overlay', open: (w) => w.openGuestPass(), title: String.fromCodePoint(129701) + ' My Guest Pass' },
  { overlay: 'game-overlay', open: (w) => w.openGame(), title: 'Study Break — Square Mode' },
];

// Other openers that land in a registry overlay.
const EXTRA_OPENERS = [
  { name: 'lesson locked dialog', overlay: 'dialog-overlay', open: (w) => w._showLessonLockedDialog('2.4', '2.3', 'Oct 5') },
  { name: 'baseline info dialog', overlay: 'dialog-overlay', open: (w) => w._openBaselineInfo() },
  { name: 'teacher inbox', overlay: 'app-teachertools-overlay', open: (w) => w.openTeacherInbox() },
  { name: 'review (sign-in / nothing-due alert)', overlay: 'dialog-overlay', open: (w) => w.openReview() },
];

async function boot(flagOn) {
  const harness = await bootDesk({
    now: NOW,
    url: DESK_URL + (flagOn ? '?home=park' : ''),
    localStorage: { apstats_user_role: 'teacher' },   // so the teacher windows open too
  });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  // Sign-in records the student role; put the teacher role back so the teacher windows open.
  harness.window.localStorage.setItem('apstats_user_role', 'teacher');
  // The app windows' iframes would load real pages; only their window chrome is under test.
  harness.window.appLaunchUrl = () => 'about:blank';
  // Same for the teacher workspace's embedded dashboard page.
  harness.window._paintTeacherTools = (host) => { host.innerHTML = '<iframe title="workspace"></iframe>'; };
  // jsdom has no Web Audio; Study Break's sound engine only needs an object to hold.
  harness.window.AudioContext = function () { return { state: 'running', resume() {}, currentTime: 0 }; };
  closeEverything(harness.window, harness.document);
  return harness;
}

function overlayOpen(win, node) {
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    if (win.getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

// Close whatever the boot left open (the name finder from sign-in, a welcome alert).
function closeEverything(win, doc) {
  const calls = ['closeDialog', 'closeNameFinder', 'closeSignInModal', 'closeDoNowBump'];
  calls.forEach((name) => { try { if (typeof win[name] === 'function') win[name](); } catch (_) {} });
  for (const c of CASES) {
    const node = doc.getElementById(c.overlay);
    if (node && overlayOpen(win, node)) {
      try { closeCase(win, c); } catch (_) {}
    }
  }
}

function registryEntry(win, overlay) {
  return win.PicoHome.framed.find((e) => e.overlay === overlay);
}

function closeCase(win, c) {
  const entry = { 'dialog-overlay': ['closeDialog'], 'donow-bump-overlay': ['closeDoNowBump'], 'signin-overlay': ['closeSignInModal'],
    'signup-overlay': ['_switchToSignIn', 'closeSignInModal'], 'pwchange-overlay': ['closePwChangeModal'], 'namefinder-overlay': ['closeNameFinder'],
    'day-grade-overlay': ['closeDayGrade'], 'grade-help-overlay': ['closeGradeHelp'], 'my-gradebook-overlay': ['closeMyGradebook'],
    'my-receipts-overlay': ['closeMyReceipts'], 'bf-overlay': ['closeBlooketFlashcards'], 'student-dm-modal': ['_closeStudentDmModal'],
    'teacher-nudge-modal': ['_closeTeacherNudgeModal'], 'app-bulletin-overlay': ['destroyBulletin'], 'game-overlay': ['closeGame'],
    'app-teachertools-overlay': ['destroyTeacherTools'], 'app-nightlyreview-overlay': ['closeNightlyReview'], 'app-gradecheckin-overlay': ['closeGradeCheckin'],
    'app-progress-overlay': ['destroyProgress'], 'override-gate-modal': ['_hideOverrideGateModal'] }[c.overlay];
  if (entry) { entry.forEach((name) => win[name]()); return; }
  if (/-qr-overlay$|guest-pass-overlay/.test(c.overlay)) { win._escHide(c.overlay); return; }
  win.destroyApp(c.overlay.replace(/^app-/, '').replace(/-overlay$/, ''));
}

const esc = (win, doc) => {
  const target = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : doc;
  target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
};

describe('Phase 3 -- every registry window is framed (flag on)', { timeout: 180_000 }, () => {
  it('each opener: Pico frame around the unchanged content, the dialog\'s own title, ✕ = its own close', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      // The registry the reviewer reads is the one the code uses.
      expect(win.PicoHome.framed.map((e) => e.overlay).sort()).toEqual(CASES.map((c) => c.overlay).sort());
      for (const c of CASES) {
        c.open(win, doc);
        const overlay = doc.getElementById(c.overlay);
        expect(overlay, c.overlay).toBeTruthy();
        await harness.waitFor(() => overlayOpen(win, overlay) && overlay.querySelector('.pico-win'),
          { message: c.overlay + ' did not open framed' });
        const entry = registryEntry(win, c.overlay);
        const box = overlay.querySelector(entry.box);
        expect(box.closest('.pico-win'), c.overlay).toBe(box);
        const bar = box.querySelector(':scope > [data-pico-bar]');
        expect(bar.textContent, c.overlay).toBe(c.title);
        // The original System 7 title bar is still there (hidden parts, not removed).
        const oldBar = box.querySelector(':scope > .game-title-bar');
        if (oldBar) expect(oldBar.querySelector('.title-text').textContent.trim(), c.overlay).toBe(c.title);
        // ✕ calls the dialog's own close function (spied) with its own arguments.
        const [closeName, ...closeArgs] = entry.close;
        const original = win[closeName];
        const spy = vi.fn(function () { return original.apply(this, arguments); });
        win[closeName] = spy;
        try {
          // Study Break keeps its own close box as the ✕ (entry.ownClose); every other frame has one.
          const x = entry.ownClose ? box.querySelector(':scope > .game-title-bar .close-box') : box.querySelector(':scope > [data-pico-close]');
          x.click();
        } finally {
          win[closeName] = original;
        }
        expect(spy, c.overlay).toHaveBeenCalledTimes(1);
        if (!entry.ownClose) expect(spy.mock.calls[0], c.overlay).toEqual(closeArgs);
        await harness.waitFor(() => !overlayOpen(win, overlay), { message: c.overlay + ' did not close on ✕' });
        closeEverything(win, doc);
      }
    } finally {
      harness.teardown();
    }
  });

  it('other openers land in a framed dialog too (lesson locked, baseline, teacher inbox, review)', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      for (const o of EXTRA_OPENERS) {
        await o.open(win, doc);
        const overlay = doc.getElementById(o.overlay);
        await harness.waitFor(() => overlayOpen(win, overlay), { timeoutMs: 3000, message: o.name + ' did not open' });
        const entry = registryEntry(win, o.overlay);
        expect(overlay.querySelector(entry.box).closest('.pico-win'), o.name).toBeTruthy();
        closeEverything(win, doc);
      }
    } finally {
      harness.teardown();
    }
  });

  it('the forced change-password dialog (no dismiss) gets no ✕; the voluntary one does', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      win.openPwChangeModal(false);
      const box = doc.querySelector('#pwchange-overlay .dialog-box');
      await harness.waitFor(() => box.querySelector('[data-pico-bar]').textContent === 'Set Your Password');
      expect(box.querySelector('[data-pico-close]').hidden).toBe(true);
      win.closePwChangeModal();
      win.openPwChangeModal(true);
      await harness.waitFor(() => box.querySelector('[data-pico-bar]').textContent === 'Change Your Password');
      expect(box.querySelector('[data-pico-close]').hidden).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('✕ returns focus to the Pico opener (stable identity): OPTION → How grades work', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const option = doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]');
      option.click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'HOW GRADES WORK').click();
      const overlay = doc.getElementById('grade-help-overlay');
      await harness.waitFor(() => overlayOpen(win, overlay));
      win.PicoHome.render();   // the nav buttons survive, but prove the lookup is by identity anyway
      overlay.querySelector('[data-pico-close]').click();
      await harness.waitFor(() => doc.activeElement === doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]'),
        { message: 'focus did not return to OPTION' });
    } finally {
      harness.teardown();
    }
  });

  it("showDialog's 'crash' variant still plays its sound, inside the frame", async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const sfx = win.eval('MacSFX');
      const play = vi.spyOn(sfx, 'play');
      win.showDialog('&#128171;', 'Restart complete. You still have to study for the AP Exam.', '*Sigh* OK', 'crash');
      expect(play).toHaveBeenCalledWith('crash', 0.5);
      const overlay = doc.getElementById('dialog-overlay');
      expect(overlay.style.display).toBe('block');
      expect(overlay.querySelector('.dialog-box').classList.contains('pico-win')).toBe(true);
      expect(doc.getElementById('dialog-btn').textContent).toBe('*Sigh* OK');
      doc.getElementById('dialog-btn').click();
      expect(overlay.style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });

  it('the Study Break challenge alert stays outside any frame and shows as before', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const panel = doc.getElementById('doge-challenge-panel');
      win.DogePresence.incomingChallenge = { from: 'beta_fox', countdown: 25, timer: null };
      win.DogePresence.showChallengePanel();
      expect(panel.style.display).toBe('block');
      expect(panel.closest('.pico-win')).toBeNull();
      expect(panel.textContent).toContain('beta_fox wants to play');
      win.DogePresence.clearIncomingChallenge();
      expect(panel.style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });
});


describe('Phase 3 -- review fixes', { timeout: 180_000 }, () => {
  it('Study Break: the window box and the game canvas are exactly the same with the flag on and off', async () => {
    const measure = async (flagOn) => {
      const h = await boot(flagOn);
      try {
        const { window: win, document: doc } = h;
        win.openGame();
        const gw = doc.querySelector('#game-overlay .game-window');
        await h.waitFor(() => overlayOpen(win, doc.getElementById('game-overlay')));
        const cs = win.getComputedStyle(gw);
        const canvas = doc.getElementById('gameCanvas');
        const cc = win.getComputedStyle(canvas);
        const props = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'width', 'box-sizing'];
        return {
          window: props.map((p) => cs.getPropertyValue(p)),
          canvas: [canvas.width, canvas.height, cc.width, cc.height, cc.display, cc.margin],
          framed: gw.classList.contains('pico-win'),
        };
      } finally {
        h.teardown();
      }
    };
    const off = await measure(false);
    const on = await measure(true);
    expect(on.framed).toBe(true);
    expect(off.framed).toBe(false);
    expect(on.window).toEqual(off.window);
    expect(on.canvas).toEqual(off.canvas);
    // And the frame CSS never sets padding, border or width on the game window.
    const css = PICO.split('\n').filter((line) => /game-window/.test(line) && !/:not\(\.game-window\)/.test(line));
    css.forEach((line) => {
      if (/\.pico-frame\.game-window \{/.test(line)) expect(line).not.toMatch(/padding|border|width|margin/);
    });
  });

  it('focus after ✕ goes to the nav button that opened it: LESSONS → PRACTICE → TI-84 TRAINER', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const lessons = doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]');
      lessons.click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'PRACTICE').click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'TI-84 TRAINER').click();
      const overlay = doc.getElementById('app-ti84-overlay');
      await harness.waitFor(() => overlayOpen(win, overlay));
      expect(overlay.contains(doc.activeElement)).toBe(true);   // the Desk put focus in its iframe
      overlay.querySelector('[data-pico-close]').click();
      expect(overlayOpen(win, overlay)).toBe(false);
      expect(doc.activeElement).toBe(lessons);
    } finally {
      harness.teardown();
    }
  });

  it('focus after ✕ goes to OPTION for the voluntary Change password', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const option = doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]');
      option.click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'CHANGE PASSWORD').click();
      const overlay = doc.getElementById('pwchange-overlay');
      await harness.waitFor(() => overlayOpen(win, overlay));
      expect(overlay.contains(doc.activeElement)).toBe(true);   // the Desk focused the new-password field
      overlay.querySelector('[data-pico-close]').click();
      expect(overlayOpen(win, overlay)).toBe(false);
      expect(doc.activeElement).toBe(option);
    } finally {
      harness.teardown();
    }
  });

  it('a frame title never copies a close glyph from its source (flashcard header holding a ✕ button)', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      const header = doc.getElementById('bf-header');
      header.innerHTML = 'Flashcards — 1.13 <button type="button" aria-label="Close">✕</button>';
      doc.getElementById('bf-overlay').style.display = 'block';
      await harness.waitFor(() => doc.querySelector('#bf-overlay [data-pico-bar]').textContent === 'Flashcards — 1.13');
    } finally {
      harness.teardown();
    }
  });

  it('a Desk rebuild of a framed box gets its frame chrome back (Verify a Record rebuilds its card each open)', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      win.openVerifyQR();
      const card = doc.getElementById('verify-qr-card');
      await harness.waitFor(() => card.querySelector(':scope > [data-pico-bar]') && card.querySelector(':scope > [data-pico-close]'));
      win._escHide('verify-qr-overlay');
      win.openVerifyQR();   // card.innerHTML = … wipes the chrome
      await harness.waitFor(() => card.querySelector(':scope > [data-pico-bar]') && card.querySelector(':scope > [data-pico-close]'),
        { message: 'the frame chrome was not re-added' });
      expect(card.querySelectorAll(':scope > [data-pico-bar]')).toHaveLength(1);
      expect(card.querySelector('[data-pico-bar]').textContent).toBe(String.fromCodePoint(128269) + ' Verify a Record');
      card.querySelector('[data-pico-close]').click();
      expect(doc.getElementById('verify-qr-overlay').style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });

  it('the QR cards anchor their frame chrome to the card (position: relative, flag on only)', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      for (const [open, id] of [['openVerifyQR', 'verify-qr'], ['openReconcileQR', 'reconcile-qr'], ['openGuestPass', 'guest-pass']]) {
        win[open]();
        const card = doc.getElementById(id + '-card');
        await harness.waitFor(() => card.querySelector(':scope > [data-pico-close]'));
        expect(win.getComputedStyle(card).position, id).toBe('relative');
        // jsdom has no layout (offsetParent is always null there): the nearest positioned
        // ancestor of the ✕ is the card itself, so the card is its containing block.
        const x = card.querySelector(':scope > [data-pico-close]');
        expect(win.getComputedStyle(x).position).toBe('absolute');
        expect(x.parentElement).toBe(card);
        win._escHide(id + '-overlay');
      }
    } finally {
      harness.teardown();
    }
  });

  it('the Study Break ✕ is its own close box, inside the title strip, never over the canvas', async () => {
    const harness = await boot(true);
    try {
      const { window: win, document: doc } = harness;
      win.openGame();
      const gw = doc.querySelector('#game-overlay .game-window');
      await harness.waitFor(() => gw.classList.contains('pico-win') && overlayOpen(win, doc.getElementById('game-overlay')));
      // No frame ✕ of its own: the System 7 close box (its onclick kept) is the ✕.
      expect(gw.querySelector('[data-pico-close]')).toBeNull();
      const strip = gw.querySelector(':scope > .game-title-bar');
      const closeBox = strip.querySelector('.close-box');
      expect(closeBox.getAttribute('onclick')).toBe('closeGame()');
      expect(win.getComputedStyle(closeBox).display).not.toBe('none');
      // Geometry from the computed styles: the box fills the strip's height only, at its left
      // edge, 44px wide; the canvas lives in .game-content, below the strip.
      const cs = win.getComputedStyle(closeBox);
      expect([cs.position, cs.top, cs.left, cs.width, cs.height]).toEqual(['absolute', '0px', '0px', '44px', '100%']);
      expect(win.getComputedStyle(strip).height).toBe('19px');
      const canvas = doc.getElementById('gameCanvas');
      expect(canvas.closest('.game-content')).toBeTruthy();
      expect(strip.contains(canvas)).toBe(false);
      expect(strip.compareDocumentPosition(canvas.closest('.game-content')) & win.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // A mousedown on the canvas reaches the canvas (nothing of the frame sits on it).
      let reached = false;
      canvas.addEventListener('mousedown', () => { reached = true; }, { once: true });
      canvas.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 }));
      expect(reached).toBe(true);
      expect(win.getComputedStyle(gw).display).not.toBe('none');
      // And the close box still closes the game through the Desk's own handler.
      closeBox.click();
      await harness.waitFor(() => !overlayOpen(win, doc.getElementById('game-overlay')), { message: 'the close box did not close the game' });
      expect(PICO).not.toMatch(/game-window > \.win-close/);
    } finally {
      harness.teardown();
    }
  });

  it('every Desk overlay / modal / dialog container is either framed or listed as exempt', () => {
    const framed = new Set();
    const exempt = new Set();
    const src = PICO;
    for (const m of src.matchAll(/\{ overlay: '([^']+)'/g)) framed.add(m[1]);
    const ex = /var FRAME_EXEMPT = \[([^\]]*)\]/.exec(src)[1];
    for (const m of ex.matchAll(/'([^']+)'/g)) exempt.add(m[1]);
    const found = new Set();
    // ids ending -overlay / -modal (markup or created in script), the role="dialog" containers.
    for (const m of DESK.matchAll(/(?:id="|\.id = '|id=\\")([a-z0-9-]+-(?:overlay|modal))/g)) found.add(m[1]);
    for (const m of DESK.matchAll(/getElementById\('([a-z0-9-]+-(?:overlay|modal))'\)/g)) found.add(m[1]);
    found.add('avatar-pop');            // created with role="dialog" (the cat's popover)
    found.add('challenge-dialog');      // role="dialog" inside the Study Break window
    found.add('doge-challenge-panel');  // role="dialog" challenge alert
    // Retired / not real windows.
    found.delete('boot-overlay');       // removed at boot
    const missing = [...found].filter((id) => !framed.has(id) && !exempt.has(id));
    expect(missing).toEqual([]);
    expect(framed.has('verify-qr-overlay')).toBe(true);
    expect(exempt.has('avatar-pop')).toBe(true);
  });
});

describe('Phase 3 -- Esc behaves as before', { timeout: 180_000 }, () => {
  it('for each window, Esc leaves it in the same state with the flag on as with it off', async () => {
    const on = await boot(true);
    const off = await boot(false);
    try {
      for (const c of CASES) {
        const result = {};
        for (const [name, h] of [['on', on], ['off', off]]) {
          const { window: win, document: doc } = h;
          closeEverything(win, doc);
          // Same starting focus in both runs: the Desk's own Esc handlers depend on it (e.g. Day
          // grade ignores Esc while a text field has focus), and the flag-on run restores focus
          // after each close where the flag-off run leaves it in the last dialog.
          if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
          c.open(win, doc);
          const overlay = doc.getElementById(c.overlay);
          await h.waitFor(() => overlayOpen(win, overlay), { message: name + ': ' + c.overlay + ' did not open' });
          await new Promise((r) => setTimeout(r, 40));   // let the Desk move focus as it does
          esc(win, doc);
          await new Promise((r) => setTimeout(r, 40));
          result[name] = overlayOpen(win, overlay);
        }
        expect(result.on, c.overlay).toBe(result.off);
      }
    } finally {
      on.teardown();
      off.teardown();
    }
  });
});

describe('Phase 3 -- flag off', { timeout: 180_000 }, () => {
  it('the dialogs\' DOM is byte-identical before and after pico-home.js runs (raw markup)', () => {
    const dom = new JSDOM(DESK.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url: 'https://desk.test/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only',
    });
    const doc = dom.window.document;
    const ids = CASES.map((c) => c.overlay).filter((id) => doc.getElementById(id));
    expect(ids.length).toBeGreaterThan(22);
    const before = ids.map((id) => doc.getElementById(id).outerHTML);
    dom.window.eval(PICO);
    doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    expect(ids.map((id) => doc.getElementById(id).outerHTML)).toEqual(before);
    expect(doc.querySelectorAll('.pico-win')).toHaveLength(0);
  });

  it('on the real Desk, opening every window leaves no Pico frame anywhere', async () => {
    const harness = await boot(false);
    try {
      const { window: win, document: doc } = harness;
      for (const c of CASES) {
        c.open(win, doc);
        const overlay = doc.getElementById(c.overlay);
        await harness.waitFor(() => overlayOpen(win, overlay), { message: c.overlay + ' did not open' });
        expect(overlay.outerHTML, c.overlay).not.toMatch(/pico/i);
        closeEverything(win, doc);
      }
      expect(doc.querySelectorAll('.pico-win, [data-pico-bar], [data-pico-close]')).toHaveLength(0);
    } finally {
      harness.teardown();
    }
  });
});
