# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This directory contains AP Statistics "Video Follow-Along" live worksheets—single-file HTML web apps that students complete while watching instructional videos. Worksheets connect to a Railway backend for real-time class answer aggregation and AI-powered grading.

## Files

| File | Purpose |
|------|---------|
| `u3_lesson6-7_live.html` | Live worksheet for Topics 3.6–3.7 (Experimental Design & Inference) |
| `u4_lesson1-2_live.html` | Live worksheet for Topics 4.1–4.2 (Random Patterns & Simulation) |
| `u4_lesson1-2-3_live.html` | Extended worksheet for Topics 4.1–4.3 (adds Introduction to Probability) |
| `u4_lesson7-8_live.html` | Live worksheet for Topics 4.7–4.8 (Random Variables & Probability Distributions) |
| `u4_l1_l2_blooket.csv` | Blooket quiz (34 questions) for Unit 4 vocabulary reinforcement |
| `unit4_schedule_v4.html` | Unit 4 pacing schedule for Periods B & E with lagged quiz system |
| `ai-grading-prompts.js` | Rubrics for Unit 3 AI grading (keyed by `reflect53`, `exitTicket`, etc.) |
| `ai-grading-prompts-u4.js` | Rubrics for Unit 4 L1-2 AI grading (keyed by `reflect1`, `reflect2`, `exitTicket`) |
| `ai-grading-prompts-u4-l3.js` | Rubrics for Unit 4 L1-3 AI grading (adds `reflect3` for probability interpretation) |
| `ai-grading-prompts-u4-l7-8.js` | Rubrics for Unit 4 L7-8 AI grading (random variables, expected value, standard deviation) |
| `u5_lesson1-2_live.html` | Live worksheet for Topics 5.1–5.2 (Sampling Distributions & Normal Distribution, Revisited) |
| `ai-grading-prompts-u5-l1-2.js` | Rubrics for Unit 5 L1-2 AI grading (sampling variability, normal probability, linear combinations) |
| `u5_l1_l2_blooket.csv` | Blooket quiz (35 questions) for Unit 5 L1-2 conceptual reinforcement |
| `u5_lesson3_live.html` | Live worksheet for Topic 5.3 (Central Limit Theorem & Randomization Distributions) |
| `ai-grading-prompts-u5-l3.js` | Rubrics for Unit 5 L3 AI grading (CLT, sampling distributions via simulation, randomization distributions) |
| `u5_l3_blooket.csv` | Blooket quiz (35 questions) for Unit 5 L3 conceptual reinforcement (CLT, randomization tests) |
| `u5_lesson8_live.html` | Live worksheet for Topic 5.8 (Sampling Distributions for Differences in Sample Means) |
| `ai-grading-prompts-u5-l8.js` | Rubrics for Unit 5 L8 AI grading (difference in sample means: parameters, shape, probability) |
| `u5_l8_blooket.csv` | Blooket quiz (35 questions) for Unit 5 L8 conceptual reinforcement (difference in sample means) |
| `u6_lesson1-2_live.html` | Live worksheet for Topics 6.1–6.2 (Why Be Normal? & Constructing CI for p) |
| `ai-grading-prompts-u6-l1-2.js` | Rubrics for Unit 6 L1-2 AI grading (significance testing logic, CI conditions, calculation, sample size) |
| `u6_l1_l2_blooket.csv` | Blooket quiz (35 questions) for Unit 6 L1-2 conceptual reinforcement (significance testing logic, CI for proportions) |
| `u6_lesson3_live.html` | Live worksheet for Topic 6.3 (Justifying a Claim Based on a CI for p) |
| `ai-grading-prompts-u6-l3.js` | Rubrics for Unit 6 L3 AI grading (CI interpretation, confidence level, ME factors, 5-step process) |
| `u6_l3_blooket.csv` | Blooket quiz (35 questions) for Unit 6 L3 conceptual reinforcement (CI interpretation, justifying claims, ME factors) |
| `u8_lesson1_live.html` | Live worksheet for Topic 8.1 (Introducing Statistics: Are My Results Unexpected?) |
| `ai-grading-prompts-u8-l1.js` | Rubrics for Unit 8 L1 AI grading (chi-square statistic, simulation, P-value interpretation) |
| `u8_l1_blooket.csv` | Blooket quiz for Unit 8 L1 conceptual reinforcement |
| `u8_lesson2_live.html` | Live worksheet for Topic 8.2 (Chi-Square Distributions & Setting Up a GOF Test) |
| `ai-grading-prompts-u8-l2.js` | Rubrics for Unit 8 L2 AI grading (chi-square distributions, hypotheses, conditions) |
| `u8_l2_blooket.csv` | Blooket quiz for Unit 8 L2 conceptual reinforcement |
| `u8_lesson3_live.html` | Live worksheet for Topic 8.3 (Carrying Out a Chi-Square GOF Test) |
| `ai-grading-prompts-u8-l3.js` | Rubrics for Unit 8 L3 AI grading (test statistic, P-value, conclusion, contributions) |
| `u8_l3_blooket.csv` | Blooket quiz for Unit 8 L3 conceptual reinforcement |
| `u8_lesson4_live.html` | Live worksheet for Topic 8.4 (Chi-Square Test for Homogeneity) |
| `ai-grading-prompts-u8-l4.js` | Rubrics for Unit 8 L4 AI grading (two-way tables, homogeneity test) |
| `u8_l4_blooket.csv` | Blooket quiz for Unit 8 L4 conceptual reinforcement |
| `u8_lesson5_live.html` | Live worksheet for Topic 8.5 (Chi-Square Test for Independence) |
| `ai-grading-prompts-u8-l5.js` | Rubrics for Unit 8 L5 AI grading (independence test, association) |
| `u8_l5_blooket.csv` | Blooket quiz for Unit 8 L5 conceptual reinforcement |
| `u8_lesson6_live.html` | Live worksheet for Topic 8.6 (Chi-Square Tests — Putting It All Together) |
| `ai-grading-prompts-u8-l6.js` | Rubrics for Unit 8 L6 AI grading (GOF vs homogeneity vs independence) |
| `u8_l6_blooket.csv` | Blooket quiz for Unit 8 L6 conceptual reinforcement |
| `live-worksheet.skill` | Claude Code skill (zip archive) for generating new worksheets |
| `STATE_MACHINES.md` | Detailed state machine documentation for all interactive behaviors |
| `AI_GRADING_INTEGRATION.md` | Integration guide for AI grading features |
| `tests/` | Vitest test suite (jsdom environment) |
| `u4_l1_l2/` | Source materials (transcripts, slides, PDFs) for Unit 4 L1-2 worksheet development |
| `u4_l7_l8/` | Source materials (transcripts, slides, PDFs) for Unit 4 L7-8 worksheet development |
| `u5_l1_l2/` | Source materials (transcripts, slides, PDFs) for Unit 5 L1-2 worksheet development |
| `u5/` | Source materials (transcripts, slides, framework) for Unit 5 worksheet development |
| `u6/` | Source materials (transcripts, slides, framework) for Unit 6 worksheet development |
| `u8/` | Source materials (transcripts, slides) for Unit 8 worksheet development |

