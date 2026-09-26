import { requireTeacher } from './teacher-auth.js';
import { quarterOfDate } from './grade-config.js';
import { todayInTz } from './lesson-grade.js';

export function fiveNumberSummary(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const median = (half) => {
    const middle = Math.floor(half.length / 2);
    return half.length % 2 ? half[middle] : (half[middle - 1] + half[middle]) / 2;
  };
  const middle = Math.floor(sorted.length / 2);
  // AP / TI-84 method: median of each half, excluding the overall odd median.
  const lower = sorted.length === 1 ? sorted : sorted.slice(0, middle);
  const upper = sorted.length === 1 ? sorted : sorted.slice(Math.ceil(sorted.length / 2));
  return {
    min: sorted[0], q1: median(lower), median: median(sorted),
    q3: median(upper), max: sorted[sorted.length - 1],
  };
}

function summarizeValues(values) {
  const n = values.length;
  if (n < 5) {
    return { n, values: [], fiveNumber: null, iqr: null, fences: null, outliers: [] };
  }
  const fiveNumber = fiveNumberSummary(values);
  const iqr = fiveNumber.q3 - fiveNumber.q1;
  const fences = { low: fiveNumber.q1 - 1.5 * iqr, high: fiveNumber.q3 + 1.5 * iqr };
  const outliers = values.filter(value => value < fences.low || value > fences.high);
  return { n, values, fiveNumber, iqr, fences, outliers };
}

// `section=all` merges these sections into one picture (teacher 2026-09-26: "how it ranks
// among ALL students, for more datapoints"). Any signed-in student may read it.
export const COURSE_SECTIONS = ['PeriodB', 'PeriodE'];

// Merge per-section snapshots: values pooled, the earliest zero date kept, zeros summed.
// A lesson contributes only from the sections where it is already counting.
export function mergeSnapshots(snapshots, sections) {
  const values = snapshots.flatMap(s => s.values || []).sort((a, b) => a - b);
  const first = snapshots[0] || {};
  const merged = { ok: true, section: 'all', sections, quarter: first.quarter, asOf: first.asOf, ...summarizeValues(values) };
  if (!snapshots.some(s => Array.isArray(s.assignments))) return merged;
  const byKey = new Map();
  for (const snapshot of snapshots) {
    for (const item of snapshot.assignments || []) {
      const have = byKey.get(item.key);
      if (!have) { byKey.set(item.key, { ...item, values: item.values.slice(), zeros: item.zeros }); continue; }
      have.values = have.values.concat(item.values);
      if (item.zeroDate < have.zeroDate) have.zeroDate = item.zeroDate;
      have.zeros = have.zeros == null || item.zeros == null ? null : have.zeros + item.zeros;
    }
  }
  merged.assignments = [...byKey.values()].map(item => {
    const pooled = item.values.slice().sort((a, b) => a - b);
    const summary = summarizeValues(pooled);
    return { ...item, ...summary, zeros: summary.n < 5 ? null : pooled.filter(v => v === 0).length };
  });
  return merged;
}

