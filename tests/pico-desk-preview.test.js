/**
 * tests/pico-desk-preview.test.js
 *
 * Pico Desk Phase 0 sketch (PICO_DESK_SPEC.md): pico-desk-preview.html is static and
 * self-contained. Each preview state renders five day positions and a non-empty sign; the
 * lesson panel opens from a door and closes with Esc; the page makes no application-data
 * requests (no Railway host, no roster client, no fetch).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { DESK_ATLAS, DESK_ATLAS_SIZE } from '../apstat-park/assets/pico-desk-atlas.mjs';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'pico-desk-preview.html'), 'utf-8');

let dom;
let doc;
let fetchSpy;

function loadPage() {
  fetchSpy = vi.fn(() => Promise.reject(new Error('no network in the sketch')));
  dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://robjohncolson.github.io/apstats-live-worksheet/pico-desk-preview.html',
    beforeParse(window) { window.fetch = fetchSpy; },
  });
  doc = dom.window.document;
}

function pickRadio(name, value) {
  const input = doc.querySelector(`input[name="${name}"][value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

function pickState(value) {
  pickRadio('state', value);
}

// Layout A (doors) is no longer the default; its tests switch to it explicitly.
function loadDoorsPage() {
  loadPage();
  pickRadio('layout', 'doors');
}

function pressEscape() {
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('pico-desk-preview -- states', () => {
  beforeEach(loadDoorsPage);

  it.each(['caughtUp', 'behind', 'noClass'])('%s renders five day positions and a non-empty sign', (state) => {
    pickState(state);
    expect(doc.querySelectorAll('#days .day-btn')).toHaveLength(5);
    const sign = doc.getElementById('sign');
    expect(sign.querySelector('.sign-action').textContent.trim()).not.toBe('');
    expect(sign.querySelector('.grade-num').textContent).toMatch(/^\d+$/);   // grade always visible
  });

  it('Behind warns with the "!" block and says when, not what to', () => {
    pickState('behind');
    const sign = doc.getElementById('sign');
    expect(sign.classList.contains('is-warn')).toBe(true);
    expect(sign.querySelector('.sp-bang')).not.toBeNull();
    expect(sign.querySelector('.sign-when').textContent).toMatch(/drops on Thu Oct 8\b/);   // Fri Sep 25 + 13 days
  });

  it.each(['caughtUp', 'behind', 'noClass'])('%s sign shows no projected grade', (state) => {
    pickState(state);
    const sign = doc.getElementById('sign');
    const grade = sign.querySelector('.grade-num').textContent;
    const walker = doc.createTreeWalker(sign, 4 /* NodeFilter.SHOW_TEXT */);
    const parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.nodeValue);
    const text = parts.join(' ');
    expect(text).not.toMatch(/drops? to|fall(s)? to|would be|will be \d/i);
    // Allowed numbers: lesson numbers (2.4), dates (Thu Oct 8), the quarter (Q1), the official grade.
    const rest = text
      .replace(/\b\d+\.\d+\b/g, '')
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Sep|Oct) \d{1,2}\b/g, '')
      .replace(/\bQ\d\b/g, '')
      .split(grade).join('');
    expect(rest).not.toMatch(/\d/);
  });

  it('Behind shows no "continue here" triangle on the week strip', () => {
    pickState('behind');
    expect(doc.querySelectorAll('#days .sp-triangleBlue')).toHaveLength(0);
    pickState('caughtUp');
    expect(doc.querySelectorAll('#days .sp-triangleBlue')).toHaveLength(1);
  });

  it('Behind sign button opens the overdue 2.4 lesson panel with the "!" block and the zero date', () => {
    pickState('behind');
    const go = doc.querySelector('#sign .sign-go');
    expect(go.textContent).toMatch(/2\.4/);
    go.click();
    expect(doc.getElementById('backdrop').hidden).toBe(false);
    expect(doc.getElementById('panel-title').textContent).toMatch(/^2\.4 /);
    expect(doc.getElementById('panel-bar').textContent).toMatch(/FRI SEP 25/);
    const details = doc.getElementById('panel-details');
    expect(details.querySelector('.sp-bang')).not.toBeNull();
    expect(details.textContent).toMatch(/Zero lands\s*Thu Oct 8/);
    pressEscape();
    expect(doc.activeElement).toBe(go);
  });

  it('No class today puts the lying-down cat in today\'s position and keeps unfinished work on the sign', () => {
    pickState('noClass');
    const today = doc.querySelector('#days .is-today');
    expect(today.querySelector('.sp-lyingCat')).not.toBeNull();
    expect(today.textContent).toMatch(/NO CLASS/);
    expect(doc.querySelector('#sign .sign-context').textContent).toMatch(/unfinished/i);
  });

  it('every lesson door is open: no lock or closed door anywhere', () => {
    ['caughtUp', 'behind', 'noClass'].forEach((state) => {
      pickState(state);
      expect(doc.querySelectorAll('.sp-doorClosed')).toHaveLength(0);
      expect(doc.body.textContent).not.toMatch(/\block(ed)?\b|\u{1F512}/iu);   // no "lock" / "locked" / 🔒
    });
  });
});

