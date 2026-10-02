"""Read each student's marking-period grade from the live Schoology gradebook.

Writes {schoologyUid: {"calc": <calculated grade>, "override": <override or null>}} for
Period B and Period E to a PRIVATE file (default %USERPROFILE%/grade-backups/slips/
schoology-grades.json). Read-only: it never types into the gradebook.

    python tools/schoology_read_grades.py [out.json]

scripts/weekly-slips.mjs --schoology <file> prints these numbers on the slips.
"""
import json
import os
import sys
import time

import schoology_ops as ops
from schoology_sync_section import SECTION_TO_COURSE_ID

DEFAULT_OUT = os.path.join(os.path.expanduser("~"), "grade-backups", "slips", "schoology-grades.json")

CELL_TEXT_JS = """(function(){
  function num(id){var e=document.querySelector(id);var n=e?parseFloat(e.textContent.trim()):NaN;return isFinite(n)?n:null;}
  return JSON.stringify({calc:num('#grader-grid-cell-gp-%(row)s'),override:num('#grader-grid-cell-gp_override-%(row)s')});
})()"""


def load_students(cdp, course_id):
    ops.navigate(cdp, ops.gradebook_url(course_id))
    for _ in range(20):
        time.sleep(2)
        ops.inject_helpers(cdp)
        students = ops.list_students(cdp)
        if students:
            time.sleep(3)  # the grade cells render after the student list
            return students
    return []


def read_section(cdp, course_id):
    grades = {}
    for student in load_students(cdp, course_id):
        cell = json.loads(cdp.eval_js(CELL_TEXT_JS % {"row": student["rowIndex"]}))
        grades[str(student["studentId"])] = cell
    return grades


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    cdp = ops.connect(reuse=True)
    grades = {}
    for section in ("PeriodB", "PeriodE"):
        found = read_section(cdp, SECTION_TO_COURSE_ID[section])
        if not found:
            raise SystemExit(f"{section}: no gradebook rows (is Edge signed in to Schoology?)")
        print(f"{section}: {len(found)} students")
        grades.update(found)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(grades, handle, indent=1)
    print(f"wrote {len(grades)} grades -> {out}")


if __name__ == "__main__":
    main()
