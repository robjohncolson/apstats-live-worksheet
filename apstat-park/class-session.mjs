// "Is a class in session right now?" from the teacher's weekly schedule (APSTAT_PARK_SOLO_DOOR_SPEC §3).
// The calculator room opens as the team room while a class meets and as the solo room otherwise.
const V = new URL(import.meta.url).search;

// LEHS SY26-27 bell schedule: LEHS_SY2627_Schedule_and_Calendar.xlsx, "Bell Schedule" tab (transcribed
// from weekschedule.pdf). Local time, start inclusive, end exclusive. A weekday missing here is one the
// block does not meet. Wednesday E is the 90+30 block: the window covers the rotating lunch too.
export const BELL_SCHEDULE = {
  B: { Mon: ['08:55', '09:50'], Tue: ['09:55', '11:00'], Thu: ['09:55', '11:00'], Fri: ['08:55', '09:50'] },
  E: { Mon: ['13:15', '14:30'], Wed: ['11:16', '13:25'], Fri: ['13:15', '14:30'] },
};

// The whole school day (first bell to last). Used only when a lesson is dated on a weekday the block
// does not normally meet (a special-day schedule the bell table cannot know about).
export const SCHOOL_HOURS = { start: '07:45', end: '14:30' };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// PeriodB/B -> 'B'; PeriodE/E/PeriodX -> 'E' (parked and teacher accounts follow E, as the relay's
// eligibleLevels does). Anything else -> null (never in session).
function periodOf(section) {
  const periods = { PERIODB: 'B', PERIODE: 'E', PERIODX: 'E', B: 'B', E: 'E' };
  return periods[String(section ?? '').trim().toUpperCase()] || null;
}

function inBreak(date, breaks) {
  return breaks.some(range => range && date >= range.from && date <= range.to);
}

// The ISO dates the section meets: each lesson's date for the period, minus calendar.breaks.
// The real file keys the dates as lessons[topic].periods; lessons[].dates is read too.
export function classDaysFor(schedule, section) {
  const days = new Set();
  const period = periodOf(section);
  if (!period || !schedule?.lessons) return days;
  const breaks = schedule.calendar?.breaks || [];
  for (const lesson of Object.values(schedule.lessons)) {
    const date = (lesson?.periods || lesson?.dates || {})[period];
    if (typeof date !== 'string' || !ISO_DATE.test(date)) continue;
    if (inBreak(date, breaks)) continue;
    days.add(date);
  }
  return days;
}

// 'YYYY-MM-DD' from the LOCAL calendar date, never UTC.
function localDate(now) {
  const pad = value => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

function minutesOf(clock) {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

// The section's block on that weekday as { start, end }, else the whole school day.
export function blockFor(section, now) {
  const block = BELL_SCHEDULE[periodOf(section)]?.[WEEKDAYS[now.getDay()]];
  if (!block) return SCHOOL_HOURS;
  return { start: block[0], end: block[1] };
}

// True on a class day for the section, during its block (start inclusive, end exclusive).
export function inSession(schedule, section, now = new Date()) {
  if (!schedule) return false;
  if (!classDaysFor(schedule, section).has(localDate(now))) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  const block = blockFor(section, now);
  return minute >= minutesOf(block.start) && minute < minutesOf(block.end);
}

// data/lesson-schedule.json beside the park, with the room's cache-bust query. null on any failure.
export async function loadSchedule(fetchFn) {
  try {
    const response = await fetchFn(new URL('../data/lesson-schedule.json', import.meta.url) + V);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
