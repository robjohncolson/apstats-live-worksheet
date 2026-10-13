"""schoology_rename_columns.py -- ONE-TIME rename of the Schoology gradebook columns
from the OLD titles to the CED-2026 titles (CED2026_SINGLE_SOURCE_SPEC.md section 3).

    python tools/schoology_rename_columns.py                       # dry-run, both sections
    python tools/schoology_rename_columns.py --section PeriodB      # dry-run, one section
    python tools/schoology_rename_columns.py --apply --only "3.1 Blooket" --section PeriodB
    python tools/schoology_rename_columns.py --apply                # rename everything

RENAME DAY -- on the Athena laptop (the manifest below is a local file the daily sync reads):
  1. python tools/schoology_rename_columns.py               read the plan for both sections
  2. python tools/schoology_rename_columns.py --apply --only "3.1 Blooket" --section PeriodB
     then look at the gradebook in Edge: ONE column renamed, grades unchanged.
     (From here until step 3 finishes, every sync refuses to run: "rename-in-progress".)
  3. python tools/schoology_rename_columns.py --apply        rename the rest (both sections)
     -- re-run the same command after any stop; it resumes from the manifest
  4. python tools/schoology_rename_columns.py               re-check: both sections "done"
  5. set "schoology_titles_ced": true in tools/schoology_sync_config.json  (python sync flag)
  6. set SCHOOLOGY_TITLES_CED = true in roster-server grade-config.js, push (redeploys roster)
  Between 4 and 5 the sync refuses to run with "rename-done-flip-the-flag".
  Grades never move: a rename changes the title only; best-wins is unaffected.
  NEVER rename one of these columns by hand in Schoology: the manifest would not know, and a
  hand-renamed column can wear another column's OLD title ("3.3 Follow-Along").

The manifest, tools/.schoology-rename-state.json (format in schoology_sync_lib.py):
  Title presence is not identity during a migration -- old 6.1-2 legitimately becomes
  "3.3 Follow-Along", which is also old 3.3's OLD title. So this tool records what it did:
  - status "in-progress" is saved BEFORE the first write; "done" only when nothing is left;
  - each rename is saved as "inFlight" (with the assignment node id) BEFORE its write and
    moved to "renamed" right after the gradebook confirms it. On a rerun an inFlight entry is
    settled by the node id's CURRENT title in the materials list (new -> renamed, old -> retry);
  - keys in "renamed" are never candidates again, and a column wearing an old title that is
    the new title of a renamed key IS that renamed column;
  - a gradebook that contradicts the manifest (a renamed column gone, a CED title worn by a
    column the manifest never renamed) stops the tool before any write.

Identity: the gradebook's data-x is a positional GRID KEY, not the assignment node id
(schoology_sync_section._push_grades resolves it fresh every run). The node id comes from
the course Materials list (schoology_ops.list_materials: the same live-verified listing the
sync uses to file assignments into the "Assignments" folder), matched by exact title; a
title that is not exactly one assignment there is refused, never guessed.

EDIT FORM URL -- verified live 2026-10-13 on Athena: the assignment page's own "Edit" link is
  /assignment/edit/{course}/{nid}/basic (form action = the same path, title field
  input#edit-title name="title", submit input#edit-submit "Save Changes"). The two course-less
  guesses from 2026-10-12 (/assignment/{nid}/edit, /assignment/edit/{nid}) render no form.
  rename_assignment still edits only a form whose title field holds the expected OLD title, so
  a wrong URL fails closed ("edit form not found") and --apply stops with the manifest
  "in-progress" (the sync stays blocked; nothing is renamed wrongly). Do NOT rename by hand.

ASCII only. LF line endings.
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

import argparse
import os
import json
import time
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import schoology_sync_lib as lib

# Same course ids as the daily sync (PeriodY is a mock alias of PeriodB: never renamed twice).
SECTIONS = {
    "PeriodB": "8537033028",
    "PeriodE": "8537033042",
}

# Tried in order; {base} = SCHOOLOGY_BASE, {course} = the course id, {nid} = the assignment
# NODE id (from Materials). Verified live 2026-10-13 -- see the module docstring.
EDIT_URL_TEMPLATES = (
    "{base}/assignment/edit/{course}/{nid}/basic",
)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Pure planning (unit-tested)
# ---------------------------------------------------------------------------

def rename_candidates(columns: dict) -> list[dict]:
    """Real Schoology columns whose title changes, as [{key, old, ced}] in fixture order."""
    out = []
    for key, entry in columns.items():
        if not entry.get("schoologyColumn"):
            continue
        if entry["old"] == entry["ced"]:
            continue
        out.append({"key": key, "old": entry["old"], "ced": entry["ced"]})
    return out


def titles_to_look_up(columns: dict) -> list[str]:
    """Every old + CED title the plan needs to know about (dedup, stable order)."""
    seen = []
    for c in rename_candidates(columns):
        for title in (c["old"], c["ced"]):
            if title not in seen:
                seen.append(title)
    return seen


def plan_renames(columns: dict, present: dict, renamed: dict | None = None,
                 only: str | None = None, status: str = "not-started") -> dict:
    """Decide what to rename from the fixture, the live gradebook and the manifest.

    columns: the fixture's {column_key: entry}.
    present: {title: grid_key} for titles found in the live gradebook (absent = not there).
             Grid keys are only compared within this one read, never used as node ids.
    renamed: the manifest's {column_key: {oldTitle, newTitle, ...}} for this section.
    only:    restrict renames to the column whose OLD title is exactly this.
    status:  the manifest status; "done" = verify only (columns the sync created since are
             expected and fine).

    Returns {'renames': [...ordered...], 'done': [...], 'missing': [...], 'conflicts': [...],
             'contradictions': [...]}. Never proposes a create.
    """
    renamed = renamed or {}
    candidates = rename_candidates(columns)
    contradictions = []
    for key, rec in sorted(renamed.items()):
        if rec["newTitle"] not in present:
            contradictions.append(
                f"{key}: the manifest renamed {rec['oldTitle']!r} -> {rec['newTitle']!r}, "
                f"but no column titled {rec['newTitle']!r} is in the gradebook")
    claimed = {rec["newTitle"] for rec in renamed.values()}

    done = [dict(c, column_id=present.get(c["ced"])) for c in candidates if c["key"] in renamed]
    open_ = [c for c in candidates if c["key"] not in renamed]

    # Columns still wearing their own old title. An old title that a renamed key now wears
    # as its NEW title belongs to that renamed column, never to this key.
    pending, missing = [], []
    for c in open_:
        if c["old"] in present and c["old"] not in claimed:
            pending.append(dict(c, column_id=present[c["old"]]))
        else:
            missing.append(c)

    if status == "done":
        for c in pending:
            contradictions.append(
                f"{c['key']}: the manifest says done, but {c['old']!r} is back in the gradebook")
        return {"renames": [], "done": done, "missing": missing, "conflicts": [],
                "contradictions": contradictions}

    pending_by_old = {c["old"]: c for c in pending}
    for c in missing:
        holder = present.get(c["ced"])
        if holder is None or c["ced"] in pending_by_old:
            continue
        # Its CED title is in the gradebook but nothing explains it: renamed outside the tool.
        contradictions.append(
            f"{c['key']}: a column is already titled {c['ced']!r} but the manifest never renamed "
            f"{c['old']!r} -- renamed by hand? Put that title back to {c['old']!r} in Schoology, "
            "then re-run")

    conflicts, ready = [], []
    for c in pending:
        holder = present.get(c["ced"])
        if holder is None:
            ready.append(c)
            continue
        blocker = pending_by_old.get(c["ced"])
        if blocker is None or blocker["column_id"] != holder:
            conflicts.append(dict(c, reason=f"new title {c['ced']!r} is already used by another column"))
            continue
        ready.append(dict(c, after=blocker["old"]))

    ordered = _order_renames(ready, conflicts)
    if only is not None:
        ordered = [c for c in ordered if c["old"] == only]
        if any(c.get("after") for c in ordered):
            for c in ordered:
                conflicts.append(dict(c, reason=f"rename {c['after']!r} first (it still wears {c['ced']!r})"))
            ordered = []
    for c in ordered:
        c.pop("after", None)
    return {"renames": ordered, "done": done, "missing": missing, "conflicts": conflicts,
            "contradictions": contradictions}


def _order_renames(ready: list[dict], conflicts: list[dict]) -> list[dict]:
    """Put each rename after the rename that frees its new title; cycles become conflicts."""
    by_old = {c["old"]: c for c in ready}
    ordered, placed, visiting = [], set(), set()

    def place(c) -> bool:
        if c["old"] in placed:
            return True
        if c["old"] in visiting:
            return False
        visiting.add(c["old"])
        blocker = by_old.get(c.get("after")) if c.get("after") else None
        ok = not (c.get("after") and blocker is None)
        if ok and blocker is not None:
            ok = place(blocker)
        visiting.discard(c["old"])
        if not ok:
            return False
        placed.add(c["old"])
        ordered.append(c)
        return True

    for c in ready:
        if not place(c):
            conflicts.append(dict(c, reason="rename cycle or blocked chain"))
    return ordered


def format_plan(section: str, status: str, plan: dict) -> list[str]:
    """Human-readable plan lines (ASCII)."""
    lines = [f"== {section} [{status}]: {len(plan['renames'])} to rename, {len(plan['done'])} renamed, "
             f"{len(plan['missing'])} not found, {len(plan['conflicts'])} conflicts, "
             f"{len(plan['contradictions'])} contradictions"]
    for text in plan["contradictions"]:
        lines.append(f"  CONTRADICTION  {text}")
    for c in plan["renames"]:
        lines.append(f"  RENAME    {c['old']} -> {c['ced']}")
    for c in plan["conflicts"]:
        lines.append(f"  CONFLICT  {c['old']} -> {c['ced']}: {c['reason']}")
    for c in plan["done"]:
        lines.append(f"  DONE      {c['ced']}   (was {c['old']})")
    if plan["missing"]:
        lines.append("  Not in this gradebook (never created, or not due yet) -- NOT created; "
                     "the sync creates them with the CED title later:")
        for c in plan["missing"]:
            lines.append(f"    {c['old']}   (will be {c['ced']})")
    return lines


# ---------------------------------------------------------------------------
# Live CDP
# ---------------------------------------------------------------------------

def read_present_titles(ops, cdp, titles: list[str]) -> dict:
    """{title: grid_key} for each title found in the loaded gradebook (exact-title match)."""
    present = {}
    for title in titles:
        grid_key = ops.find_assignment_id_by_title(cdp, title)
        if grid_key is not None:
            present[title] = grid_key
    return present


def list_course_assignments(ops, cdp, course_id: str) -> list[dict]:
    """[{nid, title}] for every assignment in Materials: the root + the "Assignments" folder."""
    items = list(ops.list_materials(cdp, course_id))
    folder_id = ops.find_folder_id(cdp, course_id)
    if folder_id:
        items += list(ops.list_materials(cdp, course_id, folder_id))
    return [{"nid": str(i["nid"]), "title": i.get("title") or ""}
            for i in items if i.get("kind") == "assignment"]


def node_id_for_title(assignments: list[dict], title: str) -> tuple[str | None, str | None]:
    """(nid, None) when exactly one assignment has this exact title, else (None, reason)."""
    matches = [a["nid"] for a in assignments if a["title"] == title]
    if len(matches) == 1:
        return matches[0], None
    if not matches:
        return None, f"no assignment titled {title!r} in Materials (root or Assignments folder)"
    return None, f"{len(matches)} assignments are titled {title!r} in Materials; refusing to guess"


def title_of_node(assignments: list[dict], nid: str) -> str | None:
    for a in assignments:
        if a["nid"] == str(nid):
            return a["title"]
    return None


def _open_edit_form(ops, cdp, course_id: str, nid: str, old_title: str) -> str | None:
    """Navigate to the assignment's edit form; return the URL used, or None (fail closed)."""
    for template in EDIT_URL_TEMPLATES:
        url = template.format(base=ops.SCHOOLOGY_BASE, course=course_id, nid=nid)
        cdp.attach_url(url, wait_ms=3000)
        current = cdp.eval_js(
            "(function(){var el=document.querySelector('form input[name=\"title\"]');"
            "return el ? String(el.value) : null;})()"
        )
        if current == old_title:
            return url
    return None