## Architecture

Each worksheet is self-contained HTML with embedded CSS and JavaScript. Key components:

### Core Features
1. **Fill-in-the-blank inputs** (`<input class="blank" data-answer="...">`) with pipe-separated accepted answers
2. **Answer validation** - Color-coded feedback (green=correct, yellow=partial, red=incorrect)
3. **Railway sync** - Answers POST to `/api/submit-answer`; aggregates fetched from `/api/question-stats/:id`
4. **Aggregate drawer** - Focus-following slide-out panel showing class answer distributions
   - Updates automatically when user tabs between inputs (one chart per input)
   - Bars scaled by count (not percentage) for visual comparison
   - Escape key closes drawer, keyboard hint shown in header
5. **Question IDs** - Auto-assigned as `WS-{UNIT}-Q{N}` for server tracking

### AI Grading Features
6. **AI Reflection Grading** - `ReflectionGrader` class grades free-response textareas via `/api/ai/grade`
7. **Calibrated Prompts** - `ai-grading-prompts.js` contains rubrics with lesson context from video transcripts
8. **Appeal System** - Students can appeal P/I scores up to 3 times with reasoning
9. **Grading State** - `gradingState` Map tracks results, appeal counts, and history

## Commands

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run a single test file
npx vitest run tests/grading-prompts.test.js

# Run tests matching a pattern
npx vitest run -t "buildReflectionPrompt"

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

Tests use Vitest with jsdom for DOM simulation:

| Test File | Coverage |
|-----------|----------|
| `tests/grading-prompts.test.js` | Unit 3 rubric structure, prompt building, lesson context |
| `tests/grading-prompts-u4.test.js` | Unit 4 rubric structure, prompt building, lesson context |
| `tests/reflection-grader.test.js` | Grading workflow, API calls, appeal system |
| `tests/ui-components.test.js` | DOM interactions, CSS classes, UI states |
| `tests/schedule.test.js` | Schedule structure, dates, topics, lagged quiz system, content coverage |
| `tests/aggregate-drawer.test.js` | Focus-following drawer, escape key, bar chart rendering |

## External Dependencies

Worksheets expect sibling files in parent directory:
- `../railway_config.js` - Sets `window.RAILWAY_SERVER_URL`
- `../railway_client.js` - Provides `window.railwayClient` with `submitAnswer()` and `getStats()` methods