describe('pico-desk-preview -- lesson panel', () => {
  beforeEach(loadDoorsPage);

  it('opens from a lesson door and closes with Esc, returning focus to the door', () => {
    const backdrop = doc.getElementById('backdrop');
    const door = doc.querySelectorAll('#days .day-btn')[2];
    expect(backdrop.hidden).toBe(true);

    door.click();
    expect(backdrop.hidden).toBe(false);
    expect(doc.getElementById('panel-title').textContent).toMatch(/2\.8/);
    expect(doc.querySelectorAll('#panel-actions .action').length).toBeGreaterThan(0);

    pressEscape();
    expect(backdrop.hidden).toBe(true);
    expect(doc.activeElement).toBe(door);
  });

  it('selection starts on the recommended action and moves with the arrow keys; the triangle stays', () => {
    doc.querySelectorAll('#days .day-btn')[2].click();
    const items = [...doc.querySelectorAll('#panel-actions li')];
    const recommended = items.findIndex((li) => li.querySelector('.sp-triangleBlue'));
    expect(recommended).toBeGreaterThanOrEqual(0);
    expect(items[recommended].querySelector('.action').classList.contains('is-selected')).toBe(true);

    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(items[recommended + 1].querySelector('.action').classList.contains('is-selected')).toBe(true);
    expect(items[recommended].querySelector('.sp-triangleBlue')).not.toBeNull();
  });
});

describe('pico-desk-preview -- lesson panel focus and 2x', () => {
  beforeEach(loadDoorsPage);

  it('Tab focus moves the selection and its details; the triangle stays', () => {
    doc.querySelectorAll('#days .day-btn')[2].click();   // Wed 2.8, recommended = FOLLOW-ALONG
    const items = [...doc.querySelectorAll('#panel-actions li')];
    const quiz = items.findIndex((li) => li.textContent.includes('QUIZ'));
    const recommended = items.findIndex((li) => li.querySelector('.sp-triangleBlue'));
    expect(recommended).not.toBe(quiz);

    items[quiz].querySelector('.action').focus();          // what Tab does
    expect(items[quiz].querySelector('.action').classList.contains('is-selected')).toBe(true);
    expect(doc.querySelectorAll('#panel-actions .is-selected')).toHaveLength(1);
    expect(doc.getElementById('panel-details').textContent).toMatch(/Not taken/);
    expect(items[recommended].querySelector('.sp-triangleBlue')).not.toBeNull();
    expect(items[quiz].querySelector('.sp-triangleBlue')).toBeNull();
  });

  it('a double-topic day shows a 2x row in the panel', () => {
    doc.querySelectorAll('#days .day-btn')[3].click();   // Thu 2.9
    expect(doc.getElementById('panel-details').textContent).toMatch(/2x\s*Double-topic day/);
  });
});

