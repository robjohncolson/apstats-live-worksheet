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

export function mountClassSnapshot(app, { db, verifyToken, computeClassGrades, config }) {
  // Memory belongs to this app instance; cache only anonymous payloads.
  const cache = new Map();
  const ttl = 5 * 60 * 1000;

  async function computeSnapshot(section) {
    const grades = await computeClassGrades({ section }, { requireComplete: true });
    if (!grades.ok) throw new Error('gradebook unavailable');
    const asOf = todayInTz('America/New_York');
    const quarter = quarterOfDate(asOf, config) || Object.keys(config.quarters)[0] || 'Q1';
    const values = grades.students
      .map(student => student.quarters?.[quarter]?.quarterGrade)
      .filter(Number.isFinite)
      .map(Math.round)
      .sort((a, b) => a - b);
    const n = values.length;
    if (n < 5) {
      return { ok: true, section, quarter, asOf, n, values: [], fiveNumber: null,
        iqr: null, fences: null, outliers: [] };
    }
    const fiveNumber = fiveNumberSummary(values);
    const iqr = fiveNumber.q3 - fiveNumber.q1;
    const fences = { low: fiveNumber.q1 - 1.5 * iqr, high: fiveNumber.q3 + 1.5 * iqr };
    const outliers = values.filter(value => value < fences.low || value > fences.high);
    return { ok: true, section, quarter, asOf, n, values, fiveNumber, iqr, fences, outliers };
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
        if (roster?.error || roster?.data?.section !== section) {
          return res.status(401).json({ ok: false, error: 'forbidden' });
        }
      } catch (_) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
    }

    try {
      if (process.env.NODE_ENV === 'test') return res.json(await computeSnapshot(section));
      const cached = cache.get(section);
      if (cached && Date.now() < cached.expires) return res.json(await cached.payload);

      // Share in-flight work too, so simultaneous refreshes compute once.
      const entry = { expires: Infinity, payload: computeSnapshot(section) };
      cache.set(section, entry);
      const payload = await entry.payload;
      entry.expires = Date.now() + ttl;
      return res.json(payload);
    } catch (_) {
      cache.delete(section);
      return res.status(503).json({ ok: false, error: 'gradebook unavailable' });
    }
  });
}
