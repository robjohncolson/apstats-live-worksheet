// In session = the teacher's weekly schedule (APSTAT_PARK_SOLO_DOOR_SPEC §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BELL_SCHEDULE, SCHOOL_HOURS, blockFor, classDaysFor, inSession, loadSchedule } from './class-session.mjs';

// Fri 2026-10-16 B+E, Mon 2026-10-19 B only, Tue 2026-10-20 E only, Wed 2026-11-11 is a break.
const SCHEDULE = {
  calendar: { breaks: [{ from: '2026-11-11', to: '2026-11-11' }] },
  lessons: {
    '2.1': { periods: { B: '2026-10-16', E: '2026-10-16' } },
    '2.2': { periods: { B: '2026-10-19', E: '2026-10-20' } },
    '2.3': { periods: { B: '2026-11-11', E: null } },
    // The spec's lessons[].dates shape is read too.
    '2.4': { dates: { B: '2026-10-22' } },
  },
};
const at = (date, clock) => new Date(date + 'T' + clock + ':00');   // local time

test('the bell schedule is the LEHS SY26-27 workbook: B and E blocks per weekday', () => {
  assert.deepEqual(BELL_SCHEDULE.B, { Mon: ['08:55', '09:50'], Tue: ['09:55', '11:00'], Thu: ['09:55', '11:00'], Fri: ['08:55', '09:50'] });
  assert.deepEqual(BELL_SCHEDULE.E, { Mon: ['13:15', '14:30'], Wed: ['11:16', '13:25'], Fri: ['13:15', '14:30'] });
  assert.deepEqual(SCHOOL_HOURS, { start: '07:45', end: '14:30' }, 'first bell to last: the fallback for an off-pattern day');
});

test('blockFor: the weekday block, else the whole school day', () => {
  assert.deepEqual(blockFor('PeriodB', at('2026-10-19', '12:00')), { start: '08:55', end: '09:50' }, 'Monday B');
  assert.deepEqual(blockFor('E', at('2026-10-21', '12:00')), { start: '11:16', end: '13:25' }, 'Wednesday E (90+30)');
  assert.deepEqual(blockFor('B', at('2026-10-21', '12:00')), SCHOOL_HOURS, 'B does not meet Wednesdays');
  assert.deepEqual(blockFor('PeriodZ', at('2026-10-19', '12:00')), SCHOOL_HOURS);
});

test('class days: B and E differ, breaks are excluded, both date shapes are read', () => {
  assert.deepEqual([...classDaysFor(SCHEDULE, 'B')].sort(), ['2026-10-16', '2026-10-19', '2026-10-22']);
  assert.deepEqual([...classDaysFor(SCHEDULE, 'E')].sort(), ['2026-10-16', '2026-10-20']);
});

test('sections normalise like the relay: PeriodB/B -> B, PeriodE/E/PeriodX -> E, unknown -> none', () => {
  assert.deepEqual(classDaysFor(SCHEDULE, 'PeriodB'), classDaysFor(SCHEDULE, 'B'));
  assert.deepEqual(classDaysFor(SCHEDULE, 'periode'), classDaysFor(SCHEDULE, 'E'));
  assert.deepEqual(classDaysFor(SCHEDULE, 'PeriodX'), classDaysFor(SCHEDULE, 'E'));
  assert.equal(classDaysFor(SCHEDULE, 'PeriodZ').size, 0);
  assert.equal(classDaysFor(SCHEDULE, null).size, 0);
  assert.equal(inSession(SCHEDULE, 'PeriodZ', at('2026-10-16', '10:00')), false);
  assert.equal(inSession(null, 'B', at('2026-10-16', '10:00')), false, 'no schedule: never in session');
});

test('inSession boundaries on a Monday B block: 08:54 no, 08:55 yes, 09:49 yes, 09:50 no', () => {
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-19', '08:54')), false);
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-19', '08:55')), true);
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-19', '09:49')), true);
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-19', '09:50')), false);
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-19', '13:30')), false, 'the afternoon E block is not B');
});

test('a lesson dated on a weekday the block does not meet falls back to the school day', () => {
  // Tuesday 2026-10-20 is an E lesson day in the fixture; E has no Tuesday bell block.
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-20', '07:44')), false);
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-20', '07:45')), true);
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-20', '14:29')), true);
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-20', '14:30')), false);
});

test('a meeting day vs another section\'s day, a weekend and a break day', () => {
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-19', '10:00')), false, 'Monday is B only here');
  assert.equal(inSession(SCHEDULE, 'E', at('2026-10-20', '10:00')), true);
  assert.equal(inSession(SCHEDULE, 'B', at('2026-10-18', '10:00')), false, 'Sunday');
  assert.equal(inSession(SCHEDULE, 'B', at('2026-11-11', '10:00')), false, 'a break day, even with a lesson dated in it');
});

test('the date is the LOCAL calendar date, never UTC', () => {
  // 23:30 local on a non-class day is never the next (class) day, whatever the UTC date is.
  const late = at('2026-10-18', '23:30');
  assert.equal(inSession(SCHEDULE, 'B', late), false);
  // Local parts decide: a Date built from local parts on a class day counts in hours.
  const local = new Date(2026, 9, 19, 9, 0);
  assert.equal(inSession(SCHEDULE, 'B', local), true);
});

test('the real schedule has class days for both sections', () => {
  const real = JSON.parse(fs.readFileSync(new URL('../data/lesson-schedule.json', import.meta.url), 'utf8'));
  assert.ok(classDaysFor(real, 'PeriodB').size > 20);
  assert.ok(classDaysFor(real, 'PeriodE').size > 20);
});

test('loadSchedule: the file beside the park, null on failure', async () => {
  const urls = [];
  const data = await loadSchedule(async url => { urls.push(url); return { ok: true, json: async () => SCHEDULE }; });
  assert.deepEqual(data, SCHEDULE);
  assert.match(urls[0], /\/data\/lesson-schedule\.json$/);
  assert.equal(await loadSchedule(async () => ({ ok: false, json: async () => ({}) })), null, '404');
  assert.equal(await loadSchedule(async () => { throw new Error('offline'); }), null, 'offline');
});
