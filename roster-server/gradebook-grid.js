// gradebook-grid.js — derive the in-app "1:1 Schoology gradebook" grid from a
// computeGrade() result (Gradebook in-app rep). Pure functions, no I/O.
//
// Surfaced ADDITIVELY on /grade (student self-view) and /class/grades (teacher
// class grid). Clients just render — no grade math lives in the HTML.
//
// Per quarter the grid carries TWO totals, side by side:
//   - schoologyTotal: the cells blended by CATEGORY WEIGHT (how Schoology itself
//     computes the grade once these component cells are pushed).
//   - v3Total:        quarters[qk].quarterGrade — the app's two-track v3 model.
// They can differ; showing both is the point (reconciliation).
//
// Columns mirror the fine-grained Schoology push EXACTLY — Follow-Along / Quiz /
// Blooket per lesson + Progress Check + Poster per unit — derived from the SAME
// engine signals the Schoology producer fills (lesson.quizTotal, lesson.hasBlooket),
// so the in-app grid and the Schoology gradebook never disagree on which columns
// exist. (This is also why the Python generator's quiz-presence should be sourced
// from quizTotal, not roadmap urls.quiz — same single signal.)

// Schoology category weights — the teacher's real gradesetup values, deliberately
// chosen to REPLICATE the v3 grade engine's weighting linearly:
//   Progress Check 50%  +  Work 50% (Lesson 15 / Quizzes 15 / Posters 15 / Blooket 5).
// The Work split 15:15:15:5 == 3:3:3:1 == V3_WORK_WEIGHTS {lessons .30, quizzes .30,
// posters .30, blooket .10}. So schoologyTotal is a linear stand-in for the v3
// model; the only thing it can't express is v3's max/mean conditional (40% floors /
// 70% ceilings) — which is exactly the divergence the side-by-side v3Total reveals.
// schoologyWeightedTotal renormalizes over PRESENT categories (Posters has no data
// source yet, so it's simply absent from today's blend).
export const SCHOOLOGY_CATEGORY_WEIGHTS = {
  Lesson: 15,
  Quizzes: 15,
  Blooket: 5,
  'Progress Check': 50,
  Posters: 15,
};

const KIND_CATEGORY = {
  followalong: 'Lesson',
  quiz: 'Quizzes',
  blooket: 'Blooket',
  pc: 'Progress Check',
  poster: 'Posters',
};

// Reading order within a unit: lesson components first (FA, Quiz, Blooket),
// then the unit-level PC + Poster.
const KIND_RANK = { followalong: 0, quiz: 1, blooket: 2, pc: 8, poster: 9 };

function round1(x) {
  return x == null ? null : Math.round(x * 10) / 10;
}

function groupLabel(unit, worksheetKey) {
  return `${unit}.${worksheetKey}`;
}

// '1.10' sorts AFTER '1.9' (numeric). PC/Poster columns (topicKeys [])
// sort after the unit's lessons via a large synthetic topic number.
function topicNum(topicKey) {
  const m = /^\d+\.(\d+)/.exec(String(topicKey || ''));
  return m ? Number(m[1]) : 9999;
}

// ── Column generator (schedule-driven; identical for every student) ────────────
//
// gradeObj: a computeGrade() result ({ lessons, units, quarters, ... }).
// quarterKey: 'Q1'..'Q4'. Columns cover the quarter's unit band.
export function buildGradebookColumns(gradeObj, quarterKey) {
  const quarter = gradeObj && gradeObj.quarters && gradeObj.quarters[quarterKey];
  const band = quarter && Array.isArray(quarter.units) ? quarter.units : [];
  const bandSet = new Set(band);
  const lessons = Array.isArray(gradeObj && gradeObj.lessons) ? gradeObj.lessons : [];

  // Group lessons by unit.worksheetKey so a combined worksheet yields ONE
  // Follow-Along / Blooket column (quizzes stay per-topic).
  const groups = new Map();
  for (const L of lessons) {
    if (!L || !bandSet.has(L.unit) || L.worksheetKey == null) continue;
    const label = groupLabel(L.unit, L.worksheetKey);
    let g = groups.get(label);
    if (!g) { g = { unit: L.unit, worksheetKey: L.worksheetKey, topics: [] }; groups.set(label, g); }
    g.topics.push(L);
  }

  const cols = [];
  for (const [label, g] of groups) {
    const topicKeys = g.topics.map((t) => t.lessonKey);
    cols.push({ key: `FA:${label}`, kind: 'followalong', category: 'Lesson',
      title: `${label} Follow-Along`, unit: g.unit, topicKeys });
    for (const t of g.topics) {
      if ((t.quizTotal || 0) > 0) {
        cols.push({ key: `QUIZ:${t.lessonKey}`, kind: 'quiz', category: 'Quizzes',
          title: `${t.lessonKey} Quiz`, unit: g.unit, topicKeys: [t.lessonKey] });
      }
    }
    if (g.topics.some((t) => t.hasBlooket)) {
      cols.push({ key: `BL:${label}`, kind: 'blooket', category: 'Blooket',
        title: `${label} Blooket`, unit: g.unit, topicKeys });
    }
  }

  // Per-unit Progress Check + Poster columns.
  for (const n of band) {
    cols.push({ key: `PC:U${n}`, kind: 'pc', category: 'Progress Check',
      title: `Unit ${n} Progress Check`, unit: n, topicKeys: [] });
    cols.push({ key: `POSTER:U${n}`, kind: 'poster', category: 'Posters',
      title: `Unit ${n} Poster`, unit: n, topicKeys: [] });
  }

  cols.sort((a, b) => (
    a.unit - b.unit ||
    topicNum(a.topicKeys[0]) - topicNum(b.topicKeys[0]) ||
    (KIND_RANK[a.kind] - KIND_RANK[b.kind])
  ));
  return cols;
}