describe('pico-desk-preview -- vocabulary strip', () => {
  beforeEach(loadDoorsPage);

  it('sits in a collapsed <details> inside the preview controls', () => {
    const vocab = doc.getElementById('vocab');
    expect(vocab.tagName).toBe('DETAILS');
    expect(vocab.open).toBe(false);
    expect(vocab.closest('.preview-strip')).not.toBeNull();
  });

  it('lists every Day-vocabulary marker once, and the reserved marks in text only', () => {
    const list = doc.getElementById('vocab-list');
    const marker = (id) => list.querySelector(`[data-marker="${id}"]`);
    expect(marker('door').querySelector('.sp-doorOpen')).not.toBeNull();
    expect(marker('door-tick').querySelector('.sp-tick')).not.toBeNull();
    expect(marker('door-bang').querySelector('.sp-bang')).not.toBeNull();
    expect(marker('flag').querySelector('.sp-flag')).not.toBeNull();
    expect(marker('work-day').querySelector('.sp-pushBox')).not.toBeNull();
    expect(marker('work-day').textContent).toMatch(/WORK DAY/);
    expect(marker('no-class').querySelector('.sp-lyingCat')).not.toBeNull();
    expect(marker('no-class').querySelector('.sp-zzz')).not.toBeNull();
    expect(marker('no-class').textContent).toMatch(/NO CLASS/);
    expect(marker('signboard').querySelector('.sp-signboard')).not.toBeNull();
    expect(marker('today').querySelector('.sp-tileRaised')).not.toBeNull();
    expect(marker('continue').querySelector('.sp-triangleBlue')).not.toBeNull();
    expect(marker('crown').querySelector('.sp-crown')).not.toBeNull();
    expect(list.children).toHaveLength(10);
    list.querySelectorAll('.vocab-meaning').forEach((m) => expect(m.textContent.trim()).not.toBe(''));

    const reserved = doc.querySelector('.vocab-reserved').textContent;
    expect(reserved).toMatch(/closed door/);
    expect(reserved).toMatch(/NEW tag/);
    expect(doc.querySelectorAll('.sp-doorClosed, .sp-newTag')).toHaveLength(0);
  });
});

