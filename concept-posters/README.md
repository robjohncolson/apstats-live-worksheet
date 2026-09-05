# AP Statistics concept-poster mockups

These are all fifteen 22 × 28 inch portrait mockups from
[`CONCEPT_POSTERS_SPEC.md`](../CONCEPT_POSTERS_SPEC.md). They cover the five
core units and the specified ★ Beyond the Exam corners. The Makefile discovers
`pNN-*.tex` sources and orders the combined editions from P01 through P15.

The shared `apstats-poster.sty` file holds the paper size, color system,
typography, five-zone layout, formula cards, and reusable callouts. Each poster
keeps its actual content in one short, editable `.tex` file.

## Build

Install a XeTeX-compatible engine. Tectonic is the simplest option because it
downloads the LaTeX packages it needs on first use.

The Letter-size print editions also require Poppler's `pdftocairo` command and
Ghostscript's `gs` command. On most Linux distributions, they are provided by
the `poppler-utils` and `ghostscript` packages.

```bash
cd concept-posters
make TECTONIC=/path/to/tectonic
```

On Windows with MiKTeX, Python, Make, Poppler, and Ghostscript on PATH:

```powershell
cd concept-posters
make -B ENGINE=xelatex
python verify_posters.py
```

`-B` rebuilds the committed PDFs and creates fresh local logs for verification.
`ENGINE=xelatex` also works on other platforms. `make_letter.py` runs the same
two Poppler scaling steps on Windows and POSIX systems, with no shell-specific
temporary-file commands. The verification script checks formula-ID placement,
PDF sizes and order, text bounds, and LaTeX logs; formula meaning and diagrams
also receive manual review, recorded in [RENDER_LOG.md](RENDER_LOG.md).
`make clean` removes generated files from `rendered/` using Python on either platform.

Outputs land in `rendered/`:

- one 22 × 28 inch poster-board PDF per poster
- one `-letter.pdf` print edition per poster, on a true 8.5 × 11 inch page
- one screen-size PNG preview per poster
- `apstats-concept-poster-mockups.pdf`, containing all fifteen poster-board pages
- `apstats-concept-poster-mockups-letter.pdf`, containing all fifteen Letter pages

The Letter editions preserve a 0.25-inch safe area on every edge and center the
slightly wider poster-board proportions vertically. Print them at **Actual
size** or **100%**; do not select a poster, tile, or oversize-paper mode in the
print dialog.

The PNG previews are intentionally low-resolution. Use the PDFs for printing or
for checking physical type size.

These are layout mockups, not hand-lettering tracers. The source preserves the
spec's hierarchy and full required content, while scaling type proportionally
where a literal 3-inch title or 1.5–2-inch formula would not coexist with the
prescribed zones on a 22 × 28-inch board. Run the back-row proof in §5 before
using a mockup as the final lettering plan.
