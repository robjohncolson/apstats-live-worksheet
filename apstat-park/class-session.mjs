// "Is a class in session right now?" from the teacher's weekly schedule (APSTAT_PARK_SOLO_DOOR_SPEC §3).
// The calculator room opens as the team room while a class meets and as the solo room otherwise.
const V = new URL(import.meta.url).search;

// Local time. The repo has no bell schedule; the teacher narrows this to the period's actual
// block when they give it. Do not invent per-period times.
export const SCHOOL_HOURS = { start: '07:30', end: '14:30' };

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

// True on a class day for the section, from SCHOOL_HOURS.start (inclusive) to .end (exclusive).
export function inSession(schedule, section, now = new Date()) {
  if (!schedule) return false;
  if (!classDaysFor(schedule, section).has(localDate(now))) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  return minute >= minutesOf(SCHOOL_HOURS.start) && minute < minutesOf(SCHOOL_HOURS.end);
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