describe('pico-desk-preview -- layout B (stage select)', () => {
  beforeEach(() => {
    loadPage();
    const input = doc.querySelector('input[name="layout"][value="stages"]');
    input.checked = true;
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });

  const tileButtons = () => [...doc.querySelectorAll('#tiles .tile')];
  const selectedIndex = () => tileButtons().findIndex((b) => b.classList.contains('is-selected'));
  const triangleIndex = () => [...doc.querySelectorAll('#tiles li')].findIndex((li) => li.querySelector('.sp-triangleBlue'));

  it('the page opens in Stage select + Plain text (teacher 2026-10-05); both controls still switch', () => {
    const fresh = new JSDOM(html, { runScripts: 'dangerously' }).window.document;
    expect(fresh.body.classList.contains('layout-stages')).toBe(true);
    expect(fresh.body.classList.contains('lettering-plain')).toBe(true);
    expect(fresh.querySelector('input[name="layout"][value="stages"]').checked).toBe(true);
    expect(fresh.querySelector('input[name="lettering"][value="plain"]').checked).toBe(true);

    pickRadio('layout', 'doors');
    expect(doc.body.classList.contains('layout-stages')).toBe(false);
    pickRadio('lettering', 'glyphs');
    expect(doc.body.classList.contains('lettering-plain')).toBe(false);
  });

  it('the picker window holds the week item and no cat (teacher 2026-10-05)', () => {
    const item = doc.querySelector('.week-b .win .win-body .week-item');
    expect(item.querySelector('.sp-catBlue')).toBeNull();
    expect(item.querySelector('.carousel').textContent).toMatch(/WEEK OF OCT 5/);
  });

  it.each(['caughtUp', 'behind', 'noClass'])('%s renders five tiles with platform lines and no door', (state) => {
    pickState(state);
    expect(tileButtons()).toHaveLength(5);
    expect(doc.querySelectorAll('#tiles .sp-doorOpen, #tiles .sp-doorClosed')).toHaveLength(0);
    tileButtons().forEach((b) => expect(b.querySelector('.sp-platform, .sp-tileRaised')).not.toBeNull());
    expect(doc.querySelectorAll('#tiles .sp-tileRaised')).toHaveLength(1);   // today
  });

  it('the week picker uses the small outline arrows, not the giant ones', () => {
    const picker = doc.querySelector('.week-b');
    expect(picker.querySelector('.sp-triOutLeft')).not.toBeNull();
    expect(picker.querySelector('.sp-triOutRight')).not.toBeNull();
    expect(picker.querySelector('.sp-arrowOutline, .sp-arrowFilled')).toBeNull();
    expect(picker.textContent).toMatch(/WEEK OF OCT 5[\s\S]*\(6\/36\)/);
    // Inside the recovered window: top bar carries the unit, body carries the carousel.
    expect(picker.querySelector('.win .win-bar').textContent).toMatch(/UNIT 2/);
    expect(picker.querySelector('.win .win-body .carousel .sp-triOutLeft')).not.toBeNull();
    expect(picker.querySelector('.win .win-body #week-b-page').textContent).toBe('(6/36)');
  });

  it('Caught up has one "?" tile, for the lesson with no published content', () => {
    const marks = doc.querySelectorAll('#tiles .sp-question');
    expect(marks).toHaveLength(1);
    const tile = marks[0].closest('.tile');
    expect(tile.textContent).toMatch(/nothing published yet/);
    tile.click();
    expect(doc.getElementById('panel-message').textContent).toMatch(/Nothing is published/);
  });

  it('selection starts on continue-here and follows focus; the triangle stays put', () => {
    const start = selectedIndex();
    expect(start).toBe(triangleIndex());
    tileButtons()[4].focus();
    expect(selectedIndex()).toBe(4);
    expect(doc.querySelectorAll('#tiles .is-selected')).toHaveLength(1);
    expect(triangleIndex()).toBe(start);
  });

  it('arrow keys move the selection and focus', () => {
    tileButtons()[0].focus();
    tileButtons()[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(selectedIndex()).toBe(1);
    expect(doc.activeElement).toBe(tileButtons()[1]);
  });

  it('Enter on the focused tile opens its panel exactly once and cancels the browser\'s own Enter-click', () => {
    const tile = tileButtons()[1];
    tile.focus();
    let opens = 0;
    tile.addEventListener('click', () => { opens++; });
    const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    tile.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(opens).toBe(1);
    expect(doc.getElementById('backdrop').hidden).toBe(false);
    expect(doc.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(doc.getElementById('panel-title').textContent).toMatch(/^2\.7 /);
    pressEscape();
    expect(doc.activeElement).toBe(tile);
  });

  it('mouse hover moves the outline; the triangle stays put', () => {
    const triangle = triangleIndex();
    tileButtons()[0].dispatchEvent(new dom.window.MouseEvent('mouseenter'));
    expect(selectedIndex()).toBe(0);
    expect(doc.querySelectorAll('#tiles .is-selected')).toHaveLength(1);
    expect(triangleIndex()).toBe(triangle);
  });

  it('Behind (no continue-here) starts the outline on today, Wed 7', () => {
    pickState('behind');
    expect(tileButtons()[selectedIndex()].textContent).toMatch(/^WED 7/);
  });

  it('Behind has no continue-here triangle on the tiles', () => {
    pickState('behind');
    expect(triangleIndex()).toBe(-1);
  });

  it('the vocabulary strip shows the tile forms, with no door', () => {
    const list = doc.getElementById('vocab-list-b');
    ['tile', 'tile-tick', 'tile-bang', 'tile-question', 'flag', 'work-day', 'no-class', 'signboard', 'today', 'continue', 'crown']
      .forEach((id) => expect(list.querySelector(`[data-marker="${id}"]`)).not.toBeNull());
    expect(list.querySelectorAll('.sp-doorOpen')).toHaveLength(0);
    expect(list.querySelector('[data-marker="tile-question"] .sp-question')).not.toBeNull();
  });
});

describe('pico-desk-preview -- no application data', () => {
  it('names no Railway host, roster client, grade storage or network call', () => {
    expect(html).not.toMatch(/railway\.app|RAILWAY_SERVER_URL|railway_(client|config)/i);
    expect(html).not.toMatch(/roster[-_](client|config)|roster-production/i);
    expect(html).not.toMatch(/localStorage/);
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest|WebSocket|EventSource/);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('makes no fetch while rendering and switching states', () => {
    loadPage();
    pickState('behind');
    pickState('noClass');
    doc.querySelectorAll('#days .day-btn')[0].click();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('pico-desk-preview -- art', () => {
  it('the page\'s inline atlas matches apstat-park/assets/pico-desk-atlas.mjs', () => {
    loadPage();
    const page = dom.window.PicoDeskPreview;
    expect(page.atlasSize).toEqual(DESK_ATLAS_SIZE);
    const fromModule = Object.fromEntries(Object.entries(DESK_ATLAS).map(([name, r]) => [name, { x: r.x, y: r.y, w: r.w, h: r.h }]));
    expect(JSON.parse(JSON.stringify(page.atlas))).toEqual(fromModule);
  });

  it('glyph lettering also exists as real text', () => {
    loadPage();
    pickRadio('lettering', 'glyphs');
    expect(doc.body.classList.contains('lettering-plain')).toBe(false);
    const title = doc.querySelector('.topnav .lettering');
    expect(title.querySelector('.glyph-run').getAttribute('aria-hidden')).toBe('true');
    expect(title.querySelector('.lettering-text').textContent).toBe('APSTAT PARK');
  });
});
