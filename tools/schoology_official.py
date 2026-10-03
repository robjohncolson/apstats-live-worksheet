"""Official quarter grade -> Schoology marking-period override (OFFICIAL_GRADE_SYNC_SPEC.md).

The teacher's rule (2026-10-01/02), per student, for the current marking period:

    work   = Schoology's own calculated grade (work categories only)
    line   = work + banked bonus-sheet points + early-finish bonus
    base   = max(work, PC)  if line >= 40 and a Progress Check score is on file
           = work           otherwise
    official = min(100, base + early-finish bonus), one decimal

Phase 1: DRY RUN by default -- prints the table, writes nothing.
  python tools/schoology_official.py --section PeriodB
  python tools/schoology_official.py --section PeriodB --apply     # writes the overrides

Students with no Schoology row are kept in a pending log (tools/.official-grade-pending.json)
so their grade can be written once they are added to the course.
The roster secret comes from ROSTER_TEACHER_SECRET or roster-server/.env, never the CLI.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
ROSTER_BASE = "https://roster-production-12c1.up.railway.app"
PENDING_PATH = os.path.join(SCRIPT_DIR, ".official-grade-pending.json")

GRADE_FLOOR = 40.0
# Schoology "calculate by percent" category weights (both SY26-27 sections).
WORK_WEIGHTS = {"Lesson": 15, "Quizzes": 15, "Posters": 15, "Blooket": 5}


# --------------------------------------------------------------------------- #
# The rule (pure)                                                              #
# --------------------------------------------------------------------------- #

def official_grade(work, pc, banked_bonus=0, early_bonus=0) -> dict | None:
    """Apply the teacher's rule. Returns None when there is no work grade yet."""
    if work is None:
        return None
    banked = banked_bonus or 0
    early = early_bonus or 0
    line = work + banked + early
    pc_counts = pc is not None and line >= GRADE_FLOOR
    base = max(work, pc) if pc_counts else work
    official = round(min(100.0, base + early), 1)
    if pc_counts and pc > work:
        rule = "PC"
    elif pc is not None and not pc_counts:
        rule = "work (under 40)"
    else:
        rule = "work"
    return {"official": official, "base": round(base, 2), "line": round(line, 2), "rule": rule}


def column_category(title: str) -> str | None:
    """Schoology category of one of our synced columns, from its title."""
    if title.endswith("Follow-Along"):
        return "Lesson"
    if title.endswith("Quiz"):
        return "Quizzes"
    if title.endswith("Blooket"):
        return "Blooket"
    if "Poster" in title:
        return "Posters"
    if "Progress Check" in title:
        return "Progress Check"
    return None


def work_from_cells(cells: dict) -> float | None:
    """Schoology's category math over the work categories only (Progress Check left out).

    cells: {column title: score or None}. Each category = mean of its graded cells;
    categories are weighted and renormalised over the ones that have grades.
    """
    by_cat: dict[str, list[float]] = {}
    for title, value in cells.items():
        cat = column_category(title)
        if cat in WORK_WEIGHTS and value is not None:
            by_cat.setdefault(cat, []).append(float(value))
    weight_sum = sum(WORK_WEIGHTS[c] for c in by_cat)
    if not weight_sum:
        return None
    total = sum(WORK_WEIGHTS[c] * (sum(v) / len(v)) for c, v in by_cat.items())
    return round(total / weight_sum, 2)


def has_pc_column(cells: dict) -> bool:
    return any(column_category(t) == "Progress Check" for t in cells)


def work_grade(calc, cells: dict):
    """Schoology's Calc. is the work grade until a Progress Check column exists (it then counts PC at 50%)."""
    if has_pc_column(cells):
        return work_from_cells(cells)
    return calc


def pc_for_quarter(student: dict, quarter: str):
    """Mean Progress Check % over the quarter's PC units that have a score on file."""
    q = (student.get("quarters") or {}).get(quarter) or {}
    units = q.get("pcUnits") or []
    scores = []
    for u in units:
        raw = ((student.get("units") or {}).get("U%s" % u) or {}).get("pcRawPct")
        if isinstance(raw, (int, float)):
            scores.append(float(raw))
    return round(sum(scores) / len(scores), 1) if scores else None


# --------------------------------------------------------------------------- #
# Roster server                                                                #
# --------------------------------------------------------------------------- #