export function mountClassSnapshot(app, { db, verifyToken, computeClassGrades, config }) {
  // Memory belongs to this app instance; cache only anonymous payloads.
  const cache = new Map();
  const ttl = 5 * 60 * 1000;

  async function computeSnapshot(section, by) {
    if (section !== 'all') return computeSectionSnapshot(section, by);
    const parts = await Promise.all(COURSE_SECTIONS.map(s => computeSectionSnapshot(s, by)));
    return mergeSnapshots(parts, COURSE_SECTIONS);
  }

  async function computeSectionSnapshot(section, by) {
    const grades = await computeClassGrades({ section }, { requireComplete: true });
    if (!grades.ok) throw new Error('gradebook unavailable');
    const asOf = todayInTz('America/New_York');
    const quarter = quarterOfDate(asOf, config) || Object.keys(config.quarters)[0] || 'Q1';
    const values = grades.students
      .map(student => student.quarters?.[quarter]?.quarterGrade)
      .filter(Number.isFinite)
      .map(Math.round)
      .sort((a, b) => a - b);
    const snapshot = { ok: true, section, quarter, asOf, ...summarizeValues(values) };
    if (by !== 'assignment') return snapshot;

    const period = section.slice(-1);
    snapshot.assignments = [];
    // Each student's lessons include the full schedule, even untouched lessons.
    const lessons = grades.students[0]?.lessons || [];
    const seenTracks = new Set();
    for (const lesson of lessons) {
      const zeroDate = lesson.zeroDate?.[period];
      if (!zeroDate || zeroDate >= asOf) continue;

      const tracks = [];
      if (lesson.worksheetKey) tracks.push(['worksheet', 'Follow-Along']);
      if (lesson.quizTotal > 0) tracks.push(['quiz', 'Quiz']);
      if (lesson.hasBlooket && !lesson.blooketBonus) tracks.push(['blooket', 'Blooket']);
      for (const [track, label] of tracks) {
        const groupKey = track !== 'quiz' && lesson.worksheetKey
          ? `${lesson.unit}|${lesson.worksheetKey}:${track}`
          : `${lesson.lessonKey}:${track}`;
        if (seenTracks.has(groupKey)) continue;
        seenTracks.add(groupKey);
        // Assignment n counts every non-staff roster row, including missing scores;
        // top-level n counts only finite quarter grades. Due lessons span quarters.
        const values = grades.students.map(student => {
          const score = student.lessons?.find(item => item.lessonKey === lesson.lessonKey);
          const value = track === 'worksheet' ? score?.lessonGradeNoQuiz ?? score?.Cws
            : track === 'quiz' ? score?.Q : score?.blooket;
          return Number.isFinite(value) ? Math.round(value) : 0;
        }).sort((a, b) => a - b);
        const summary = summarizeValues(values);
        snapshot.assignments.push({
          key: `${lesson.lessonKey}:${track}`, lessonKey: lesson.lessonKey, track,
          title: `${lesson.lessonKey} ${label}`, zeroDate, ...summary,
          // Counts also disclose scores in small sections.
          zeros: summary.n < 5 ? null : values.filter(value => value === 0).length,
        });
      }
    }
    return snapshot;
  }

  app.get('/class/snapshot', async (req, res) => {
    const section = req.query.section;
    if (typeof section !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(section)) {
      return res.status(400).json({ ok: false, error: 'invalid-section' });
    }

    if (!await requireTeacher(req, db)) {
      try {
        const authorization = req.headers.authorization;
        const token = typeof authorization === 'string' && /^Bearer\s+/i.test(authorization)
          ? authorization.replace(/^Bearer\s+/i, '').trim() : null;
        const studentId = token ? verifyToken(token) : null;
        if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });
        const roster = await db.findByStudentId(studentId);
        if (roster?.error || (section !== 'all' && roster?.data?.section !== section)) {
          return res.status(401).json({ ok: false, error: 'forbidden' });
        }
      } catch (_) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
    }

    const by = req.query.by === 'assignment' ? 'assignment' : 'quarter';
    const cacheKey = `${section}:${by}`;
    try {
      if (process.env.NODE_ENV === 'test') return res.json(await computeSnapshot(section, by));
      const cached = cache.get(cacheKey);
      if (cached && Date.now() < cached.expires) return res.json(await cached.payload);

      // Share in-flight work too, so simultaneous refreshes compute once.
      const entry = { expires: Infinity, payload: computeSnapshot(section, by) };
      cache.set(cacheKey, entry);
      const payload = await entry.payload;
      entry.expires = Date.now() + ttl;
      return res.json(payload);
    } catch (_) {
      cache.delete(cacheKey);
      return res.status(503).json({ ok: false, error: 'gradebook unavailable' });
    }
  });
}
