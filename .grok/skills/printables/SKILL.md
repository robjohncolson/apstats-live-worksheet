---
name: printables
description: "Build a classroom print set (poster kits, peer review forms, answer keys) as PDFs with one command that fails when a sheet spills onto an extra page. Use when the teacher asks for a print set, a pack, or 'make the PDFs for Period B posters 4 to 6'."
---

# Printables: build a print set

Repo root: `C:/Users/rober/downloads/Projects/school/follow-alongs`. Run every command from there in Git Bash.
Needs: Microsoft Edge (headless renders the html) and `python` with `pymupdf`. Set `PYTHONIOENCODING=utf-8`.

## What exists

- A **kit** is a folder with a `printables.json` manifest. Today only `u2_poster` has one.
- Each **sheet** in the manifest = one html (+ `#edition` hash) -> one pdf with an EXACT page count and the expected first line of every page (`headings`).
- Each **pack** = chosen pages of sheets in print order (e.g. the Period B group pack). A **set** = several packs.
- List what a kit has: open `u2_poster/printables.json` (ids under `sheets`, `packs`, `sets`).

## Commands

```bash
cd /c/Users/rober/downloads/Projects/school/follow-alongs
export PYTHONIOENCODING=utf-8

# 1. Dry run: renders into a temp folder, changes nothing tracked. Do this first.
node scripts/printables/build.mjs u2_poster --check --pack b-posters-4-6

# 2. Real build of one set/pack: writes the pdfs in u2_poster/pdf/ (only if every check passed)
#    and PNGs of every page it wrote (step 3 below looks at them)
node scripts/printables/build.mjs u2_poster --pack b-posters-4-6 --png /c/Users/rober/AppData/Local/Temp/printables-png

# Whole kit, and a text comparison against the committed pdfs
node scripts/printables/build.mjs u2_poster --out /c/Users/rober/AppData/Local/Temp/printables-out --diff

# Also regenerate the tracked layouts answer key html (u2_poster/poster_layouts_key.html) while building.
# Without --write that html is generated in a temp folder and the tracked file is left alone.
node scripts/printables/build.mjs u2_poster --pack b-posters-4-6 --write

# Or regenerate only the key html from its data (never touches the student sheet)
python scripts/printables/kits/u2_layouts_key.py --out u2_poster/poster_layouts_key.html

# Usage
node scripts/printables/build.mjs --help

# Tests (no Edge needed)
npx vitest run tests/printables.test.js tests/u2-poster-kit.test.js tests/desk-poster-links.test.js
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | `PRINT-READY` (or `--help`) |
| 1 | a sheet or pack failed, or the manifest is invalid (the FAIL / MANIFEST line names it) |
| 2 | bad or missing argument (a flag with no value, `--out ""`, unknown option), unknown kit, pack or set name (the message lists valid names), `python` not found (set `PRINTABLES_PYTHON`), `pymupdf` not installed (`python -m pip install pymupdf`), or Edge not found when a sheet must be rendered (set `PRINTABLES_EDGE` to msedge.exe) |

A pack made only of frozen pdfs (`partner-worksheets`) needs no Edge.

- The real build rewrites the bytes of every pdf it builds even when the text is the same, so git shows them modified. Run `--check` (or `--out ... --diff`) first and build for real only what the teacher asked for.

## When it fails

- `OVERFLOW <sheet> ...: expected N pages, got N+1. First page off its heading: page K` means the content before page K spilled. Shorten or tighten THAT page's html (spacing, font size of that block). Never change wording a student reads without the teacher's OK. Re-run step 1 until it is clean.
- `UNDERFLOW` means a page went missing (a section was deleted or hidden). Check the html edition hash.
- Heading mismatch with the right count: a page starts with the wrong section. Same fix as overflow.
- `generator ... failed` for the key: the student layout sheet gained or lost a blank or choice; the message names the poster and zone. Update `scripts/printables/kits/u2_layouts_key.json` for that zone only.
- On any FAIL line the run prints `Nothing was copied to its destination`: the OK lines above it were NOT written. Fix and re-run.
- `frozen: true` in the manifest = a pdf printed for a past day from older html (e.g. `partner-worksheets` still says "Poster 6 (spare)"). The build checks its page count and that it has zero links; it is never re-rendered unless you remove `frozen`.
- If you change a sheet's page count on purpose, update `pages` and `headings` in the manifest AND any pack `pageCount`/`parts` that use it.

## Before telling the teacher it is print-ready

1. The build's last line says `PRINT-READY` and the exit code is 0.
2. Every sheet and pack line shows the page count the manifest expects.
3. Open EVERY PNG from step 2's `--png` folder (named `sheet-<id>-p<N>.png` and `pack-<id>-p<N>.png`) and look at it: nothing cut off at the bottom, no blank page, no half-empty page that should be full, tables not split.
4. Student sheets carry no answers: the student PNGs show empty blanks (no red handwriting, no "ANSWER KEY", no circled picks). Only `audience: teacher` pdfs may show answers.
5. Every pdf has zero links (the build asserts this, frozen pdfs included; links would leak local file paths).
6. Tell the teacher which pdf files to print and the `copies` hint for each pack from the manifest.

Do not commit or push unless the teacher asks; new or changed pdfs go to GitHub Pages on push.
