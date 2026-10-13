"""pytest setup shared by the python tests.

The Schoology sync reads two machine-local files: tools/schoology_sync_config.json (the
CED title switch) and tools/.schoology-rename-state.json (the rename manifest). On the
Athena laptop both change on rename day, so the tests point them at an empty temp dir:
every test sees "flag off, rename not started" unless it sets the env itself.
"""
import os
import tempfile

_ISOLATED = tempfile.mkdtemp(prefix="schoology-test-state-")
os.environ["SCHOOLOGY_SYNC_CONFIG"] = os.path.join(_ISOLATED, "schoology_sync_config.json")
os.environ["SCHOOLOGY_RENAME_STATE"] = os.path.join(_ISOLATED, "schoology-rename-state.json")