def rename_assignment(ops, cdp, course_id: str, nid: str, old_title: str, new_title: str) -> dict:
    """Rename one assignment (by NODE id) through its "basic" edit form.

    Edits ONLY a form whose title field currently holds old_title. Confirms afterwards by
    identity (the node's title in Materials is now new_title) AND in the gradebook.
    Returns {'ok': bool, 'error': str|None}.
    """
    url = _open_edit_form(ops, cdp, course_id, nid, old_title)
    if url is None:
        return {"ok": False, "error": f"edit form not found for assignment {nid} "
                                      f"(tried {len(EDIT_URL_TEMPLATES)} URLs)"}

    cdp.eval_js(
        "(function(){var el=document.querySelector('form input[name=\"title\"]');"
        "if(!el)return;el.value=" + json.dumps(new_title) + ";"
        "el.dispatchEvent(new Event('input',{bubbles:true}));"
        "el.dispatchEvent(new Event('change',{bubbles:true}));})()"
    )
    typed = cdp.eval_js(
        "(function(){var el=document.querySelector('form input[name=\"title\"]');"
        "return el ? String(el.value) : null;})()"
    )
    if typed != new_title:
        return {"ok": False, "error": f"title field rejected the new title (reads {typed!r})"}

    # JS click, like the (long) add-assignment form in schoology_ops.add_assignment.
    clicked = cdp.eval_js(
        "(function(){var el=document.querySelector('input#edit-submit');"
        "if(!el)return false;el.click();return true;})()"
    )
    if not clicked:
        return {"ok": False, "error": "submit button input#edit-submit not found"}
    time.sleep(3.0)

    error_text = cdp.eval_js(
        "(function(){var el=document.querySelector('.messages.error, .error-messages, "
        ".form-item--error-message');return el ? el.textContent.trim() : null;})()"
    )
    if error_text:
        return {"ok": False, "error": f"Schoology rejected the edit: {error_text}"}

    for _ in range(3):
        if title_of_node(list_course_assignments(ops, cdp, course_id), nid) == new_title:
            ops.navigate(cdp, ops.gradebook_url(course_id))
            ops.inject_helpers(cdp)
            if ops.find_assignment_id_by_title(cdp, new_title) is not None:
                return {"ok": True, "error": None}
        time.sleep(1.0)
    return {"ok": False, "error": f"assignment {nid} does not show {new_title!r} after submit"}


