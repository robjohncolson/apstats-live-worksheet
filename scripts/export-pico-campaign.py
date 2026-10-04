"""Read archive stages using the recovered converter and shipped global constants."""
import importlib.util
import json
import re
import sys
from pathlib import Path

source = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("pico_converter", source / "tools/convert_stage_lua.py")
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)
archive = source.parent / "lua_archive_sources"
common = converter.strip_comments((archive / "stage/stage_common.lua").read_text(encoding="utf-8", errors="replace"))
stages = []
for path in sorted((archive / "stage").glob("*.lua")):
    text = converter.strip_comments(path.read_text(encoding="utf-8", errors="replace"))
    declaration = re.search(r"\b(\w+)\s*=\s*Stage.New\(\)", text)
    if declaration:
        stages.append(converter.convert_stage(common + "\n" + text, declaration[1], "stage/" + path.name, True))
Path(sys.argv[2]).write_text(json.dumps(stages, ensure_ascii=False), encoding="utf-8")
