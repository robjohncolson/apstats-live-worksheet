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


def number(props, key):
    value = props.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def convert_puzzle_map(text, var):
    """puzzle-stage-data: the `<stage>.puzzle.map` table the Puzzle sub-stage loads (FUN_7ff72bc27dc0 map loader +
    FUN_7ff72bb17090 / FUN_7ff72bb16920 puzzle fields). The recovered converter keeps only puzzle.createTable.
    Grids are stored column-major in Lua (each source line is one column) and emitted row-major like stage.map."""
    props, env = converter.parse_assignments(text, var)
    base = "puzzle.map."
    if not any(key.startswith(base) for key in props):
        return None
    width = int(number(props, base + "width") or 0)
    height = int(number(props, base + "height") or 0)
    out = {
        "width": width,
        "height": height,
        "chipSize": int(number(props, base + "chipSize") or 32),
        "variable": int(number(props, base + "variable") or 0),
    }
    for key in ("offsetX", "offsetY", "infoX", "infoY", "fallTimeDefault", "fallTimeFloorDefault"):
        value = number(props, base + key)
        if value is not None:
            out[key] = float(value)
    judge = {}
    for key in ("x", "y", "w", "h"):
        value = number(props, base + "judge." + key)
        if value is not None:
            judge[key] = int(value)
    if judge:
        out["judge"] = judge
    escaped = re.escape(var)
    fall_table = converter.extract_table_after(text, rf"\b{escaped}\.puzzle\.map\.fallTimeTable\s*=")
    if fall_table:
        out["fallTimeTable"] = [[converter.parse_atom(part, env) for part in converter.split_top_level(row)]
                                for row in converter.nested_rows(fall_table)]
    variants = {}
    for match in re.finditer(rf"\b{escaped}\.puzzle\.map\.table(\d+)\s*=", text):
        found = converter.find_balanced(text, text.find("{", match.end()))
        if found:
            chips = converter.parse_map_table(found[1])
            variants[match.group(1)] = converter.transpose_column_major(chips, width, height)
    table = converter.extract_table_after(text, rf"\b{escaped}\.puzzle\.map\.table\s*=")
    chips = converter.parse_map_table(table) if table else []
    if chips:
        out["table"] = converter.transpose_column_major(chips, width, height)
    elif table and variants:
        # map.table is a lookup list of tableN refs: index = party - 1 (FUN_7ff72bc27dc0, variable != 0).
        refs = re.findall(r"\.puzzle\.map\.table(\d+)", table)
        out["variantByPlayerCount"] = refs
        out["table"] = list(variants.get(refs[0], [])) if refs else []
    if variants:
        out["variants"] = variants
    return out


stages = []
for path in sorted((archive / "stage").glob("*.lua")):
    text = converter.strip_comments(path.read_text(encoding="utf-8", errors="replace"))
    declaration = re.search(r"\b(\w+)\s*=\s*Stage.New\(\)", text)
    if declaration:
        stage = converter.convert_stage(common + "\n" + text, declaration[1], "stage/" + path.name, True)
        if stage.get("puzzle"):
            puzzle_map = convert_puzzle_map(common + "\n" + text, declaration[1])
            if puzzle_map:
                stage["puzzle"]["map"] = puzzle_map
        stages.append(stage)
Path(sys.argv[2]).write_text(json.dumps(stages, ensure_ascii=False), encoding="utf-8")