Default server: `https://curriculumrender-production.up.railway.app`

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submit-answer` | POST | Submit fill-in-the-blank answers |
| `/api/question-stats/:id` | GET | Fetch class answer aggregates |
| `/api/ai/grade` | POST | AI grade reflection responses |
| `/api/ai/appeal` | POST | Submit appeal with reasoning |

## AI Grading Rubric Structure

Each reflection question in `ai-grading-prompts.js` has:
```javascript
{
  questionText: "The question prompt",
  expectedElements: [
    { id: "element-id", description: "What to look for", required: true }
  ],
  scoringGuide: { E: "...", P: "...", I: "..." },
  commonMistakes: ["Mistake to watch for"],
  contextFromVideo: "Direct quotes from lesson video"
}
```

## Creating New Worksheets

Use the `live-worksheet.skill` to generate worksheets. The skill expects:
- Unit/topic metadata
- Learning objectives (VAR-3.D style AP codes)
- Key vocabulary terms with definitions
- Timestamped video sections with fill-in-the-blank questions
- Post-video reflection questions and exit ticket

## Naming Conventions

- Worksheets: `u{unit}_lesson{lesson-range}_live.html` (e.g., `u3_lesson6-7_live.html`, `u4_lesson1-2_live.html`)
- Grading prompts: `ai-grading-prompts.js` (U3) and `ai-grading-prompts-u4.js` (U4) contain unit-specific rubrics keyed by textarea ID
- Question IDs: Auto-assigned as `WS-U{unit}L{lessons}-Q{N}` for server tracking (e.g., `WS-U4L1-2-Q1`)

## Key State Machines

See `STATE_MACHINES.md` for detailed diagrams. Key flows:

1. **Answer Validation** - Unchecked → Correct/Partial/Incorrect/Revealed
2. **AI Grading** - Click → Build Prompt → API Call → Display Feedback
3. **Appeal System** - Disagree → Form → Submit → Upgraded/Maintained
4. **Grading State** - Empty → Graded → Appealed (up to 3x) → Exhausted

## Cross-Agent Delegation

CC and Codex can invoke each other as subagents via the Agent repo's runner.

**Delegate implementation to Codex:**
```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction cc-to-codex \
  --task-type implement \
  --prompt "Your task description" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/follow-alongs" \
  --owned-paths "path/to/file.html" \
  --timeout 120
```

**Ask CC a design question (from Codex):**
```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction codex-to-cc \
  --task-type design-question \
  --prompt "Your question" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/follow-alongs" \
  --timeout 60
```

**Task types**: `implement`, `review`, `investigate`, `validate`, `design-question`
**Flags**: `--dry-run` (preview, no tokens), `--read-only`, `--owned-paths`
When the user asks to delegate work to Codex, use the runner — don't ask the user to copy-paste.

## TI-84 ROM Transpilation — Continuation Workflow

Default operating mode when the user says "go for it" / "keep going" on `CONTINUATION_PROMPT_CODEX.md` work:

1. **Pick up state**: Read `CONTINUATION_PROMPT_CODEX.md` in chunks (it's ~3200+ lines — use `offset`/`limit` + `Grep` for `^### Phase`). The latest phase + "Phase N+ Priorities for Next Session" section at the bottom has the active list.
2. **Default to parallel Codex dispatch**: Use the cross-agent.py runner for any file-writing, probe-running, or disassembly work. CC focuses on investigation, analysis, and orchestration. Give Codex self-contained prompts with exact addresses, reference commits, file paths, and calling-convention details — it has NO conversation context. **Default posture: spawn 3-4 Codex agents in parallel for independent priorities** — single-agent dispatch is the exception, not the norm. Only serialize when a task depends on another task's output.
3. **At every pause** (after a phase completes, before picking the next target): run `/context` AND **update `CONTINUATION_PROMPT_CODEX.md`** with what just ran (artifacts, findings, next-phase priorities). Keep the "last updated" header current. Both steps are non-negotiable — the file is the only handoff mechanism.
4. **Continue or stop based on context**: If `/context` shows **< 70%** of 1M, proceed to the next priority without asking — assume reasonable choices are approved. If **≥ 70%**, make sure `CONTINUATION_PROMPT_CODEX.md` is fully up-to-date, then stop and hand off.
5. **User will clear context** and hand the updated file to a fresh session. Self-contained continuation is the goal.

**Do NOT** ask for approval between reasonable next-phase targets. The user explicitly delegated that judgment. Only stop for: (a) context ≥ 70%, (b) genuinely ambiguous fork in the road, (c) destructive operation not previously authorized.

**Cross-agent dispatch invocation** (use this exact command pattern):
```bash
python "C:/Users/rober/Downloads/Projects/Agent/runner/cross-agent.py" \
  --direction cc-to-codex --task-type implement \
  --prompt "<self-contained task with exact addresses, file paths, calling conventions>" \
  --working-dir "C:/Users/rober/Downloads/Projects/school/follow-alongs" \
  --timeout 600
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **follow-alongs** (2228 symbols, 4166 relationships, 161 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/follow-alongs/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/follow-alongs/context` | Codebase overview, check index freshness |
| `gitnexus://repo/follow-alongs/clusters` | All functional areas |
| `gitnexus://repo/follow-alongs/processes` | All execution flows |
| `gitnexus://repo/follow-alongs/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Code Style

Write extremely easy to consume code. Optimize for how easy the code is to read. Make the code skimmable. Avoid cleverness. Use early returns.
