"""schoology_ops.py -- importable live-ops layer for Schoology grade sync.

Extracted from tools/schoology-sync.py (P1b verified, 2026-05-29) so that
higher-level batch-sync code (P2+) can import these without re-implementing
the proven CDP mechanics.

All functions take an EdgeCDP instance as their first argument and perform
I/O against the live page. None of them navigate unless documented.

MARKING-PERIOD FILTER (QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.1): displayed_grading_period reads
the gradebook's filter (read-only); select_grading_period switches it and proves it: the filter,
the header and Drupal's period list must agree, and after a switch the grid itself must show
other columns than before it (review finding A3: the old period's grid can outlive the switch).
view_content_matches checks the grid's column titles against the marking period the sync state
files them in. Read-only checks for the rig (never 16:25-17:05, the LIVE sync tasks run then):
  CMD 4, the MP list and the view each gradebook opens on (Git Bash, from the repo root):
python - <<'PY'
import sys, time; sys.path.insert(0, 'tools')
import schoology_ops as ops
cdp = ops.connect(reuse=True)
for sec, cid in (('PeriodB', '8537033028'), ('PeriodE', '8537033042')):
    print(sec, ops.list_marking_periods(cdp, cid))
    ops.navigate(cdp, ops.gradebook_url(cid)); ops.inject_helpers(cdp); time.sleep(4)
    print(sec, ops.displayed_grading_period(cdp))
PY
  The one-shot SELECT check: python tools/schoology_move_columns.py --section PeriodB
  (its dry run switches the view to MP1, then MP2, verifies each, reads titles + filled cells).

ASCII only. LF line endings.
"""
from __future__ import annotations

import json
import math
import os
import re
import time
from typing import Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Insert the cdp dir so `from edge import EdgeCDP` resolves the same way
# schoology-sync.py does (tools/cdp/edge.py).
import sys
sys.path.insert(0, os.path.join(SCRIPT_DIR, "cdp"))
from edge import EdgeCDP, DEFAULT_PORT  # type: ignore

SCHOOLOGY_BASE = "https://lynnschools.schoology.com"
HELPERS_PATH   = os.path.join(SCRIPT_DIR, "schoology-dom-helpers.js")


def connect(reuse: bool = True, port: int = DEFAULT_PORT) -> EdgeCDP:
    """Launch/attach the Edge CDP rig for Schoology and return the client.

    reuse=True attaches to an already-running debug session if present (keeps
    the warm Schoology cookie); otherwise it launches Edge. Mirrors how
    schoology-sync.py boots the rig, so P2 orchestration shares one entry point.
    """
    cdp = EdgeCDP(port=port)
    cdp.launch(SCHOOLOGY_BASE, reuse=reuse)
    return cdp


def navigate(cdp, url: str, wait_ms: int = 3500) -> None:
    """Navigate the attached page to `url` and wait for load (thin wrapper)."""
    cdp.attach_url(url, wait_ms=wait_ms)


# --------------------------------------------------------------------------- #
# URLs                                                                         #
# --------------------------------------------------------------------------- #

def gradebook_url(course_id: str) -> str:
    """Return the gradebook URL for a Schoology course id."""
    return f"{SCHOOLOGY_BASE}/course/{course_id}/grades"


def add_assignment_url(course_id: str, is_test: bool = False) -> str:
    """Return the Add Assignment popup form URL for a course.

    is_test=True uses the add_assessment variant (Test/Quiz form); both
    forms share the same field schema (Q4 in P0 discovery).
    """
    suffix = "add_assessment" if is_test else "add"
    return f"{SCHOOLOGY_BASE}/course/{course_id}/materials/assignments/{suffix}?is_popup=1"


# --------------------------------------------------------------------------- #
# Helper injection                                                             #
# --------------------------------------------------------------------------- #

def inject_helpers(cdp: EdgeCDP) -> None:
    """Eval tools/schoology-dom-helpers.js in the live page.

    Attaches window.SchoologyDomHelpers. Safe to call multiple times --
    the IIFE overwrites the existing binding.
    """
    with open(HELPERS_PATH, "r", encoding="utf-8") as f:
        src = f.read()
    cdp.eval_js(src)


def helper_call(cdp: EdgeCDP, expression: str):
    """Eval JSON.stringify(<expression>) and JSON-decode the result.

    Returns a plain Python object. Returns None if the page returns
    undefined or the JSON is empty.
    """
    wrapped = f"JSON.stringify({expression})"
    raw = cdp.eval_js(wrapped)
    if raw is None:
        return None
    return json.loads(raw)


# --------------------------------------------------------------------------- #
# Login                                                                        #
# --------------------------------------------------------------------------- #

def detect_login_state(cdp: EdgeCDP) -> str:
    """Return 'authenticated' | 'login_required' | 'unknown'.

    Requires helpers already injected (call inject_helpers first).
    """
    state = helper_call(cdp, "window.SchoologyDomHelpers.detectLoginState(document)")
    return state or "unknown"


# --------------------------------------------------------------------------- #
# Gradebook readers                                                            #
# --------------------------------------------------------------------------- #

def list_students(cdp: EdgeCDP) -> list:
    """Return [{studentId, rowIndex, name}] from the live gradebook.

    Requires helpers already injected and the gradebook page loaded.
    """
    return helper_call(cdp, "window.SchoologyDomHelpers.listStudents(document)") or []


def list_assignments(cdp: EdgeCDP) -> list:
    """Return [{columnKey, isAggregate}] from the live gradebook.

    Filters out AngularJS placeholder columns (grader-grid-cell-type-none).
    Requires helpers already injected and the gradebook page loaded.
    """
    return helper_call(cdp, "window.SchoologyDomHelpers.listAssignments(document)") or []


def find_cell_selector(cdp: EdgeCDP, column_key: str, row_index: int) -> Optional[str]:
    """Return the CSS selector for a specific grade cell, or None.

    The selector is '#grader-grid-cell-<col>-<row>' -- stable, id-based.
    Requires helpers already injected.
    """
    expr = (
        f"window.SchoologyDomHelpers.findCellSelector("
        f"{{ columnKey: {json.dumps(column_key)}, rowIndex: {int(row_index)} }})"
    )
    return helper_call(cdp, expr)


# --------------------------------------------------------------------------- #
# Grade write                                                                  #
# --------------------------------------------------------------------------- #

def read_grade_from_cell(cdp: EdgeCDP, column_key: str, row_index: int) -> float | None:
    """Read the persistent grade input without focus, typing, or navigation."""
    selector = find_cell_selector(cdp, column_key, row_index)
    if not selector:
        return None
    input_selector = selector + " input.grader-edit-input"
    raw = cdp.eval_js(
        f"document.querySelector({json.dumps(input_selector)})?.value ?? null"
    )
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def inspect_cell_comment_ui(cdp, column_key: str, row_index: int) -> dict:
    """Read-only discovery: no clicks, focus, scrolling, typing, or DOM changes.

    Reports the target cell and any already-mounted comment menu/popover.
    Hidden markup is evidence only; this probe never opens it.
    """
    cell_id = f"grader-grid-cell-{column_key}-{int(row_index)}"
    # UNVERIFIED — confirm with --inspect-comment-ui
    icon_selector = '.grades-comment, .icon-comment, .icon-flag, [title*="comment" i], [aria-label*="comment" i]'
    # UNVERIFIED — confirm with --inspect-comment-ui
    menu_selector = '[role="menuitem"], .context-menu a, .context-menu li'
    # UNVERIFIED — confirm with --inspect-comment-ui
    popup_selector = '#grade-comment-field, [role="dialog"], .popover'
    return cdp.eval_js(f"""(() => {{
        const cell = document.getElementById({json.dumps(cell_id)});
        if (!cell) return {{ok:false, reason:'cell missing'}};
        const rect = el => {{
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none') return null;
            const points = [[r.left+r.width/2, r.top+r.height/2]];
            if (el === cell) points.push([r.left+2,r.top+2], [r.right-2,r.bottom-2]);
            for (const [x,y] of points) {{
                const hit = document.elementFromPoint(x, y);
                if (hit && (hit === el || el.contains(hit)) && !hit.closest('input, textarea')) return {{x,y}};
            }}
            return null;
        }};
        const describe = el => ({{tag:el.tagName, id:el.id, className:el.className,
            title:el.getAttribute('title'), ariaLabel:el.getAttribute('aria-label'),
            html:el.outerHTML, rect:rect(el)}});
        return {{ok:true, cell:describe(cell),
            icons:Array.from(cell.querySelectorAll({json.dumps(icon_selector)})).map(describe),
            menuItems:Array.from(document.querySelectorAll({json.dumps(menu_selector)}))
                .filter(el => /^(add |edit |grade )?comment$/i.test(el.textContent.trim())).map(describe),
            popovers:Array.from(document.querySelectorAll({json.dumps(popup_selector)}))
                .filter(el => el.querySelector('textarea')).map(describe)}};
    }})()""") or {"ok": False, "reason": "no DOM report"}


# Every comment the sync writes starts with this sentence; the sync never clears anything else.
SYNC_COMMENT_PREFIX = "Not a permanent 0."


