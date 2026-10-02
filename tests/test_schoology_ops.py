"""Unit tests for schoology_ops create/delete logic.

Fake cdp only -- no browser, no live Schoology. Pins the two fixes from the
2026-05-30 live smoke: the create fast-path URL filter, and delete verification
against gradebook truth instead of the false-negative confirm-form check.
"""
from __future__ import annotations

import json
import os
import sys
import types
import unittest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))
sys.path.insert(0, os.path.join(REPO_ROOT, "tools", "cdp"))

# edge.py imports websocket-client at module load; stub it so importing
# schoology_ops succeeds without the real package (matches test_cdp_edge_network).
sys.modules.setdefault(
    "websocket",
    types.SimpleNamespace(WebSocketTimeoutException=TimeoutError, create_connection=None),
)

import re
import schoology_ops as ops  # noqa: E402
from unittest import mock  # noqa: E402


class FakeCDP:
    """Stand-in for EdgeCDP that scripts eval_js + wait_for_response."""

    def __init__(self, *, wfr_result=None, body_text="",
                 delete_form_present=False, title_lookup=None,
                 select_ready=True, reject_fields=(), materials=None, stubborn=()):
        self.wfr_result = wfr_result
        self.wfr_calls = []
        self.body_text = body_text
        self.delete_form_present = delete_form_present
        self.title_lookup = title_lookup     # what find_assignment_id_by_title sees
        self.select_ready = select_ready     # do the <select>s carry the wanted options?
        self.reject_fields = set(reject_fields)   # field names whose set value is silently dropped
        self.form_values = {}                # name -> value the form actually holds
        # materials: {folder_id_or_None: [rows]} served to list_materials by the page URL.
        self.materials = materials if materials is not None else {None: []}
        self.stubborn = set(stubborn)        # nids whose Move submit never takes
        self.current_url = None
        self.clicks = []
        self.urls = []
        self.evals = []

    def attach_url(self, url, wait_ms=0):
        self.urls.append(url)
        self.current_url = url

    def click(self, x, y):
        self.clicks.append((x, y))

    def wait_for_response(self, url_substring, timeout=15.0):
        self.wfr_calls.append(url_substring)
        return self.wfr_result

    def eval_js(self, expr):
        self.evals.append(expr)
        if "s-grade-item-add-form" in expr:
            return True
        # list_materials: rows for the folder named in the current page URL.
        if "a.move-material" in expr and "var out = [], seen = {}" in expr:
            m = re.search(r"[?&]f=([^&]+)", self.current_url or "")
            return list(self.materials.get(m.group(1) if m else None, []))
        # Move / delete form submits mutate the scripted materials.
        if "move-item-form" in expr and "click()" in expr:
            m = re.search(r"materials/move/([^/?]+)", self.current_url or "")
            nid = m.group(1) if m else None
            dest = self.form_values.get("destination_folder")
            if nid and nid not in self.stubborn:
                row = next((r for r in self.materials.get(None, []) if r["nid"] == nid), None)
                if row:
                    self.materials[None].remove(row)
                    self.materials.setdefault(dest, []).append(row)
            return None
        if "folder-action-form" in expr and "click()" in expr:
            m = re.search(r"materials/folder/([^/]+)/delete", self.current_url or "")
            if m:
                self.materials[None] = [r for r in self.materials.get(None, []) if r["nid"] != m.group(1)]
            return True
        # add_assignment readiness poll: every wanted <option> present?
        if "el.options" in expr:
            return self.select_ready
        # add_assignment form fill: remember what the form now holds (unless rejected).
        m = re.search(r'\[name="([^"]+)"\]', expr)
        if m and re.search(r'el\.value\s*=\s*"', expr):
            v = re.search(r'el\.value\s*=\s*(".*?");', expr)
            if m.group(1) not in self.reject_fields and v:
                self.form_values[m.group(1)] = json.loads(v.group(1))
            return None
        # add_assignment read-back before submit.
        if "String(el.value)" in expr:
            sel = re.search(r'querySelector\((".*?")\)', expr)
            name = re.search(r'\[name="([^"]+)"\]', json.loads(sel.group(1))) if sel else None
            return self.form_values.get(name.group(1)) if name else None
        if "s-grade-item-delete-form" in expr:
            return self.delete_form_present
        if "getBoundingClientRect" in expr:   # submit rect (delete coordinate click)
            return {"x": 10, "y": 10}
        if "edit-submit" in expr:             # JS submit click (add) / scrollIntoView
            return True
        if "document.body" in expr and "textContent" in expr:
            return self.body_text
        if "gridcell" in expr:                # find_assignment_id_by_title scan
            return self.title_lookup
        return None