// ── One cell's value for a student ─────────────────────────────────────────────
function cellValue(col, lessonsByKey, units) {
  if (col.kind === 'pc') {
    const u = units && units[`U${col.unit}`];
    return u && u.pcRawPct != null ? u.pcRawPct : null;
  }
  if (col.kind === 'poster') {
    return null; // no Poster data source yet (track is future)
  }
  if (col.kind === 'quiz') {
    const L = lessonsByKey[col.topicKeys[0]];
    return L && L.Q != null ? L.Q : null;
  }
  // followalong (Cws) / blooket — combined constituents share the same value,
  // so take the first non-null across the group's topics.
  const field = col.kind === 'blooket' ? 'blooket' : 'Cws';
  for (const tk of col.topicKeys) {
    const L = lessonsByKey[tk];
    if (L && L[field] != null) return L[field];
  }
  return null;
}

// ── One student's row for a set of columns ─────────────────────────────────────
export function buildGradebookRow(gradeObj, columns, weights = SCHOOLOGY_CATEGORY_WEIGHTS) {
  const lessonsByKey = {};
  for (const L of (Array.isArray(gradeObj && gradeObj.lessons) ? gradeObj.lessons : [])) {
    if (L && L.lessonKey != null) lessonsByKey[L.lessonKey] = L;
  }
  const units = (gradeObj && gradeObj.units) || {};

  const cells = {};
  const catVals = {};
  for (const col of columns) {
    const v = cellValue(col, lessonsByKey, units);
    cells[col.key] = v;
    if (v != null) (catVals[col.category] || (catVals[col.category] = [])).push(v);
  }

  const categoryAverages = {};
  for (const cat of Object.keys(catVals)) {
    const arr = catVals[cat];
    categoryAverages[cat] = round1(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  return {
    cells,
    categoryAverages,
    schoologyTotal: schoologyWeightedTotal(categoryAverages, weights),
  };
}

// ── Schoology category-weighted blend (renormalized over PRESENT categories) ────
export function schoologyWeightedTotal(categoryAverages, weights = SCHOOLOGY_CATEGORY_WEIGHTS) {
  let num = 0, den = 0;
  for (const cat of Object.keys(weights)) {
    const v = categoryAverages ? categoryAverages[cat] : null;
    if (v == null) continue;
    num += weights[cat] * v;
    den += weights[cat];
  }
  return den > 0 ? round1(num / den) : null;
}

// ── Full per-student gradebook (all quarters) — for /grade + /class/grades ──────
export function buildGradebook(gradeObj, { weights = SCHOOLOGY_CATEGORY_WEIGHTS } = {}) {
  const quartersOut = {};
  const quarterKeys = Object.keys((gradeObj && gradeObj.quarters) || {});
  for (const qk of quarterKeys) {
    const columns = buildGradebookColumns(gradeObj, qk);
    const row = buildGradebookRow(gradeObj, columns, weights);
    quartersOut[qk] = {
      columns,
      cells: row.cells,
      categoryAverages: row.categoryAverages,
      schoologyTotal: row.schoologyTotal,
      v3Total: gradeObj.quarters[qk].quarterGrade != null ? gradeObj.quarters[qk].quarterGrade : null,
    };
  }
  return { weights, quarters: quartersOut };
}