def _scroll_cell_into_view(cdp, column_key: str, row_index: int) -> None:
    """Bring a grid cell into the scrolling body's visible band via the CDP DOM domain
    (no page script, so the writer's eval sequence stays exactly as tested). Best-effort."""
    try:
        doc = cdp.send("DOM.getDocument", {"depth": 0})
        root = doc["root"]["nodeId"]
        node = cdp.send("DOM.querySelector", {"nodeId": root, "selector": f"#grader-grid-cell-{column_key}-{int(row_index)}"})
        node_id = node.get("nodeId")
        if node_id:
            cdp.send("DOM.scrollIntoViewIfNeeded", {"nodeId": node_id})
            time.sleep(0.3)
    except Exception:
        return


def write_cell_comment(cdp, column_key: str, row_index: int, text: str,
                       expect_current: str | None = None) -> dict:
    """BEST-EFFORT DRAFT: UI selectors and commit behavior are not live verified.

    Try the cell icon, then a context Comment item. Type only into a confirmed
    comment textarea, never a grade input. Close/reopen and re-read to verify.
    A DOM read-back is not proof of persistence across a page reload.

    Clearing (text == "") only ever removes a comment that starts with the sync's prefix;
    with `expect_current` it removes it only when the cell still holds EXACTLY that text
    (the note the sync last wrote), so an edited or teacher-typed comment is left alone.
    """
    failure = {"ok": False, "verified": False}
    if not isinstance(text, str) or any(c in text for c in "\r\n\t"):
        return {**failure, "reason": "comment must be a single line"}

    # UNVERIFIED — confirm with --inspect-comment-ui
    # Generic popovers are accepted only when they contain textarea.grade-comment.
    editor_js = """(() => {
        const visible = el => el && el.getClientRects().length &&
            getComputedStyle(el).visibility !== 'hidden';
        const fields = Array.from(document.querySelectorAll(
            '#grade-comment-field textarea.grade-comment, [role="dialog"] textarea.grade-comment, .popover textarea.grade-comment'
        )).filter(visible);
        if (fields.length !== 1) return null;
        const field = fields[0];
        const popup = field.closest('#grade-comment-field, [role="dialog"], .popover');
        const point = el => {
            if (!visible(el) || el.disabled) return null;
            const r = el.getBoundingClientRect();
            const x = r.left+r.width/2, y = r.top+r.height/2;
            const hit = document.elementFromPoint(x,y);
            return hit && (hit === el || el.contains(hit)) ? {x,y} : null;
        };
        const status = popup.querySelector('input#comment_status[type="checkbox"]');
        // LIVE 2026-09-26: the .grade-comment-close wrapper has zero height; the clickable part is
        // its inner #closebutton span. Take the first close-ish element that actually has a box.
        const close = Array.from(popup.querySelectorAll('.grade-comment-close #closebutton, .grade-comment-close span, .grade-comment-close'))
            .find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
        const saves = Array.from(popup.querySelectorAll('button, [role="button"], input[type="submit"]'))
            .filter(el => visible(el) && /^(save|save comment)$/i.test((el.textContent || el.value || '').trim()));
        return {text:field.value, focused:document.activeElement === field,
            editable:!field.disabled && !field.readOnly, field:point(field),
            checked:status ? status.checked : null, status:point(status),
            close:point(close), save:saves.length === 1 ? point(saves[0]) : null};
    })()"""
    try:
        report = inspect_cell_comment_ui(cdp, column_key, row_index)
        if not report.get("ok"):
            return {**failure, "reason": report.get("reason", "cell missing")}
        if cdp.eval_js(editor_js):
            return {**failure, "reason": "comment editor already open; owner uncertain"}
        before = read_grade_from_cell(cdp, column_key, row_index)
        if before is None:
            return {**failure, "reason": "current grade unreadable; comment skipped"}
        cdp.send("Page.bringToFront", {})
        cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
        # LIVE 2026-09-26: the grid body scrolls horizontally (clientWidth ~646px of ~2340px);
        # a cell past its right edge is covered by the frozen panel, so the centre-point probe
        # fails ("missing or ambiguous Comment affordance"). Bring the cell into the visible band.
        _scroll_cell_into_view(cdp, column_key, row_index)

        # Two openings: first edit, then independently read back after closing.
        for verify in (False, True):
            report = inspect_cell_comment_ui(cdp, column_key, row_index)
            icons = [i["rect"] for i in report.get("icons", []) if i.get("rect")]
            cell_point = (report.get("cell") or {}).get("rect")
            if not icons and cell_point:
                cdp.click(cell_point["x"], cell_point["y"])
                time.sleep(0.2)
                report = inspect_cell_comment_ui(cdp, column_key, row_index)
                icons = [i["rect"] for i in report.get("icons", []) if i.get("rect")]
            editor = None
            for affordance in ("icon", "context"):
                if affordance == "icon":
                    if len(icons) != 1:
                        continue
                    cdp.click(icons[0]["x"], icons[0]["y"])
                else:
                    if not cell_point:
                        return {**failure, "reason": "no safe comment affordance"}
                    for event in ("mousePressed", "mouseReleased"):
                        cdp.send("Input.dispatchMouseEvent", {
                            "type": event, "x": cell_point["x"], "y": cell_point["y"],
                            "button": "right", "clickCount": 1,
                        })
                    time.sleep(0.2)
                    report = inspect_cell_comment_ui(cdp, column_key, row_index)
                    items = [i["rect"] for i in report.get("menuItems", []) if i.get("rect")]
                    if len(items) != 1:
                        return {**failure, "reason": "missing or ambiguous Comment affordance"}
                    cdp.click(items[0]["x"], items[0]["y"])
                for _ in range(5):
                    time.sleep(0.2)
                    editor = cdp.eval_js(editor_js)
                    if editor:
                        break
                if editor:
                    break
            if not editor or not editor.get("close"):
                return {**failure, "reason": "comment textarea or safe close missing"}
            if text and not verify and (editor.get("text") or "") == text and editor.get("checked") is True:
                cdp.click(editor["close"]["x"], editor["close"]["y"])
                return {"ok": True, "verified": True, "text": text, "skipped": "already set"}
            if text == "" and not verify:
                current = editor.get("text") or ""
                if current == "":
                    cdp.click(editor["close"]["x"], editor["close"]["y"])
                    return {"ok": True, "verified": True, "text": "", "skipped": "nothing to clear"}
                if not current.startswith(SYNC_COMMENT_PREFIX):
                    cdp.click(editor["close"]["x"], editor["close"]["y"])
                    return {**failure, "reason": "existing comment is not the sync's; left untouched"}
                if expect_current is not None and current != expect_current:
                    cdp.click(editor["close"]["x"], editor["close"]["y"])
                    return {**failure, "reason": "comment differs from the sync's last note; left untouched"}
            if verify:
                cdp.click(editor["close"]["x"], editor["close"]["y"])
                time.sleep(0.3)
                after = read_grade_from_cell(cdp, column_key, row_index)
                if editor.get("text") != text or (text and editor.get("checked") is not True):
                    return {**failure, "reason": "reopened comment text/publication mismatch"}
                if before != after or cdp.eval_js(editor_js):
                    return {**failure, "reason": "grade changed or comment editor did not close"}
                return {"ok": True, "verified": True, "text": editor["text"]}

            if not editor.get("editable") or not editor.get("field") or (text and editor.get("checked") is None):
                cdp.click(editor["close"]["x"], editor["close"]["y"])
                return {**failure, "reason": "textarea or student visibility control uncertain"}
            if text and not editor["checked"]:
                if not editor.get("status"):
                    cdp.click(editor["close"]["x"], editor["close"]["y"])
                    return {**failure, "reason": "cannot publish comment to student"}
                cdp.click(editor["status"]["x"], editor["status"]["y"])
                editor = cdp.eval_js(editor_js) or {}
                if editor.get("checked") is not True or not editor.get("field"):
                    return {**failure, "reason": "student visibility did not enable"}
            cdp.click(editor["field"]["x"], editor["field"]["y"])
            # Real select-all, Backspace, and character keys. NEVER send Enter.
            keys = [{"key": "a", "code": "KeyA", "windowsVirtualKeyCode": 65, "modifiers": 2},
                    {"key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8}]
            keys += [{"key": ch, "text": ch, "unmodifiedText": ch} for ch in text]
            for key in keys:
                focused = cdp.eval_js(editor_js) or {}
                if not focused.get("focused") or not focused.get("editable"):
                    return {**failure, "reason": "comment textarea lost focus; stopped typing"}
                cdp.send("Input.dispatchKeyEvent", {"type": "keyDown", **key})
                cdp.send("Input.dispatchKeyEvent", {
                    "type": "keyUp", **{k: v for k, v in key.items() if k not in ("text", "unmodifiedText")},
                })
            editor = cdp.eval_js(editor_js) or {}
            if editor.get("text") != text:
                return {**failure, "reason": "typed comment did not match"}
            commit = editor.get("save") or editor.get("close")
            if not commit:
                return {**failure, "reason": "no safe comment commit control"}
            cdp.click(commit["x"], commit["y"])
            time.sleep(0.5)
            editor = cdp.eval_js(editor_js)
            if editor and editor.get("close"):
                cdp.click(editor["close"]["x"], editor["close"]["y"])
                time.sleep(0.3)
            if cdp.eval_js(editor_js):
                return {**failure, "reason": "comment editor did not close"}
    except Exception as exc:
        return {**failure, "reason": f"comment draft failed ({type(exc).__name__})"}
    return {**failure, "reason": "comment not verified"}


def clear_cell_comment(cdp, column_key: str, row_index: int, expect_current: str | None = None) -> dict:
    """BEST-EFFORT DRAFT: same guarded textarea path, with empty text."""
    return write_cell_comment(cdp, column_key, row_index, "", expect_current=expect_current)


def write_grade_to_cell(
    cdp: EdgeCDP,
    column_key: str,
    row_index: int,
    value: float,
) -> dict:
    """Write a grade into one gradebook cell.  P1b-VERIFIED mechanism.

    The grade cell (#grader-grid-cell-<col>-<row>) holds a PERSISTENT
    <input class="grade grader-edit-input"> (always in DOM, no ng-model).
    Schoology saves ONLY on a real keystroke sequence committed with Enter.
    Synthetic value setters, insertText, and blur all fail to persist.

    Steps:
      1. Resolve the cell selector via find_cell_selector.
      2. Verify the input exists in the DOM.
      3. Focus via JS .focus() with a retry loop that also tries a
         trusted coordinate-click on the input rect center (Angular init
         is flaky). Up to 6 attempts, re-querying the input each time.
      4. Backspace-clear the existing value.
      5. Type each char via Input.dispatchKeyEvent (keyDown/keyUp with
         text) -- Angular's save handler requires real keystrokes.
      6. Commit with a real Enter key event.

    Returns {'ok': bool, 'typed': <input value after typing>, 'focused': bool}.

    This function is a byte-for-byte extraction of the working p1_write()
    body in schoology-sync.py -- do not change the mechanism without
    updating the P1b record in SCHOOLOGY_SYNC_V1_BUILD.md.
    """
    selector = find_cell_selector(cdp, column_key, row_index)
    if not selector:
        return {"ok": False, "typed": None, "focused": False}

    input_sel = selector + " input.grader-edit-input"
    if not cdp.eval_js(f"!!document.querySelector({json.dumps(input_sel)})"):
        return {"ok": False, "typed": None, "focused": False}

    def _focused() -> bool:
        return bool(cdp.eval_js(
            f"document.activeElement===document.querySelector({json.dumps(input_sel)})"
        ))

    # 2026-09-09 (first live daily run): Chromium DROPS Input.dispatchKeyEvent on a page whose
    # visibilityState is 'hidden' -- the scheduled task launches the rig Edge behind other
    # windows, so every keystroke was silently lost (focus + Enter "succeeded", nothing typed,
    # nothing saved). Bring the page to front and emulate focus first; both are idempotent.
    try:
        cdp.send("Page.bringToFront", {})
        cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
    except Exception:  # noqa: BLE001 -- best effort; the verification below is the real gate
        pass

    # Focus the input. Angular's first-render timing is flaky, so retry a few
    # times, trying BOTH JS .focus() and a trusted coordinate-click, re-querying
    # the input fresh each attempt (the grid can re-render between CDP calls).
    focused = False
    for _ in range(6):
        cdp.eval_js(
            f"(function(){{var a=document.querySelector({json.dumps(input_sel)});"
            "if(a){a.scrollIntoView({block:'center',inline:'center'});a.focus();}})()"
        )
        time.sleep(0.35)
        if _focused():
            focused = True
            break
        rect = cdp.eval_js(
            f"(function(){{var a=document.querySelector({json.dumps(input_sel)});if(!a)return null;"
            "var r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}})()"
        )
        if rect:
            cdp.click(int(rect["x"]), int(rect["y"]))
            time.sleep(0.45)
            if _focused():
                focused = True
                break

    if not focused:
        return {"ok": False, "typed": None, "focused": False}

    def _key(vk: int, key: str, code: str, text: Optional[str] = None) -> None:
        down = {"type": "keyDown", "key": key, "code": code,
                "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        if text is not None:
            down["text"] = text
            down["unmodifiedText"] = text
        cdp.send("Input.dispatchKeyEvent", down)
        cdp.send("Input.dispatchKeyEvent", {
            "type": "keyUp", "key": key, "code": code,
            "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
        })

    # Clear any existing value first so a re-sync overwrites cleanly.
    existing = cdp.eval_js(
        f"(function(){{var a=document.querySelector({json.dumps(input_sel)});return a?a.value:'';}})()"
    ) or ""
    for _ in range(len(str(existing)) + 1):
        _key(8, "Backspace", "Backspace")

    # Format the value: drop trailing ".0" so a whole number types as "95".
    val_str = str(int(value)) if float(value).is_integer() else str(value)

    # Type each character via a real key event so Angular's save handler fires.
    code_for = {
        "0": "Digit0", "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4",
        "5": "Digit5", "6": "Digit6", "7": "Digit7", "8": "Digit8", "9": "Digit9",
        ".": "Period", "-": "Minus",
    }
    vk_for = {
        "0": 48, "1": 49, "2": 50, "3": 51, "4": 52, "5": 53, "6": 54, "7": 55,
        "8": 56, "9": 57, ".": 190, "-": 189,
    }
    for ch in val_str:
        _key(vk_for.get(ch, 0), ch, code_for.get(ch, ""), text=ch)
    time.sleep(0.3)

    typed = cdp.eval_js(
        f"(function(){{var a=document.querySelector({json.dumps(input_sel)});return a?a.value:null;}})()"
    )

    # Commit with a real Enter key event (triggers Schoology's save).
    _key(13, "Enter", "Enter", text="\r")
    time.sleep(2.0)

    # VERIFY the save instead of trusting the keystrokes: the cell's aria-label carries the
    # persisted grade ('<student>, <title>, <grade> out of <pts>'); the input value is the
    # fallback for cells without that phrasing (overrides). Poll briefly -- the save is async.
    persisted = False
    for _ in range(6):
        state = cdp.eval_js(
            f"(function(){{var c=document.querySelector({json.dumps(selector)});var a=c?c.querySelector('input'):null;"
            f"return {{aria:c?c.getAttribute('aria-label'):null,val:a?a.value:null}};}})()"
        ) or {}
        aria = str(state.get("aria") or "")
        val = str(state.get("val") or "").strip()
        if f", {val_str} out of" in aria or (val and _same_number(val, val_str)):
            persisted = True
            break
        time.sleep(0.5)

    return {"ok": persisted, "typed": typed, "focused": True,
            **({} if persisted else {"error": f"grade {val_str} did not persist (typed={typed!r})"})}


def _same_number(a: str, b: str) -> bool:
    try:
        return abs(float(a) - float(b)) < 0.05
    except ValueError:
        return a == b


def write_override(cdp: EdgeCDP, row_index: int, value: float, *, gp: bool = True) -> dict:
    """Write the computed quarter grade into the gradebook OVERRIDE column (v3.3).

    The override cell holds the SAME persistent <input class="grade
    grader-edit-input"> as a normal grade cell -- verified live 2026-05-30:
    #grader-grid-cell-gp_override-<row> (and overall_override-<row>), type=text,
    not read-only -- so this reuses the P1b-verified write_grade_to_cell
    mechanism unchanged (focus + Backspace-clear + real key events + Enter).

    gp=True  -> gp_override: the grading-PERIOD (quarter) override. This is the
                official grade that flows to PowerSchool SIS -- the v3 delivery
                target (the computed quarter_grade(pc, work) per student, MP).
    gp=False -> overall_override: the year/overall column.

    Returns write_grade_to_cell's {'ok', 'typed', 'focused'}.

    NOT yet live-smoke-tested (the mechanism is identical to the verified grade
    write, and a test override on a student is not cleanly revertible via this
    path); do a single-shot live verify when there is a real value to write.
    """
    column_key = "gp_override" if gp else "overall_override"
    return write_grade_to_cell(cdp, column_key, row_index, value)


# --------------------------------------------------------------------------- #
# Assignment lookup                                                            #
# --------------------------------------------------------------------------- #

_COLUMN_LOAD_STATE_JS = (
    "(function(){"
    "if (typeof angular === 'undefined') return null;"
    "var cell = document.querySelector('[role=\"gridcell\"][data-x]');"
    "if (!cell) return null;"
    "var s = angular.element(cell).scope();"
    "while (s && s.col_header_num_loaded === undefined) s = s.$parent;"
    "if (!s) return null;"
    "return {loaded: Number(s.col_header_num_loaded), total: Number(s.col_header_ids_total)};"
    "})()"
)

# Step back a little, then to the end: setting scrollLeft to the value it already has is
# not a real scroll, so a grid left at the far right would never load the next batch.
_SCROLL_GRID_TO_END_JS = (
    "(function(){"
    "var body = document.querySelector('.s-js-grid-scrolling-body');"
    "if (!body) return false;"
    "body.scrollLeft = Math.max(0, body.scrollWidth - body.clientWidth - 200);"
    "body.dispatchEvent(new Event('scroll'));"
    "body.scrollLeft = body.scrollWidth;"
    "body.dispatchEvent(new Event('scroll'));"
    "return true;"
    "})()"
)


def load_all_columns(cdp: EdgeCDP, timeout_s: float = 15.0) -> bool:
    """Make the gradebook load every assignment column.

    Schoology loads gradebook columns in batches of 30 and fetches the rest only
    when the grid is scrolled right. Before this, the sync could not see the
    newest columns once a section passed 30 assignments (found 2026-10-02: the
    3.2 Blooket and 3.3 columns were "missing", so their grades never pushed).

    Returns True once every column is loaded; False when the page is not a
    gradebook grid or loading stalls. Cheap when everything is already loaded.
    """
    deadline = time.time() + timeout_s
    brought_to_front = False
    while True:
        state = cdp.eval_js(_COLUMN_LOAD_STATE_JS)
        if not isinstance(state, dict):
            return False
        if state.get("loaded", 0) >= state.get("total", 0):
            return True
        if time.time() > deadline:
            return False
        # The next batch does not load while the rig's Edge window sits behind other
        # windows (document hidden) -- the same trap as the grade write (2026-09-09).
        if not brought_to_front:
            try:
                cdp.send("Page.bringToFront", {})
                cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
            except Exception:  # noqa: BLE001 -- best effort; the load-state poll is the real check
                pass
            brought_to_front = True
        cdp.eval_js(_SCROLL_GRID_TO_END_JS)
        time.sleep(0.8)


def find_assignment_id_by_title(cdp: EdgeCDP, title: str) -> Optional[str]:
    """Scan gradebook column headers for an assignment whose title matches.

    Returns the data-x columnKey string, or None if not found.
    Requires the gradebook page to be loaded and helpers injected.

    Used as a lookup-by-title pre-flight for P2 auto-create to avoid
    creating duplicate assignments (P1b gotcha: 3 duplicate Sync Test 1
    columns appeared when the Add Assignment form was resubmitted).
    """
    load_all_columns(cdp)
    # Robust mapping (P2b RE, 2026-05-29): the row-0 grade cells carry
    #   aria-label="<student>, <assignment title>[, <grade> out of <pts> points]"
    # so we scan [role=gridcell][data-y="0"] and match the ", <title>" segment.
    # A header-title scan fails -- the title elements are ng-binding spans NOT
    # inside a [data-x] ancestor, and [role=columnheader] textContent carries
    # menu cruft.
    found = cdp.eval_js(
        "(function(){"
        "var title = " + json.dumps(title) + ";"
        "var needle = ', ' + title;"
        "var cells = document.querySelectorAll('[role=\"gridcell\"][data-y=\"0\"]');"
        "for (var i = 0; i < cells.length; i++) {"
        "  var al = cells[i].getAttribute('aria-label') || '';"
        "  var idx = al.indexOf(needle);"
        "  if (idx >= 0) {"
        "    var after = al.substring(idx + needle.length);"
        "    if (after === '' || after.charAt(0) === ',') {"
        "      return cells[i].getAttribute('data-x');"
        "    }"
        "  }"
        "}"
        "return null;"
        "})()"
    )
    return found or None


# --------------------------------------------------------------------------- #
# Gradebook marking-period filter (QUARTER_LINE_BY_DUE_DATE_SPEC.md 4.1)       #
# --------------------------------------------------------------------------- #
#
# The gradebook shows ONE marking period at a time, and every read or write the sync
# does (find a column by title, read or write a cell, the gp / gp_override cells) sees
# only that period. Its filter is an Angular select2 on a hidden input, preceded by the
# select2 container whose .select2-chosen names the period; the marking-period column
# header carries the same label; an inline script lists the periods
# (tests/fixtures/schoology-gradebook-apstats-sec1.html, P0 capture):
#   <input select2-change-event="sGraderFilterGradingPeriodChanged" type="hidden" value="1134332">
#   <div role="columnheader" class="... grader-grid-col-header-gp ..."
#        aria-label="Marking Period 4: 4/11/26 - 6/30/26">
#   Drupal.available_grading_periods = ["1134333","1134331","1134334","1134332","all","final","none"]
# Live read-only probe 2026-11-07 ~23:00: both courses open on MP2 (1173889,
# 'Marking Period 2: 11/07/26 - 1/22/27'). The SELECT mechanics below are not verified live
# yet (spec 4.1: the orchestrator's one-shot check on the rig); the VERIFY step is what
# makes a pass safe: a pass that cannot prove its marking period writes nothing.

GRADING_PERIOD_FILTER = 'input[select2-change-event="sGraderFilterGradingPeriodChanged"]'

_GRADING_PERIOD_VIEW_JS = r"""(function(){
  var input = document.querySelector('input[select2-change-event="sGraderFilterGradingPeriodChanged"]');
  var header = document.querySelector('[role="columnheader"].grader-grid-col-header-gp') ||
               document.querySelector('.grader-grid-col-header-gp[aria-label]');
  var chosen = null;
  var box = input ? input.previousElementSibling : null;
  if (box && box.querySelector) {
    var span = box.querySelector('.select2-chosen');
    if (span) chosen = (span.getAttribute('aria-label') || span.textContent || '').trim();
  }
  var available = null;
  try {
    if (window.Drupal && window.Drupal.available_grading_periods) {
      available = [].slice.call(window.Drupal.available_grading_periods).map(String);
    }
  } catch (e) { available = null; }
  return JSON.stringify({gp: input ? String(input.value) : null,
                         header: header ? header.getAttribute('aria-label') : null,
                         chosen: chosen, available: available});
})()"""

# The filter's own link (the select2 container sits right before the hidden input).
_OPEN_PERIOD_FILTER_JS = r"""(function(){
  var input = document.querySelector('input[select2-change-event="sGraderFilterGradingPeriodChanged"]');
  var box = input ? input.previousElementSibling : null;
  var link = box && box.querySelector ? box.querySelector('a.select2-choice') : null;
  if (!link) return null;
  link.scrollIntoView({block: 'center', inline: 'center'});
  var r = link.getBoundingClientRect();
  return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]);
})()"""

_PERIOD_OPTIONS_JS = r"""(function(){
  var drop = document.querySelector('.select2-drop-active') || document.getElementById('select2-drop');
  if (!drop) return null;
  var out = [];
  drop.querySelectorAll('li.select2-result-selectable').forEach(function (li) {
    var label = li.querySelector('.select2-result-label');
    out.push(((label || li).textContent || '').replace(/\s+/g, ' ').trim());
  });
  return JSON.stringify(out);
})()"""

_PERIOD_OPTION_CENTER_JS = r"""(function(index){
  var drop = document.querySelector('.select2-drop-active') || document.getElementById('select2-drop');
  if (!drop) return null;
  var li = drop.querySelectorAll('li.select2-result-selectable')[index];
  if (!li) return null;
  li.scrollIntoView({block: 'nearest'});
  var r = li.getBoundingClientRect();
  return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]);
})(%d)"""

_SELECT2_VAL_JS = r"""(function(id){
  var input = document.querySelector('input[select2-change-event="sGraderFilterGradingPeriodChanged"]');
  var jq = window.jQuery;
  if (!input || !jq || !jq.fn || !jq.fn.select2) return 'select2 API not available';
  try { jq(input).select2('val', id, true); return 'ok'; } catch (e) { return 'select2 error: ' + e.message; }
})(%s)"""

# Row 0's assignment IDENTITY, prefixed by the count of all row-0 cells (0 = no row yet).
# Finding A3 (verifier): Schoology can switch the filter and the header before the new
# period's grid data arrives, so after a switch the grid itself must show something else.
# Finding R4a (Codex re-review): the identity of a cell is its data-x (the column index)
# plus the TITLE part of its aria-label ('<student>, <title>[, <grade> out of <pts>
# points]'), NEVER the score part: a score that changes on the OLD grid (a teacher typing,
# a late save) must not pass for a new marking period. A cell without a title (Schoology's
# empty placeholder cells, aria-label '') carries no identity. The five summary cells
# (overall, gp, ...) sit in every marking period and are left out. Sorted, so the pairs
# read as a set.
_ASSIGNMENT_SIGNATURE_JS = r"""(function(){
  var summary = {overall: 1, overall_override: 1, total_points_awarded: 1, gp: 1, gp_override: 1};
  var cells = document.querySelectorAll('[role="gridcell"][data-y="0"]');
  var parts = [];
  for (var i = 0; i < cells.length; i++) {
    var key = cells[i].getAttribute('data-x') || '';
    if (summary[key]) continue;
    var title = (cells[i].getAttribute('aria-label') || '').split(', ')[1];
    if (!title) continue;
    parts.push(key + '|' + title);
  }
  parts.sort();
  return String(cells.length) + ':' + parts.join('\n');
})()"""

# Every assignment column title on the grid: the second part of a row-0 cell's aria-label
# ('<student>, <title>[, <grade> out of <pts> points]'; titles never hold ', ').
_VISIBLE_TITLES_JS = r"""(function(){
  var summary = {overall: 1, overall_override: 1, total_points_awarded: 1, gp: 1, gp_override: 1};
  var cells = document.querySelectorAll('[role="gridcell"][data-y="0"]');
  var titles = [];
  for (var i = 0; i < cells.length; i++) {
    if (summary[cells[i].getAttribute('data-x') || '']) continue;
    var title = (cells[i].getAttribute('aria-label') || '').split(', ')[1];
    if (title) titles.push(title);
  }
  return JSON.stringify(titles);
})()"""

_MP_RANGE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{2,4})")


def parse_mp_label_range(label) -> Optional[tuple]:
    """'Marking Period 2: 11/07/26 - 1/22/27' -> ('2026-11-07', '2027-01-22'), else None."""
    m = _MP_RANGE_RE.search(str(label or ""))
    if not m:
        return None

    def iso(month, day, year):
        y = int(year)
        y = y + 2000 if y < 100 else y
        return "%04d-%02d-%02d" % (y, int(month), int(day))

    return iso(m.group(1), m.group(2), m.group(3)), iso(m.group(4), m.group(5), m.group(6))


def displayed_grading_period(cdp) -> Optional[dict]:
    """{'gp', 'header', 'chosen', 'available'} of the loaded gradebook (read-only), or None."""
    raw = cdp.eval_js(_GRADING_PERIOD_VIEW_JS)
    if not isinstance(raw, str):
        return None
    try:
        view = json.loads(raw)
    except ValueError:
        return None
    return view if isinstance(view, dict) else None


def grading_period_view_matches(view, grading_period_id, mp_range: Optional[dict] = None) -> Optional[str]:
    """None when the view PROVES the gradebook shows this marking period, else the reason.

    Three independent signs must agree: the hidden filter input holds the id, Drupal lists
    the id as one of the course's periods, and the marking-period column header shows the
    period (its dates must equal mp_range when given).
    """
    want = str(grading_period_id)
    if not isinstance(view, dict):
        return "no marking-period filter on the page"
    if str(view.get("gp")) != want:
        return "the filter holds %r, not %r" % (view.get("gp"), want)
    available = view.get("available")
    if not isinstance(available, list) or want not in [str(a) for a in available]:
        return "Drupal.available_grading_periods does not list %r" % want
    header = view.get("header")
    if not header:
        return "no marking-period column header"
    if mp_range:
        shown = parse_mp_label_range(header)
        if shown != (mp_range.get("start"), mp_range.get("end")):
            return "the header reads %r, not %s - %s" % (header, mp_range.get("start"), mp_range.get("end"))
    return None


def _wait_for_view(cdp, timeout_s: float) -> Optional[dict]:
    """Poll until the gradebook's filter is on the page (the grid renders after load)."""
    deadline = time.time() + timeout_s
    while True:
        view = displayed_grading_period(cdp)
        if view and view.get("gp") is not None:
            return view
        if time.time() >= deadline:
            return view
        time.sleep(0.5)


def _poll_view(cdp, want: str, mp_range: Optional[dict], timeout_s: float) -> Optional[dict]:
    deadline = time.time() + timeout_s
    view = None
    while True:
        view = displayed_grading_period(cdp)
        if grading_period_view_matches(view, want, mp_range) is None:
            return view
        if time.time() >= deadline:
            return view
        time.sleep(0.5)


def _point(raw) -> Optional[tuple]:
    """(x, y) from a JSON '[x, y]', else None."""
    if not isinstance(raw, str):
        return None
    try:
        point = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(point, list) or len(point) != 2:
        return None
    if not all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in point):
        return None
    return point[0], point[1]


def _pick_period_by_click(cdp, want: str, mp_range: Optional[dict]) -> Optional[str]:
    """What a teacher does: open the filter, click the option with the period's dates."""
    if not mp_range:
        return "no date range to find the option by"
    try:
        cdp.send("Page.bringToFront", {})   # clicks need the rig's window in front
    except Exception:  # noqa: BLE001 -- best effort; the verify step is the real check
        pass
    opener = _point(cdp.eval_js(_OPEN_PERIOD_FILTER_JS))
    if opener is None:
        return "the filter's link was not found"
    cdp.click(int(opener[0]), int(opener[1]))
    time.sleep(0.8)
    raw = cdp.eval_js(_PERIOD_OPTIONS_JS)
    try:
        options = json.loads(raw) if isinstance(raw, str) else None
    except ValueError:
        options = None
    if not isinstance(options, list):
        return "the filter's options did not open"
    wanted = (mp_range.get("start"), mp_range.get("end"))
    matches = [i for i, text in enumerate(options) if parse_mp_label_range(text) == wanted]
    if len(matches) != 1:
        return "%d options show %s - %s" % (len(matches), wanted[0], wanted[1])
    target = _point(cdp.eval_js(_PERIOD_OPTION_CENTER_JS % matches[0]))
    if target is None:
        return "the option was not on screen"
    cdp.click(int(target[0]), int(target[1]))
    return None


def _pick_period_by_select2(cdp, want: str, mp_range: Optional[dict]) -> Optional[str]:
    """The select2 API with triggerChange: the directive sees the same change event."""
    outcome = cdp.eval_js(_SELECT2_VAL_JS % json.dumps(want))
    return None if outcome == "ok" else str(outcome or "select2 API returned nothing")


def select_grading_period(cdp, grading_period_id, mp_range: Optional[dict] = None,
                          timeout_s: float = 12.0) -> dict:
    """Show ONE marking period in the loaded gradebook and PROVE it.

    Returns {'ok', 'view', 'method', 'error'}. 'ok' only when grading_period_view_matches
    passes and the grid has settled. Tries a real click on the filter first (what a
    teacher does), then the select2 API. Nothing here writes a grade. The gradebook
    reopens on its default period after any navigation, so callers select after every
    gradebook load.

    After a switch the filter and the header are not enough (finding A3): Schoology may
    switch both before the new period's grid data arrives, and the old period's grid
    would pass. So row 0's assignment identity (column index + title, never a score:
    finding R4a) is read (settled) BEFORE the switch, and after it the set of identities
    must differ, and read the same twice, before 'ok'. A grid with columns turning into
    an empty one is a real change (MP2 has no column before the move); two periods that
    both have no assignment column cannot be told apart: that switch is not ok.

    Already shown (no switch): the grid must still be RENDERED, a student row that reads
    the same twice (finding R4d); a grid that never settles is not ok. Whether its
    columns belong to the period is the caller's check (schoology_sync_section
    PassEvidence, schoology_official read_gradebook: view_content_problem).
    """
    want = str(grading_period_id)
    view = _wait_for_view(cdp, timeout_s)
    if not view or view.get("gp") is None:
        return {"ok": False, "view": view, "method": None,
                "error": "the gradebook has no marking-period filter (page not loaded?)"}
    if grading_period_view_matches(view, want, mp_range) is None:
        return _already_shown(cdp, view)
    available = view.get("available")
    if isinstance(available, list) and want not in [str(a) for a in available]:
        return {"ok": False, "view": view, "method": None,
                "error": "marking period %s is not in Drupal.available_grading_periods" % want}
    before = _settled_grid_signature(cdp)
    if before is None:
        return {"ok": False, "view": view, "method": None,
                "error": "the grid did not show a settled student row before the switch"}
    last_error = "unverified"
    for method, pick in (("click", _pick_period_by_click), ("select2", _pick_period_by_select2)):
        problem = pick(cdp, want, mp_range)
        if problem:
            last_error = "%s: %s" % (method, problem)
            continue
        view = _poll_view(cdp, want, mp_range, timeout_s)
        reason = grading_period_view_matches(view, want, mp_range)
        if reason is None:
            return _settled_after_switch(cdp, view, method, before, want, mp_range)
        last_error = "%s: %s" % (method, reason)
    return {"ok": False, "view": view, "method": None, "error": last_error}


def _already_shown(cdp, view: dict) -> dict:
    """The period is on screen already: 'ok' only once its grid is RENDERED (finding R4d).

    Before this, two reads of an empty page (no row at all, or a grid still loading)
    counted as 'settled', and the caller read an empty marking period.
    """
    if _settled_grid_signature(cdp) is None:
        return {"ok": False, "view": view, "method": "already shown",
                "error": "the grid did not show a settled student row"}
    return {"ok": True, "view": view, "method": "already shown", "error": None}


def _grid_has_rows(signature) -> bool:
    """True for an _ASSIGNMENT_SIGNATURE_JS result ('<row-0 cell count>:...') with cells."""
    if not isinstance(signature, str) or ":" not in signature:
        return False
    count = signature.split(":", 1)[0]
    return count.isdigit() and int(count) > 0


def _grid_identity(signature) -> Optional[frozenset]:
    """The set of 'index|title' pairs of an _ASSIGNMENT_SIGNATURE_JS result (finding R4a),
    or None when the grid shows no student row yet. An empty set = no assignment column."""
    if not _grid_has_rows(signature):
        return None
    pairs = signature.split(":", 1)[1]
    return frozenset(pair for pair in pairs.splitlines() if pair)


def _settled_grid_signature(cdp, rounds: int = 12, pause_s: float = 0.75) -> Optional[str]:
    """Row 0's assignment signature once the grid shows a row and reads the same twice.

    None when it never does. A grid that has not rendered yet must not be the 'before'
    of a switch: the old period's rows arriving late would then look like a change.
    """
    last = None
    for _ in range(rounds):
        signature = cdp.eval_js(_ASSIGNMENT_SIGNATURE_JS)
        if _grid_has_rows(signature):
            if signature == last:
                return signature
            last = signature
        else:
            last = None
        time.sleep(pause_s)
    return None


def _wait_for_new_grid(cdp, before: str, rounds: int = 12, pause_s: float = 0.75) -> bool:
    """True once row 0's set of assignment identities differs from `before`'s and the grid
    reads the same twice (finding R4a: a changed score is not a changed grid)."""
    before_ids = _grid_identity(before)
    last = None
    for _ in range(rounds):
        signature = cdp.eval_js(_ASSIGNMENT_SIGNATURE_JS)
        ids = _grid_identity(signature)
        if ids is not None and ids != before_ids:
            if signature == last:
                return True
            last = signature
        else:
            last = None
        time.sleep(pause_s)
    return False


def _settled_after_switch(cdp, view: dict, method: str, before: str, want: str,
                          mp_range: Optional[dict]) -> dict:
    """'ok' only when the grid changed after the switch, settled, and the filter and the
    header still name the period once it has (finding A3)."""
    if not _wait_for_new_grid(cdp, before):
        return {"ok": False, "view": view, "method": method,
                "error": "the filter and header switched but the grid still shows the previous "
                         "marking period's columns"}
    view = displayed_grading_period(cdp)
    reason = grading_period_view_matches(view, want, mp_range)
    if reason is not None:
        return {"ok": False, "view": view, "method": method, "error": "after the grid settled: " + reason}
    return {"ok": True, "view": view, "method": method, "error": None}


def visible_column_titles(cdp) -> Optional[list]:
    """The assignment column titles on the grid (load_all_columns first), or None."""
    raw = cdp.eval_js(_VISIBLE_TITLES_JS)
    if not isinstance(raw, str):
        return None
    try:
        titles = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(titles, list):
        return None
    return [str(t) for t in titles]


def view_content_problem(cdp, view: dict, expected_titles_here, titles_elsewhere) -> Optional[str]:
    """None when the grid's columns agree with the marking period the view names, else why.

    expected_titles_here / titles_elsewhere: column titles the sync state files in this
    marking period / in another one (rows without a grading_period_id are left out by the
    caller). Wrong when a title filed elsewhere is on the grid, or when none of the
    titles filed here is (while there are some). Both empty: nothing to compare, and the
    page is not read.
    """
    here = set(expected_titles_here or ())
    elsewhere = set(titles_elsewhere or ())
    if not here and not elsewhere:
        return None
    shown = visible_column_titles(cdp)
    if shown is None:
        return "the grid's column titles could not be read"
    shown = set(shown)
    period = (view or {}).get("grading_period_id")
    foreign = sorted(shown & elsewhere)
    if foreign:
        return "the grid shows %d column(s) filed in another marking period (%s), not only %s" % (
            len(foreign), ", ".join(foreign[:3]), period)
    if here and not (shown & here):
        return "none of the %d column(s) filed in marking period %s is on the grid" % (len(here), period)
    return None


def view_content_matches(cdp, view: dict, expected_titles_here, titles_elsewhere) -> bool:
    """True when the grid's columns agree with the view's marking period (finding A3)."""
    return view_content_problem(cdp, view, expected_titles_here, titles_elsewhere) is None


# --------------------------------------------------------------------------- #
# Add Assignment form                                                          #
# --------------------------------------------------------------------------- #

def _wait_for_select_options(cdp: EdgeCDP, wanted: dict, timeout_s: float = 10.0) -> bool:
    """Poll until every select[name] in `wanted` has an <option> whose value matches."""
    checks = " && ".join(
        "(function(){var el=document.querySelector('select[name=\"%s\"]');"
        "return !!el && [].some.call(el.options,function(o){return o.value===%s;});})()"
        % (name, json.dumps(str(value)))
        for name, value in wanted.items()
    )
    deadline = time.time() + timeout_s
    while True:
        if cdp.eval_js("(" + checks + ")"):
            return True
        if time.time() >= deadline:
            return False
        time.sleep(0.25)


def _form_mismatch(cdp: EdgeCDP, expected: dict) -> Optional[str]:
    """Return 'selector=got (wanted x)' for the first field whose live value differs, else None."""
    for selector, value in expected.items():
        got = cdp.eval_js(
            "(function(){var el=document.querySelector(%s);return el ? String(el.value) : null;})()"
            % json.dumps(selector)
        )
        if got != str(value):
            return "%s=%r (wanted %r)" % (selector, got, str(value))
    return None


def add_assignment(
    cdp: EdgeCDP,
    course_id: str,
    *,
    title: str,
    points: int = 100,
    category_id: str,
    grading_period_id: str,
    due_date: Optional[str] = None,
    publish_scores: bool = True,
    sync_to_sis: bool = True,
) -> dict:
    """Navigate to the Add Assignment form and submit it.

    Fills form id s-grade-item-add-form per the P0 Q4 schema:
      - title (text, required)
      - max_points (default 100)
      - grading_category_id (select-one)
      - grading_period_id (select-one)
      - due_date[date] (optional, YYYY-MM-DD)
      - publish_scores (checkbox, checked when publish_scores=True)
      - sync_to_sis_wrapper[sync_to_sis_option] (checkbox, checked when sync_to_sis=True)

    Sets <select>/<input> values via JS + dispatches change/input events,
    then submits by clicking input#edit-submit (op=Create).

    Returns {'ok': bool, 'assignment_id': str|None, 'error': str|None}.
    assignment_id is captured from the post-submit URL or DOM if possible;
    if not capturable, returns None with ok=True (caller falls back to
    find_assignment_id_by_title).

    s121 teacher decision: sync_to_sis ALWAYS True, publish_scores ALWAYS True.
    """
    cdp.attach_url(add_assignment_url(course_id), wait_ms=3000)

    # Verify the form is present.
    form_present = cdp.eval_js("!!document.querySelector('form#s-grade-item-add-form')")
    if not form_present:
        return {"ok": False, "assignment_id": None, "error": "Add Assignment form not found"}

    # Wait for the category/period <select>s to carry the options we are about to pick.
    # 2026-09-15: the FIRST create after a cold form load failed twice in a row
    # ('1.5 Follow-Along', Period B) while the next creates in the same run succeeded.
    # Setting select.value with no matching option leaves it blank and the submit never
    # completes, so poll for the options (~10 s) instead of filling a half-rendered form.
    ready = _wait_for_select_options(cdp, {
        "grading_category_id": str(category_id),
        "grading_period_id": str(grading_period_id),
    })
    if not ready:
        return {"ok": False, "assignment_id": None,
                "error": "Add Assignment form did not load its category/period options"}

    def _set_input(name: str, val: str) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('input[name=\"{name}\"], textarea[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.value = {json.dumps(val)};"
            "  el.dispatchEvent(new Event('input',  {bubbles:true}));"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    def _set_select(name: str, val: str) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('select[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.value = {json.dumps(val)};"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    def _set_checkbox(name: str, checked: bool) -> None:
        js = (
            "(function(){"
            f"  var el = document.querySelector('input[name=\"{name}\"]');"
            "  if (!el) return;"
            f"  el.checked = {json.dumps(checked)};"
            "  el.dispatchEvent(new Event('change', {bubbles:true}));"
            "})()"
        )
        cdp.eval_js(js)

    _set_input("title", title)
    _set_input("max_points", str(points))
    _set_select("grading_category_id", category_id)
    _set_select("grading_period_id", grading_period_id)
    if due_date:
        # Schoology's datepicker expects m/dd/y (e.g. 5/15/26), NOT ISO --
        # submitting an ISO YYYY-MM-DD value yields "Field Due date is invalid".
        due_fmt = due_date
        try:
            y, mo, d = due_date.split("-")
            due_fmt = f"{int(mo)}/{d}/{y[2:]}"
        except (ValueError, AttributeError):
            pass
        _set_input("due_date[date]", due_fmt)
        # A date with no time fails validation ("A time is required to enable
        # submissions"), so default to end-of-day.
        _set_input("due_date[time]", "11:59pm")
    _set_checkbox("publish_scores", publish_scores)
    _set_checkbox("sync_to_sis_wrapper[sync_to_sis_option]", sync_to_sis)

    time.sleep(0.5)

    # Read the form back before submitting: a silently-rejected select value must be a
    # clear error, not a create that never confirms.
    mismatch = _form_mismatch(cdp, {
        "input[name=\"title\"]": title,
        "select[name=\"grading_category_id\"]": str(category_id),
        "select[name=\"grading_period_id\"]": str(grading_period_id),
    })
    if mismatch:
        return {"ok": False, "assignment_id": None, "error": "Add Assignment form rejected " + mismatch}

    # Submit with a JS click on input#edit-submit (op=Create). Live smoke
    # 2026-05-30: a coordinate-click MISSED -- the long form put the button below
    # the fold and the create never fired -- while a JS .click() fired reliably
    # and includes the button's name/value, so Drupal still gets op=Create. Click
    # ONCE (re-clicking could double-create if the submit is slow); detection of
    # the result is handled below.
    clicked = cdp.eval_js(
        "(function(){var el=document.querySelector('input#edit-submit');"
        "if(!el)return false;el.click();return true;})()"
    )
    if not clicked:
        return {"ok": False, "assignment_id": None, "error": "Submit button not found"}

    # Detection is BEST-EFFORT. A successful submit returns a TRANSIENT JSON blob
    #   {"assignment_nid":"<id>","path":"assignment-creation-complete",...}
    # that the page redirects away from quickly, so it is easy to miss -- and
    # Schoology's gradebook/materials lists are eventually-consistent, so they
    # don't reflect a brand-new create synchronously either. We therefore poll
    # Network response bodies first, then the DOM JSON (and validation errors),
    # but do NOT re-click (re-clicking could double-create). The network
    # fast-path is immune to gradebook DOM lag; live verification is still gated
    # to the single-host Schoology rig. The RELIABILITY mechanism remains the
    # idempotent sync: a re-run reconciles via find_assignment_id_by_title once
    # the column has rendered. So `ok`/`assignment_id` here are a fast-path, not
    # a guarantee.
    import re
    assignment_id = None
    created = False

    # The create POSTs to /course/<id>/materials/assignments/add?is_popup=1, so
    # match THAT url. "assignment-creation-complete" is a token in the JSON
    # response BODY, not the url. Live-verified 2026-05-30: with a reliable
    # submit, this filter matches that one response (out of ~100) and
    # getResponseBody returns the JSON (status 200, assignment_nid present) --
    # the is_popup form yields a normal capturable response, not an evicted
    # navigation, so the fast-path fires. The DOM poll below + find-by-title
    # reconciliation stay as fallback / safety net.
    if hasattr(cdp, "wait_for_response"):
        try:
            captured = cdp.wait_for_response("materials/assignments/add", timeout=8.0)
        except Exception:
            captured = None
        if captured:
            try:
                payload = json.loads(captured.get("body") or "{}")
                nid = payload.get("assignment_nid")
                if nid:
                    assignment_id = str(nid)
                    created = True
            except (TypeError, ValueError):
                pass

    if not created:
        for _ in range(16):  # poll ~5s
            time.sleep(0.3)
            body = cdp.eval_js("(document.body && document.body.textContent) || ''") or ""
            m = re.search(r'"assignment_nid"\s*:\s*"?(\d+)"?', body)
            if m:
                assignment_id = m.group(1)
            if assignment_id or ("assignment-creation-complete" in body):
                created = True
                break
            error_text = cdp.eval_js(
                "(function(){var el=document.querySelector('.messages.error, "
                ".error-messages, .form-item--error-message');"
                "return el ? el.textContent.trim() : null;})()"
            )
            if error_text:
                return {"ok": False, "assignment_id": None, "error": error_text}

    return {"ok": created, "assignment_id": assignment_id,
            "error": None if created else "create not confirmed (best-effort; reconcile via re-sync)"}


def delete_assignment(cdp: EdgeCDP, nid: str, *, course_id: Optional[str] = None,
                      title: Optional[str] = None) -> dict:
    """Delete an assignment by its node id (P2b RE, 2026-05-30).

    GET /assignment/delete/<nid> renders a Drupal confirm form
    (id s-grade-item-delete-form) with a single "Delete" submit
    (input#edit-submit, op=Delete). Clicking it confirms -- and deletes ALL
    grades for the assignment. Returns {'ok': bool, 'error': str|None}.

    Verification: pass course_id + title to verify against GRADEBOOK TRUTH --
    the column is gone iff find_assignment_id_by_title returns None. The
    confirm-form-on-reload check is a FALSE-NEGATIVE: live smoke 2026-05-30
    showed the "Are you sure" form re-renders/caches even after a successful
    delete (the action URL does NOT redirect), so it is only the fallback when
    course_id/title are absent. The submit is a real COORDINATE click: the Drupal
    delete-confirm form does NOT submit on a JS .click() (verified 2026-05-31) --
    unlike the long add form (which needs JS click to dodge a below-the-fold
    miss), the short delete form needs the trusted gesture. It retries (the
    coordinate click is occasionally flaky), and deleting an already-gone
    assignment is a no-op, so the retry is safe.
    """
    for _ in range(3):
        cdp.attach_url(f"{SCHOOLOGY_BASE}/assignment/delete/{nid}", wait_ms=3000)
        if not cdp.eval_js("!!document.querySelector('form#s-grade-item-delete-form')"):
            return {"ok": True, "error": None}  # gone (deleted, or never existed)
        # Coordinate click (NOT a JS .click()): the Drupal delete-confirm form
        # does not submit on el.click() (verified 2026-05-31), unlike the add
        # form. The button is short / in view, so no below-the-fold miss here.
        cdp.eval_js(
            "(function(){var el=document.querySelector('input#edit-submit');"
            "if(el)el.scrollIntoView({block:'center',inline:'center'});})()"
        )
        time.sleep(0.3)
        rect = cdp.eval_js(
            "(function(){var el=document.querySelector('input#edit-submit');"
            "if(!el)return null;var r=el.getBoundingClientRect();"
            "return {x:r.left+r.width/2,y:r.top+r.height/2};})()"
        )
        if rect:
            cdp.click(int(rect["x"]), int(rect["y"]))
            time.sleep(2.5)

    # Final verify. Prefer gradebook truth when we have the course + title: the
    # column is gone iff find_assignment_id_by_title returns None. (The
    # confirm-form check below is a known false-negative -- see the docstring.)
    if course_id and title:
        for _ in range(3):
            cdp.attach_url(gradebook_url(course_id), wait_ms=4000)
            inject_helpers(cdp)
            if find_assignment_id_by_title(cdp, title) is None:
                return {"ok": True, "error": None}
            time.sleep(0.5)
        return {"ok": False, "error": "assignment still present in gradebook after delete retries"}

    cdp.attach_url(f"{SCHOOLOGY_BASE}/assignment/delete/{nid}", wait_ms=2500)
    gone = not cdp.eval_js("!!document.querySelector('form#s-grade-item-delete-form')")
    return {"ok": gone, "error": None if gone else "assignment still present after delete retries"}


# --------------------------------------------------------------------------- #
# Grade setup readers                                                          #
# --------------------------------------------------------------------------- #

def list_categories(cdp: EdgeCDP, course_id: str) -> dict:
    """Navigate to grade setup and return {category_name: category_id}.

    The weight inputs are named categories[<id>][weight]; each category
    row also carries the category name in its title input or row text.
    Returns an empty dict on parse failure.
    """
    cdp.attach_url(f"{SCHOOLOGY_BASE}/course/{course_id}/gradesetup", wait_ms=3000)

    result = cdp.eval_js(
        "(function(){"
        "  var out = {};"
        # Weight inputs: name="categories[<id>][weight]"
        "  var inputs = document.querySelectorAll('input[name*=\"categories[\"]');"
        "  for (var i = 0; i < inputs.length; i++) {"
        "    var inp = inputs[i];"
        "    var m = inp.name.match(/categories\\[(\\d+)\\]/);"
        "    if (!m) continue;"
        "    var id = m[1];"
        # Walk up to the row container and look for the title input or text.
        "    var row = inp.closest('tr, .category-row, li, .form-item');"
        "    if (!row) row = inp.parentElement;"
        "    var nameEl = row.querySelector('input[name*=\"[title]\"], "
        "input[name*=\"[name]\"]');"
        "    var name = nameEl ? nameEl.value.trim() : '';"
        "    if (!name) {"
        "      var spans = row.querySelectorAll('.title, .category-title, td, th');"
        "      for (var j = 0; j < spans.length; j++) {"
        "        var t = spans[j].textContent.trim();"
        "        if (t && t.length < 80) { name = t; break; }"
        "      }"
        "    }"
        "    if (name && id) out[name] = id;"
        "  }"
        "  return out;"
        "})()"
    )
    return result or {}


def list_marking_periods(cdp: EdgeCDP, course_id: str) -> dict:
    """Navigate to the Add Assignment form and read the grading_period_id select.

    Returns { grading_period_id(str): {'start':'YYYY-MM-DD','end':'YYYY-MM-DD'} }.

    First tries to read Drupal.settings grading_period_dates (a JSON map
    { id: {start: ISO8601, end: ISO8601} }). Falls back to parsing the
    select option text (format 'MP N: M/D/YY - M/D/YY').

    The IDs are per-section and differ between AP Stats Sec 1 and Sec 2;
    call this once per course_id at the start of a sync run.
    """
    cdp.attach_url(add_assignment_url(course_id), wait_ms=3000)

    # First try Drupal.settings (if the page exposes it).
    drupal_result = cdp.eval_js(
        "(function(){"
        "  try {"
        "    var s = Drupal.settings;"
        "    if (!s) return null;"
        "    var gp = s.grading_period_dates || (s.s_common && s.s_common.grading_period_dates);"
        "    if (!gp) return null;"
        "    var out = {};"
        "    for (var id in gp) {"
        "      var e = gp[id];"
        "      if (!e) continue;"
        "      var start = e.start || e.start_date || '';"
        "      var end   = e.end   || e.end_date   || '';"
        "      if (start && end) {"
        "        out[String(id)] = {"
        "          start: start.substring(0, 10),"
        "          end:   end.substring(0, 10)"
        "        };"
        "      }"
        "    }"
        "    return Object.keys(out).length ? out : null;"
        "  } catch(_) { return null; }"
        "})()"
    )
    if drupal_result:
        return drupal_result

    # Fallback: parse the <select name="grading_period_id"> options.
    # Option text format: "MP N: M/D/YY - M/D/YY"
    select_result = cdp.eval_js(
        "(function(){"
        "  var sel = document.querySelector('select[name=\"grading_period_id\"]');"
        "  if (!sel) return null;"
        "  var out = {};"
        "  var opts = sel.querySelectorAll('option');"
        "  for (var i = 0; i < opts.length; i++) {"
        "    var val = opts[i].value;"
        "    if (!val) continue;"
        "    var text = opts[i].textContent || '';"
        "    var m = text.match(/(\\d+)\\/(\\d+)\\/(\\d{2,4})\\s*-\\s*(\\d+)\\/(\\d+)\\/(\\d{2,4})/);"
        "    if (!m) continue;"
        "    function twoDigitYear(y) { return y < 100 ? 2000 + y : y; }"
        "    function pad(n) { return String(n).padStart(2,'0'); }"
        "    var sy = twoDigitYear(parseInt(m[3],10));"
        "    var ey = twoDigitYear(parseInt(m[6],10));"
        "    var start = sy+'-'+pad(m[1])+'-'+pad(m[2]);"
        "    var end   = ey+'-'+pad(m[4])+'-'+pad(m[5]);"
        "    out[String(val)] = {start: start, end: end};"
        "  }"
        "  return Object.keys(out).length ? out : null;"
        "})()"
    )
    return select_result or {}

# --------------------------------------------------------------------------- #
# Materials folders (2026-09-16: every synced assignment lives in "Assignments")
# --------------------------------------------------------------------------- #

ASSIGNMENTS_FOLDER_TITLE = "Assignments"

# One row per material at one folder level. Assignment rows carry a Move link
# /materials/move/<nid>; folder rows carry /materials/folder/<nid>/move. Titles come
# from the item's own link, skipping Schoology's "Next"/"Prev" item-to-item links
# (which point at neighbouring materials and would otherwise be read as titles).
_LIST_MATERIALS_JS = r"""(function(){
  var out = [], seen = {};
  function title(sel) {
    var best = '';
    document.querySelectorAll(sel).forEach(function (a) {
      var t = (a.textContent || '').replace(/\s+/g, ' ').trim().replace(/^Folder\./, '');
      if (!t || /^(Next|Prev)$/.test(t)) return;
      if (t.length > best.length) best = t;
    });
    return best;
  }
  document.querySelectorAll('a.move-material').forEach(function (a) {
    var m = (a.getAttribute('href') || '').match(/materials\/move\/(\d+)/);
    if (!m || seen[m[1]]) return;
    seen[m[1]] = 1;
    // The item's own link ends in /assignment/<nid>; action-menu links (…/library_save) do not.
    var isAssignment = !!document.querySelector('a[href$="/assignment/' + m[1] + '"]');
    out.push({ nid: m[1], kind: isAssignment ? 'assignment' : 'other',
               title: isAssignment ? title('a[href$="/assignment/' + m[1] + '"]') : '' });
  });
  document.querySelectorAll('a[href*="/materials/folder/"][href$="/move"]').forEach(function (a) {
    var m = (a.getAttribute('href') || '').match(/materials\/folder\/(\d+)\/move/);
    if (!m || seen[m[1]]) return;
    seen[m[1]] = 1;
    out.push({ nid: m[1], kind: 'folder', title: title('a[href*="/materials?f=' + m[1] + '"]') });
  });
  return out;
})()"""


def materials_url(course_id: str, folder_id: str | None = None) -> str:
    url = f"{SCHOOLOGY_BASE}/course/{course_id}/materials"
    return url + (f"?f={folder_id}" if folder_id else "")


def list_materials(cdp: EdgeCDP, course_id: str, folder_id: str | None = None) -> list:
    """Return [{nid, title, kind}] ('assignment' | 'folder' | 'other') at one materials level."""
    cdp.attach_url(materials_url(course_id, folder_id), wait_ms=3000)
    return cdp.eval_js(_LIST_MATERIALS_JS) or []


def find_folder_id(cdp: EdgeCDP, course_id: str, title: str = ASSIGNMENTS_FOLDER_TITLE) -> Optional[str]:
    for item in list_materials(cdp, course_id):
        if item.get("kind") == "folder" and item.get("title") == title:
            return item["nid"]
    return None


def create_folder(cdp: EdgeCDP, course_id: str, title: str = ASSIGNMENTS_FOLDER_TITLE) -> Optional[str]:
    """Create a published top-level materials folder; return its nid (via a re-list) or None."""
    cdp.attach_url(f"{SCHOOLOGY_BASE}/course/{course_id}/materials/folder/create", wait_ms=3000)
    present = cdp.eval_js("!!document.querySelector('form#s-course-materials-folder-create-form')")
    if not present:
        return None
    cdp.eval_js(
        "(function(){var el=document.querySelector('form#s-course-materials-folder-create-form input[name=\"title\"]');"
        "if(!el)return;el.value=" + json.dumps(title) + ";"
        "el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()"
    )
    time.sleep(0.3)
    cdp.eval_js("(function(){var el=document.querySelector('form#s-course-materials-folder-create-form input[type=submit]');if(el)el.click();})()")
    time.sleep(3)
    return find_folder_id(cdp, course_id, title)


def delete_empty_folder(cdp: EdgeCDP, course_id: str, folder_id: str) -> dict:
    """Delete a materials folder, refusing unless it is empty. Returns {ok, error}."""
    if list_materials(cdp, course_id, folder_id):
        return {"ok": False, "error": f"folder {folder_id} is not empty"}
    cdp.attach_url(f"{SCHOOLOGY_BASE}/course/{course_id}/materials/folder/{folder_id}/delete", wait_ms=3000)
    clicked = cdp.eval_js(
        "(function(){var el=document.querySelector('form#s-course-materials-folder-action-form input#edit-submit');"
        "if(!el)return false;el.click();return true;})()"
    )
    if not clicked:
        return {"ok": False, "error": "delete confirm form not found"}
    time.sleep(3)
    still = any(f["nid"] == str(folder_id) for f in list_materials(cdp, course_id) if f["kind"] == "folder")
    return {"ok": not still, "error": "folder still listed after delete" if still else None}


def move_material(cdp: EdgeCDP, course_id: str, nid: str, folder_id: str, attempts: int = 2) -> dict:
    """Move one top-level material into a folder via its Move form and VERIFY it left the root.

    2026-09-16: a submitted Move form occasionally did not take (2 of 14 in the first pass),
    so the move is confirmed by re-listing the root and retried once.
    """
    error = None
    for _ in range(attempts):
        cdp.attach_url(f"{SCHOOLOGY_BASE}/course/{course_id}/materials/move/{nid}", wait_ms=3000)
        if not _wait_for_select_options(cdp, {"destination_folder": str(folder_id)}, timeout_s=8.0):
            return {"ok": False, "error": f"Move form for {nid} has no folder option {folder_id}"}
        cdp.eval_js(
            "(function(){var el=document.querySelector('select[name=\"destination_folder\"]');"
            "el.value=" + json.dumps(str(folder_id)) + ";el.dispatchEvent(new Event('change',{bubbles:true}));})()"
        )
        time.sleep(0.3)
        mismatch = _form_mismatch(cdp, {"select[name=\"destination_folder\"]": str(folder_id)})
        if mismatch:
            return {"ok": False, "error": "Move form rejected " + mismatch}
        cdp.eval_js("(function(){var el=document.querySelector('form#s-course-materials-folders-move-item-form input[type=submit]');if(el)el.click();})()")
        time.sleep(3)
        if not any(item["nid"] == str(nid) for item in list_materials(cdp, course_id)):
            return {"ok": True, "error": None}
        error = f"{nid} still at the materials root after Move"
    return {"ok": False, "error": error}


def move_assignments_into_folder(cdp: EdgeCDP, course_id: str, title: str = ASSIGNMENTS_FOLDER_TITLE,
                                 only_nids: Optional[set] = None) -> dict:
    """Ensure the folder exists and move every top-level assignment (or just only_nids) into it."""
    folder_id = find_folder_id(cdp, course_id, title) or create_folder(cdp, course_id, title)
    if not folder_id:
        return {"ok": False, "folder_id": None, "moved": [], "errors": [f"Could not find or create folder {title!r}"]}
    moved, errors = [], []
    for item in list_materials(cdp, course_id):
        if item.get("kind") != "assignment":
            continue
        if only_nids is not None and item["nid"] not in only_nids:
            continue
        result = move_material(cdp, course_id, item["nid"], folder_id)
        if result["ok"]:
            moved.append(item)
        else:
            errors.append(result["error"])
    return {"ok": not errors, "folder_id": folder_id, "moved": moved, "errors": errors}