class TestAddAssignmentFilter(unittest.TestCase):
    def test_fastpath_uses_corrected_filter(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "999"})})
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertEqual(res, {"ok": True, "assignment_id": "999", "error": None})
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])
        self.assertNotIn("assignment-creation-complete", fake.wfr_calls)

    def test_falls_back_to_dom_poll_when_capture_misses(self):
        body = json.dumps({"assignment_nid": "777", "path": "assignment-creation-complete"})
        fake = FakeCDP(wfr_result=None, body_text=body)
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertTrue(res["ok"])
        self.assertEqual(res["assignment_id"], "777")
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])

    def test_submit_uses_js_click_not_coordinate(self):
        # Live smoke showed the coordinate-click missed; the submit is now a JS
        # click on input#edit-submit (no cdp.click(x,y)).
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})})
        ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertEqual(fake.clicks, [])
        self.assertTrue(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_waits_for_select_options_and_never_submits_a_half_rendered_form(self):
        # 2026-09-15: the first create after a cold form load failed twice because the
        # category <select> had no options yet; the value went blank and the submit hung.
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})}, select_ready=False)
        with mock.patch.object(ops.time, "sleep"), mock.patch.object(ops.time, "time",
                                                                     side_effect=[0, 0, 5, 11, 12, 13]):
            res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("category/period options", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))
        self.assertEqual(fake.wfr_calls, [])

    def test_reads_the_form_back_and_refuses_a_rejected_select_value(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})},
                       reject_fields=("grading_category_id",))
        res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("rejected", res["error"])
        self.assertIn("grading_category_id", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_corrected_filter_matches_real_post_url(self):
        # Documents the root cause: the filter must match the POST URL, not the
        # JSON body token that lives only inside the response.
        url = "/course/123/materials/assignments/add?is_popup=1"
        self.assertIn("materials/assignments/add", url)
        self.assertNotIn("assignment-creation-complete", url)


class TestAssignmentsFolder(unittest.TestCase):
    """Materials-folder ops (2026-09-16): moves are verified against the root and retried."""

    def _root(self):
        return {None: [
            {"nid": "F1", "kind": "folder", "title": "Assignments"},
            {"nid": "A1", "kind": "assignment", "title": "1.1 Follow-Along"},
            {"nid": "A2", "kind": "assignment", "title": "1.1 Blooket"},
            {"nid": "D1", "kind": "other", "title": ""},
        ]}

    def test_moves_every_top_level_assignment_and_leaves_other_materials(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertTrue(res["ok"])
        self.assertEqual(res["folder_id"], "F1")
        self.assertEqual(sorted(m["nid"] for m in res["moved"]), ["A1", "A2"])
        self.assertEqual([r["nid"] for r in fake.materials[None]], ["F1", "D1"])
        self.assertEqual(sorted(r["nid"] for r in fake.materials["F1"]), ["A1", "A2"])

    def test_only_nids_limits_the_move(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123", only_nids={"A2"})
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertIn("A1", [r["nid"] for r in fake.materials[None]])

    def test_a_move_that_never_takes_is_retried_then_reported(self):
        fake = FakeCDP(materials=self._root(), stubborn={"A1"})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertFalse(res["ok"])
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertEqual(len(res["errors"]), 1)
        self.assertIn("A1", res["errors"][0])
        self.assertEqual(sum(1 for u in fake.urls if u.endswith("/materials/move/A1")), 2)

    def test_delete_refuses_a_non_empty_folder(self):
        fake = FakeCDP(materials={None: [{"nid": "F1", "kind": "folder", "title": "Assignments"}],
                                  "F1": [{"nid": "A1", "kind": "assignment", "title": "x"}]})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.delete_empty_folder(fake, "123", "F1")
        self.assertFalse(res["ok"])
        self.assertIn("not empty", res["error"])
        self.assertFalse(any(u.endswith("/delete") for u in fake.urls))

    def test_delete_removes_an_empty_folder(self):
        fake = FakeCDP(materials={None: [{"nid": "F1", "kind": "folder", "title": "Assignments"}], "F1": []})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.delete_empty_folder(fake, "123", "F1")
        self.assertTrue(res["ok"])
        self.assertEqual(fake.materials[None], [])


class TestDeleteVerify(unittest.TestCase):
    def test_uses_gradebook_truth_over_lying_confirm_form(self):
        # Confirm form ALWAYS renders (the false-negative), but the gradebook
        # shows the column gone -> delete should report ok=True.
        fake = FakeCDP(delete_form_present=True, title_lookup=None)
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertEqual(res, {"ok": True, "error": None})

    def test_reports_present_when_gradebook_still_shows_column(self):
        fake = FakeCDP(delete_form_present=True, title_lookup="col-7")
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertFalse(res["ok"])
        self.assertIn("gradebook", res["error"])

    def test_without_course_title_falls_back_to_form_check(self):
        fake = FakeCDP(delete_form_present=True)
        res = ops.delete_assignment(fake, "555")
        self.assertFalse(res["ok"])
        self.assertIn("after delete retries", res["error"])

    def test_early_success_when_confirm_form_absent(self):
        fake = FakeCDP(delete_form_present=False)
        res = ops.delete_assignment(fake, "555")
        self.assertTrue(res["ok"])


class TestWriteOverride(unittest.TestCase):
    def _capture(self):
        calls = []
        orig = ops.write_grade_to_cell
        ops.write_grade_to_cell = lambda cdp, col, row, val: (
            calls.append((col, row, val)), {"ok": True})[1]
        self.addCleanup(lambda: setattr(ops, "write_grade_to_cell", orig))
        return calls

    def test_gp_override_by_default(self):
        calls = self._capture()
        res = ops.write_override(None, 2, 95)
        self.assertEqual(calls, [("gp_override", 2, 95)])
        self.assertTrue(res["ok"])

    def test_overall_override_when_gp_false(self):
        calls = self._capture()
        ops.write_override(None, 4, 88, gp=False)
        self.assertEqual(calls, [("overall_override", 4, 88)])


class TestCommentDrafts(unittest.TestCase):
    def test_unreadable_grade_stops_before_clicking_or_typing(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={"ok": True}), \
                mock.patch.object(ops, "read_grade_from_cell", return_value=None), \
                mock.patch.object(fake, "eval_js", return_value=None):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn("unreadable", result["reason"])
        self.assertEqual(fake.clicks, [])
        fake.send.assert_not_called()

    def test_close_reopen_verification_and_real_keys_without_enter(self):
        for reopened_text, verified in (("x", True), ("old", False)):
            fake = FakeCDP()
            fake.send = mock.Mock()
            editor = {"text": "old", "focused": True, "editable": True,
                      "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30},
                      "checked": True}
            reads = [None, editor, editor, editor, editor, {**editor, "text": "x"},
                     None, None, {**editor, "text": reopened_text}, None]
            # A mismatch returns before the final closed-editor read.
            if not verified:
                reads.pop()
            with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
                "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
            }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                    mock.patch.object(fake, "eval_js", side_effect=reads), mock.patch.object(ops.time, "sleep"):
                result = ops.write_cell_comment(fake, "col1", 2, "x")
            self.assertEqual(result["verified"], verified, result)
            keys = [c.args[1] for c in fake.send.call_args_list if c.args[0] == "Input.dispatchKeyEvent"]
            self.assertEqual([k["key"] for k in keys if k["type"] == "keyDown"], ["a", "Backspace", "x"])
            self.assertFalse(any(k.get("key") == "Enter" or k.get("windowsVirtualKeyCode") == 13 for k in keys))
            self.assertEqual(fake.clicks.count((10, 10)), 2)

    def test_icon_failure_falls_back_to_context_without_typing(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": {"x": 5, "y": 5}},
            "icons": [{"rect": {"x": 10, "y": 10}}], "menuItems": []
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", return_value=None), mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn((10, 10), fake.clicks)
        self.assertTrue(any(c.args[0] == "Input.dispatchMouseEvent" for c in fake.send.call_args_list))
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_lost_textarea_focus_never_types_into_grade(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "", "focused": False, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn("lost focus", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_clear_leaves_a_teacher_written_comment_alone(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "Great improvement this week!", "focused": True, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=95), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2)
        self.assertFalse(result["ok"])
        self.assertIn("not the sync's", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))
        self.assertEqual(fake.clicks[-1], (30, 30))   # closed without typing

    def test_clear_with_expect_current_leaves_an_edited_sync_note_alone(self):
        # A comment that starts with the sync prefix but is NOT the exact note the sync wrote
        # (a teacher appended to it, or typed the phrase themselves) is never erased.
        fake = FakeCDP()
        fake.send = mock.Mock()
        edited = ops.SYNC_COMMENT_PREFIX + " Missing: 1.2 quiz. See me Friday."
        editor = {"text": edited, "focused": True, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2,
                                            expect_current=ops.SYNC_COMMENT_PREFIX + " Missing: 1.2 quiz.")
        self.assertFalse(result["ok"])
        self.assertIn("differs from the sync's last note", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))
        self.assertEqual(fake.clicks[-1], (30, 30))   # closed without typing

    def test_clear_with_nothing_there_is_a_verified_no_op(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "", "focused": True, "editable": True, "checked": False,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=95), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2)
        self.assertTrue(result["ok"] and result["verified"])
        self.assertEqual(result.get("skipped"), "nothing to clear")
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_probe_only_reads_dom(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        ops.inspect_cell_comment_ui(fake, "col1", 2)
        self.assertEqual(fake.clicks, [])
        fake.send.assert_not_called()
        source = " ".join(fake.evals)
        for forbidden in (".click(", ".focus(", "dispatchEvent", "scrollIntoView", ".value ="):
            self.assertNotIn(forbidden, source)
        self.assertIn("grader-grid-cell-col1-2", source)

    def test_missing_affordance_never_types(self):
        for clear in (False, True):
            fake = FakeCDP()
            fake.send = mock.Mock()
            with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
                "ok": True, "cell": {"rect": None}, "icons": [], "menuItems": []
            }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                    mock.patch.object(fake, "eval_js", return_value=None):
                result = ops.clear_cell_comment(fake, "col1", 2) if clear else ops.write_cell_comment(fake, "col1", 2, "hello")
            self.assertFalse(result["ok"])
            self.assertFalse(result["verified"])
            self.assertIn("affordance", result["reason"])
            self.assertEqual(fake.clicks, [])
            self.assertFalse(any(call.args[0] == "Input.dispatchKeyEvent" for call in fake.send.call_args_list))

    def test_missing_context_item_never_types(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": {"x": 10, "y": 20}}, "icons": [], "menuItems": []
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", return_value=None), mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "hello")
        self.assertFalse(result["verified"])
        self.assertTrue(any(call.args[0] == "Input.dispatchMouseEvent" for call in fake.send.call_args_list))
        self.assertFalse(any(call.args[0] == "Input.dispatchKeyEvent" for call in fake.send.call_args_list))

    def test_rejects_newline_without_any_browser_actions(self):
        fake = FakeCDP()
        self.assertFalse(ops.write_cell_comment(fake, "col1", 2, "bad\ntext")["verified"])
        self.assertEqual(fake.evals, [])
        self.assertEqual(fake.clicks, [])

    def test_discovery_cli_resolves_component_and_is_read_only(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("schoology_comment_cli", os.path.join(REPO_ROOT, "tools", "schoology-sync.py"))
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        fake = FakeCDP()
        fake.launch = mock.Mock()
        fake.ws = None
        with mock.patch.object(cli, "EdgeCDP", return_value=fake), \
                mock.patch.object(cli, "assert_authenticated"), \
                mock.patch.object(ops, "inject_helpers"), \
                mock.patch.object(ops, "list_students", return_value=[{"studentId": "u1", "rowIndex": 2}]), \
                mock.patch.object(ops, "list_assignments", return_value=[{"columnKey": "c1"}]), \
                mock.patch.object(ops, "find_assignment_id_by_title", return_value="c1") as lookup, \
                mock.patch.object(ops, "inspect_cell_comment_ui", return_value={"ok": True}) as probe, \
                mock.patch.object(ops, "write_grade_to_cell") as write, \
                mock.patch.object(sys, "argv", ["schoology-sync.py", "--inspect-comment-ui", "--section", "PeriodB", "--student", "u1", "--column", "FA:1.2"]):
            self.assertEqual(cli.main(), 0)
        lookup.assert_called_once_with(fake, "1.2 Follow-Along")
        probe.assert_called_once_with(fake, "c1", 2)
        write.assert_not_called()
        self.assertEqual(fake.clicks, [])


class GridLoadFake:
    """Gradebook whose columns load in batches when the grid is scrolled."""

    def __init__(self, loaded, total, per_scroll, title_after_load=None):
        self.loaded, self.total, self.per_scroll = loaded, total, per_scroll
        self.title_after_load = title_after_load
        self.scrolls = 0

    def eval_js(self, expr):
        if "col_header_num_loaded" in expr:
            return {"loaded": self.loaded, "total": self.total}
        if "s-js-grid-scrolling-body" in expr:
            self.scrolls += 1
            self.loaded = min(self.total, self.loaded + self.per_scroll)
            return True
        if "gridcell" in expr:   # the title scan
            return self.title_after_load if self.loaded >= self.total else None
        return None


class TestLoadAllColumns(unittest.TestCase):
    """2026-10-02: Schoology loads 30 columns at a time; the rest need a scroll."""

    def setUp(self):
        self.sleep = mock.patch.object(ops.time, "sleep", lambda s: None)
        self.sleep.start()

    def tearDown(self):
        self.sleep.stop()

    def test_scrolls_until_every_column_is_loaded(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=4)
        self.assertTrue(ops.load_all_columns(fake))
        self.assertEqual((fake.loaded, fake.scrolls), (34, 1))

    def test_no_scroll_when_already_loaded(self):
        fake = GridLoadFake(loaded=34, total=34, per_scroll=4)
        self.assertTrue(ops.load_all_columns(fake))
        self.assertEqual(fake.scrolls, 0)

    def test_not_a_gradebook_page_is_a_quiet_no(self):
        fake = FakeCDP(title_lookup="c1")
        self.assertFalse(ops.load_all_columns(fake))

    def test_stalled_loading_gives_up(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=0)
        self.assertFalse(ops.load_all_columns(fake, timeout_s=0))

    def test_title_lookup_finds_a_column_past_the_first_batch(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=4, title_after_load="33")
        self.assertEqual(ops.find_assignment_id_by_title(fake, "3.3 Blooket"), "33")


if __name__ == "__main__":
    unittest.main()