def roster_secret() -> str:
    """roster-server/.env first: it holds the current (rotated) secret. The ledger route
    rejects the older value still set in the Windows user environment (401, 2026-10-02)."""
    env_path = os.path.join(REPO_ROOT, "roster-server", ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            m = re.search(r"^ROSTER_TEACHER_SECRET\s*=\s*(.+?)\s*$", fh.read(), re.M)
        if m:
            return m.group(1).strip("'\"")
    secret = os.environ.get("ROSTER_TEACHER_SECRET")
    if not secret:
        raise SystemExit("ROSTER_TEACHER_SECRET not found")
    return secret


def roster_get(path: str, secret: str):
    req = Request(ROSTER_BASE + path, headers={"x-teacher-secret": secret})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_official_grades(quarter: str, items: list[dict], secret: str) -> str:
    """Publish the official grades to roster-server for the Desk (OFFICIAL_GRADE_SYNC_SPEC.md §4.3).
    Returns a one-line status; a missing table (503, migration 0038) never fails the night."""
    grades = []
    for it in items:
        res = it.get("result")
        if not res or not it.get("studentId"):
            continue
        grades.append({"studentId": it["studentId"], "official": res["official"], "work": it.get("work"),
                       "pc": it.get("pc"), "base": res["base"], "line": res["line"],
                       "earlyBonus": it.get("early"), "bankedBonus": it.get("banked"), "rule": res["rule"]})
    if not grades:
        return "nothing to publish"
    body = json.dumps({"quarter": quarter, "asOf": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "grades": grades})
    req = Request(ROSTER_BASE + "/class/official-grades", data=body.encode("utf-8"), method="POST",
                  headers={"x-teacher-secret": secret, "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=60) as resp:
            doc = json.loads(resp.read().decode("utf-8"))
        return "published %s official grades to the Desk" % doc.get("saved")
    except HTTPError as err:
        if err.code == 503:
            return "Desk publish skipped: run roster-server migration 0038 first"
        if err.code == 404:
            return "Desk publish skipped: roster-server not deployed with /class/official-grades yet"
        return "Desk publish FAILED: HTTP %s" % err.code


def banked_bonus_points(student_id: str, quarter: str, secret: str) -> float:
    """Banked bonus-sheet points (E 5 / P 3 / I 1) for the quarter, not yet applied."""
    doc = roster_get("/ledger/student/%s?prefix=BONUS-" % student_id, secret)
    rows = doc.get("rows") or doc.get("ledger") or doc.get("items") or []
    points = 0.0
    for row in rows:
        if row.get("source") != "bonus":
            continue
        try:
            meta = json.loads(row.get("response") or "{}")
        except (TypeError, ValueError):
            meta = {}
        if meta.get("quarter", quarter) == quarter:
            points += float(row.get("score") or 0)
    return points


# --------------------------------------------------------------------------- #
# Schoology                                                                    #
# --------------------------------------------------------------------------- #

READ_ROWS_JS = """(function(){
  function num(id){var e=document.querySelector(id);var n=e?parseFloat(e.textContent.trim()):NaN;return isFinite(n)?n:null;}
  var cells={};
  document.querySelectorAll('[role="gridcell"][data-y][aria-label]').forEach(function(c){
    var y=c.getAttribute('data-y'), parts=c.getAttribute('aria-label').split(', ');
    var m=(parts[2]||'').match(/^(-?[0-9.]+) out of/);
    (cells[y]=cells[y]||{})[parts[1]]=m?Number(m[1]):null;
  });
  var out={};
  Object.keys(cells).forEach(function(y){
    out[y]={cells:cells[y],calc:num('#grader-grid-cell-gp-'+y),override:num('#grader-grid-cell-gp_override-'+y)};
  });
  return JSON.stringify(out);
})()"""


def read_gradebook(ops, cdp, course_id: str) -> dict:
    """{schoologyUid: {row, calc, override, cells}} for every student row."""
    ops.navigate(cdp, ops.gradebook_url(course_id))
    students = []
    for _ in range(15):
        time.sleep(2)
        ops.inject_helpers(cdp)
        students = ops.list_students(cdp)
        if students:
            break
    time.sleep(3)
    if not ops.load_all_columns(cdp):
        raise SystemExit("Schoology gradebook columns did not finish loading")
    rows = json.loads(cdp.eval_js(READ_ROWS_JS))
    out = {}
    for s in students:
        row = rows.get(str(s["rowIndex"]), {})
        out[str(s["studentId"])] = {"row": s["rowIndex"], **row}
    return out


def write_official(ops, cdp, row: int, value: float) -> dict:
    """Open the override cell with a real click (its input stays hidden until then), then type."""
    js = ('(function(){var c=document.querySelector("#grader-grid-cell-gp_override-%s");'
          'c.scrollIntoView({block:"center",inline:"center"});var q=c.getBoundingClientRect();'
          'return JSON.stringify([q.x+q.width/2,q.y+q.height/2]);})()' % row)
    cdp.eval_js(js)
    time.sleep(0.4)
    x, y = json.loads(cdp.eval_js(js))
    cdp.click(int(x), int(y))
    time.sleep(0.6)
    return ops.write_override(cdp, row, value, gp=True)


# --------------------------------------------------------------------------- #
# Run                                                                          #
# --------------------------------------------------------------------------- #

def build_rows(section: str, gradebook: dict, secret: str) -> tuple[list[dict], list[dict]]:
    snap = roster_get("/class/snapshot?section=%s" % section, secret)
    quarter = snap.get("quarter") or "Q1"
    doc = roster_get("/class/grades?section=%s" % section, secret)
    rows, pending = [], []
    for st in doc.get("students", []):
        if st.get("role") == "teacher" or str(st.get("username", "")).startswith("zz_"):
            continue
        q = (st.get("quarters") or {}).get(quarter) or {}
        early = q.get("earlyBonus") or 0
        pc = pc_for_quarter(st, quarter)
        banked = banked_bonus_points(st["studentId"], quarter, secret)
        uid = str(st.get("schoologyUid") or "")
        sch = gradebook.get(uid)
        item = {"name": st.get("realName"), "username": st.get("username"), "uid": uid,
                "studentId": st.get("studentId"),
                "quarter": quarter, "pc": pc, "banked": banked, "early": early}
        if not sch:
            # No Schoology row: keep the Desk's own work grade so the grade is not lost.
            work = q.get("workAvg")
            item.update(work=work, result=official_grade(work, pc, banked, early), source="desk")
            pending.append(item)
            continue
        work = work_grade(sch.get("calc"), sch.get("cells") or {})
        item.update(work=work, row=sch["row"], current=sch.get("override"),
                    result=official_grade(work, pc, banked, early), source="schoology")
        rows.append(item)
    return rows, pending


def print_table(section: str, rows: list[dict], pending: list[dict]) -> None:
    print("\n%s  official quarter grades" % section)
    print("%-28s %6s %6s %5s %5s %6s %-16s %8s -> %s" % (
        "student", "work", "PC", "bank", "early", "line", "rule", "current", "official"))
    for r in rows:
        res = r["result"] or {}
        print("%-28s %6s %6s %5s %5s %6s %-16s %8s -> %s" % (
            (r["name"] or "")[:28], r["work"], r["pc"], r["banked"], r["early"],
            res.get("line"), res.get("rule"), r["current"], res.get("official")))
    for p in pending:
        res = p["result"] or {}
        print("%-28s  NO SCHOOLOGY ROW -- pending official %s" % ((p["name"] or "")[:28], res.get("official")))


def save_pending(section: str, pending: list[dict]) -> None:
    data = {}
    if os.path.exists(PENDING_PATH):
        with open(PENDING_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    data[section] = {"asOf": time.strftime("%Y-%m-%d %H:%M"), "students": pending}
    with open(PENDING_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Official quarter grade -> Schoology override (dry run by default).")
    parser.add_argument("--section", required=True, choices=["PeriodB", "PeriodE"])
    parser.add_argument("--apply", action="store_true", help="Write the overrides (default: dry run).")
    args = parser.parse_args(argv)

    sys.path.insert(0, SCRIPT_DIR)
    import schoology_ops as ops  # noqa: E402
    from schoology_sync_section import SECTION_TO_COURSE_ID  # noqa: E402

    secret = roster_secret()
    cdp = ops.connect(reuse=True)
    course_id = SECTION_TO_COURSE_ID[args.section]
    gradebook = read_gradebook(ops, cdp, course_id)
    rows, pending = build_rows(args.section, gradebook, secret)
    print_table(args.section, rows, pending)
    save_pending(args.section, pending)

    if not args.apply:
        print("\nDRY RUN -- nothing written. Re-run with --apply to write the overrides.")
        return 0

    written = failed = 0
    for r in rows:
        res = r["result"]
        if res is None:
            continue
        if r["current"] is not None and abs(r["current"] - res["official"]) < 0.05:
            continue
        outcome = write_official(ops, cdp, r["row"], res["official"])
        if outcome.get("ok"):
            written += 1
        else:
            failed += 1
            r["writeFailed"] = True
            print("  FAILED %s: %s" % (r["name"], outcome))
    print("\nwrote %d override(s), %d failed" % (written, failed))
    # The Desk shows only numbers Schoology also has (a failed write is retried next night).
    quarter = (rows or pending or [{}])[0].get("quarter", "Q1")
    publish = [r for r in rows if not r.get("writeFailed")] + pending
    print(post_official_grades(quarter, publish, secret))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
