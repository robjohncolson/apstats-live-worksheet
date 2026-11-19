"""preview_changes.py - list, file by file, what convert_memory.py --apply WOULD change. Writes nothing.

    python .grok/skills/memory-refresh/preview_changes.py <claude-memory-dir> <grok-workspace-dir>

It reuses convert_memory.py's own functions (the grok-handover folder in the home directory), so its decisions are the
same as the real run. Prints one line per note that would be written (NEW or REFRESH), a line per
topic Grok wrote itself (KEPT, never overwritten), a line per converted topic whose note (in this memory
dir) left Claude's index (STALE: the real run leaves it alone), and a last line with the same counts as
convert_memory.py's PREVIEW line. Prints file names only, never note contents.
"""
import os
import sys

HANDOVER_DIR = os.path.join(os.path.expanduser("~"), "grok-handover")
sys.path.insert(0, HANDOVER_DIR)
import convert_memory as cm  # noqa: E402


def load_excluded():
    path = os.path.join(HANDOVER_DIR, "exclude.txt")
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip() and not line.startswith("#")}


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def plan(memory_dir, workspace):
    """[(action, filename)] exactly as convert_memory.main decides, without writing."""
    topics = os.path.join(workspace, "topics")
    titles = cm.index_titles(memory_dir)
    excluded = load_excluded()
    rows = []
    for filename in sorted(os.listdir(memory_dir)):
        if not filename.endswith(".md") or filename == "MEMORY.md":
            continue
        if filename in excluded:
            rows.append(("not-in-index", filename))
            continue
        if titles and filename not in titles:
            rows.append(("not-in-index", filename))
            continue
        out = cm.convert(filename, read_text(os.path.join(memory_dir, filename)), titles)
        target = os.path.join(topics, filename)
        if not os.path.exists(target):
            rows.append(("new", filename))
            continue
        current = read_text(target)
        if cm.MARKER % filename not in current:
            rows.append(("kept-grok-own", filename))
        elif current == out:
            rows.append(("same", filename))
        else:
            rows.append(("refresh", filename))
    return rows


def stale_topics(workspace, rows):
    """Notes in THIS memory dir that left Claude's index but still have a converted topic.

    Only this dir's notes are checked: a workspace can be fed by two memory dirs (a2), and the
    other dir's topics are not stale.
    """
    topics = os.path.join(workspace, "topics")
    stale = []
    for action, filename in rows:
        if action != "not-in-index":
            continue
        target = os.path.join(topics, filename)
        if os.path.exists(target) and cm.MARKER % filename in read_text(target):
            stale.append(filename)
    return stale


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    memory_dir, workspace = argv
    if not os.path.isdir(memory_dir):
        print("no such memory dir: " + memory_dir)
        return 2
    if not os.path.isdir(workspace):
        print("no such Grok workspace: " + workspace)
        return 2
    rows = plan(memory_dir, workspace)
    labels = {"new": "NEW    ", "refresh": "REFRESH", "kept-grok-own": "KEPT   "}
    for action, filename in rows:
        if action in labels:
            print(labels[action] + " " + filename)
    for filename in stale_topics(workspace, rows):
        print("STALE   " + filename + "  (converted earlier; its note left Claude's index; not touched)")
    counts = {"new": 0, "refresh": 0, "same": 0, "kept-grok-own": 0, "not-in-index": 0}
    for action, _ in rows:
        counts[action] += 1
    print("PREVIEW " + " ".join("%s=%d" % kv for kv in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