def _settle_in_flight(ops, cdp, course_id: str, entry: dict, save) -> str | None:
    """Resolve a rename that was started but never recorded. Returns an error, or None."""
    flight = entry.get("inFlight")
    if not flight:
        return None
    current = title_of_node(list_course_assignments(ops, cdp, course_id), flight["nid"])
    if current == flight["newTitle"]:
        entry["renamed"][flight["key"]] = {"oldTitle": flight["oldTitle"], "newTitle": flight["newTitle"],
                                           "nid": flight["nid"], "at": _now()}
        print(f"  [RESUME] {flight['oldTitle']} -> {flight['newTitle']} had landed; recorded")
    elif current == flight["oldTitle"]:
        print(f"  [RESUME] {flight['oldTitle']} was not renamed yet; it stays in the plan")
    else:
        return (f"assignment {flight['nid']} (in-flight {flight['oldTitle']!r} -> {flight['newTitle']!r}) "
                f"is now titled {current!r}; fix it in Schoology by hand, then re-run")
    entry["inFlight"] = None
    save()
    return None


def run_section(ops, cdp, section: str, course_id: str, columns: dict, *,
                apply: bool, only: str | None, state: dict, save) -> dict:
    """Plan (and with apply, perform) one section's rename. `state` is the whole manifest;
    `save()` persists it. Returns {'plan', 'renamed', 'failed', 'status'}."""
    ops.navigate(cdp, ops.gradebook_url(course_id))
    ops.inject_helpers(cdp)
    if ops.detect_login_state(cdp) != "authenticated":
        print("[AUTH] Not signed into Schoology in the Edge window -- sign in, then re-run.")
        raise SystemExit(1)

    entry = state.setdefault(section, {})
    entry.setdefault("status", "not-started")
    entry.setdefault("renamed", {})
    entry.setdefault("inFlight", None)

    if entry["inFlight"]:
        if not apply:
            print(f"  [note] a rename was in flight ({entry['inFlight']['oldTitle']!r}); "
                  "--apply settles it first")
        else:
            error = _settle_in_flight(ops, cdp, course_id, entry, save)
            if error:
                print(f"  [STOP] {error}")
                return {"plan": None, "renamed": 0, "failed": error, "status": entry["status"]}
            ops.navigate(cdp, ops.gradebook_url(course_id))
            ops.inject_helpers(cdp)

    status = entry["status"]
    present = read_present_titles(ops, cdp, titles_to_look_up(columns))
    plan = plan_renames(columns, present, entry["renamed"], only=only, status=status)
    for line in format_plan(section, status, plan):
        print(line)

    if plan["contradictions"]:
        print("  [STOP] the gradebook contradicts the rename manifest; nothing was changed.")
        return {"plan": plan, "renamed": 0, "failed": "contradiction", "status": status}
    if not apply or status == "done":
        return {"plan": plan, "renamed": 0, "failed": None, "status": status}
    if plan["conflicts"]:
        print("  [STOP] resolve the conflicts above first; nothing was changed.")
        return {"plan": plan, "renamed": 0, "failed": "conflict", "status": status}

    if plan["renames"] and entry["status"] != "in-progress":
        entry["status"] = "in-progress"            # BEFORE the first write
        entry.setdefault("startedAt", _now())
        save()

    renamed = 0
    for c in plan["renames"]:
        nid, reason = node_id_for_title(list_course_assignments(ops, cdp, course_id), c["old"])
        if nid is None:
            print(f"  [STOP] {c['old']}: {reason}")
            return {"plan": plan, "renamed": renamed, "failed": c["old"], "status": entry["status"]}
        entry["inFlight"] = {"key": c["key"], "nid": nid, "oldTitle": c["old"], "newTitle": c["ced"]}
        save()                                       # BEFORE the write
        print(f"  [APPLY] {c['old']} -> {c['ced']} (assignment {nid}) ...")
        result = rename_assignment(ops, cdp, course_id, nid, c["old"], c["ced"])
        if not result["ok"]:
            print(f"  [STOP] {c['old']}: {result['error']}")
            return {"plan": plan, "renamed": renamed, "failed": c["old"], "status": entry["status"]}
        entry["renamed"][c["key"]] = {"oldTitle": c["old"], "newTitle": c["ced"], "nid": nid, "at": _now()}
        entry["inFlight"] = None
        save()                                       # right after the confirmed rename
        renamed += 1
        print(f"  [OK]    {c['ced']}")

    # Done only when a full (not --only) plan left nothing behind.
    if only is None:
        entry["status"] = "done"
        entry["finishedAt"] = _now()
        save()
        print(f"  [DONE] {section}: rename complete")
    return {"plan": plan, "renamed": renamed, "failed": None, "status": entry["status"]}


