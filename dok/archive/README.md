# Archived daily and pairing DOK sheets

Archived 2026-09-12: the daily/pairing program is deprecated. These 66 daily ladders and two Wednesday pairing sheets retain their lesson YAML, registry, TeX and PDFs here. Only misconception-generated sheets remain active; see DOK_DEPRECATE_DAILY_SPEC.md.

To resurrect a sheet, move its YAML and registry back to the active directories with git mv, set standalone: true, add a non-empty misconceptions list of panel keys or label-form keys, and add generated metadata (by, on, window_days). Validate and rebuild all three editions with the active builder and compile.ps1. Review the content under the video-free and self-paced guards before distribution. Scoring remains human E/P/I.

Use git log --follow -- <archive path> to trace earlier history. The archive is excluded from active building and discovery.
