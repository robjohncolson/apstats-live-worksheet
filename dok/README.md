# DOK-3 misconception sheets

2026-09-12: only sheets generated from the misconceptions panel are active. See
[DOK_DEPRECATE_DAILY_SPEC.md](../DOK_DEPRECATE_DAILY_SPEC.md).
The 66 daily ladders and two Wednesday pairing sheets are preserved under `archive/`.
They are excluded from active builds, the manifest, the teacher index and the dashboard.

Students write a first take, work the printed parts and turn in whenever they finish
for bonus credit. The final part is scored E/P/I by a human, never AI-graded or auto-scored.
All information needed to work the problem is printed on the sheet.

## Author and publish a misconception sheet

1. Use the misconceptions panel's exact tag keys or normalized `label:` keys for the
   target evidence. Read the applicable `calibration/unit*.json` anchors.
2. Create `registry/{slug}.jsonl` and `lessons/{slug}.yaml`. Screen Time,
   `1.1_1.2_1.4_1.7`, is the current active example. Registry items need a first take,
   ordered parts ending at DOK 3, answers, a rationale, CED skill codes, FRQ pattern
   and E/P/I scoring. Multi-topic keys retain their ordered `topics` list; filenames
   replace `+` with `_`.
3. Every active YAML requires `standalone: true`, a non-empty `misconceptions` list,
   and `generated: { by: "orchestrator+teacher", "on": "2026-09-12", window_days: 42 }`
   with the actual author, date and evidence window. Quote `"on"` for YAML compatibility.
   Keep worksheet filenames as metadata. There is no calendar coverage obligation,
   pairing eligibility rule, ten-minute limit or worksheet-per-member requirement.
4. Run `python dok/build_ladder.py --validate`, then
   `powershell -NoProfile -File dok/compile.ps1 -All` (or pass a single slug).
   `--all` and `-All` enumerate only `dok/lessons/*.yaml`.
5. Review the three editions: student (two sides), board and teacher key.
   Run the DOK Vitest suites and `pytest tests/test_dok_build.py -q`.
   Commit the YAML, registry, manifest, TeX and PDFs.

Both video-free and self-paced guards remain mandatory. Retired flow fields such as
`minutes`, `exit_reflection` and teacher phase instructions are rejected. Visuals carry
data and labels only. Do not edit authored problem content to bypass a guard.

`index.html` renders each active manifest card with target labels, generation date and
three PDF links. The Desk Teacher menu's DOK ladders entry opens this index; individual
lesson resource panels have no DOK row. The dashboard Remediation sheets strip lists
all active sheets and their targets. The manifest carries the same provenance as YAML.

See [archive/README.md](archive/README.md) for history and restoration instructions.
Weekly automation is a separate, pending project.