def _parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="One-time rename of Schoology columns to CED-2026 titles (dry-run by default)."
    )
    p.add_argument("--section", choices=["PeriodB", "PeriodE", "all"], default="all")
    p.add_argument("--apply", action="store_true", help="Rename for real (default: print the plan only).")
    p.add_argument("--only", default=None, metavar="OLD_TITLE",
                   help='Rename just this column, e.g. --only "3.1 Blooket" (try one first).')
    p.add_argument("--titles", default=None, metavar="PATH",
                   help="Alternative ced-column-titles.json (default: data/ced-column-titles.json).")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = _parse_args(argv)
    columns = lib.load_ced_columns(args.titles)
    sections = list(SECTIONS) if args.section == "all" else [args.section]
    state = lib.load_rename_state()
    print(f"[rename] mode={'APPLY' if args.apply else 'DRY-RUN'} sections={','.join(sections)}"
          + (f" only={args.only!r}" if args.only else "")
          + f" manifest={lib.rename_state_path()}")

    import schoology_ops as ops  # live CDP; imported here so the planner tests need no browser
    cdp = ops.connect(reuse=True)
    failed = False
    for section in sections:
        outcome = run_section(ops, cdp, section, SECTIONS[section], columns, apply=args.apply,
                              only=args.only, state=state, save=lambda: lib.save_rename_state(state))
        if outcome["failed"]:
            failed = True
            break
    if not args.apply:
        print("\nDry-run: nothing was changed. Re-run with --apply (try --only \"<old title>\" first).")
    elif not failed and all(lib.rename_status(state, s) == "done" for s in SECTIONS):
        print("\nBoth sections done. Next: set \"schoology_titles_ced\": true in "
              "tools/schoology_sync_config.json, then roster SCHOOLOGY_TITLES_CED=true.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
