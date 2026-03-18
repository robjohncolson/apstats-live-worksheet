# Continuation Prompt — apstats-live-worksheet

## What to do NOW

**Propagate the tighter AI grading suggestion prompt to ALL worksheet grading files.**

In this session we discovered that the AI grading `suggestion` field was (a) vaguely prompted and (b) stripped by the Railway server. Both issues are now fixed for `edgar_u6`. The next task is to apply the same prompt improvement to every other grading prompts file.

### Files to update

Each file has a `buildReflectionPrompt*` function with the old instruction block. Replace the old instruction + JSON schema with the new version from `ai-grading-prompts-edgar-u6.js` (lines 257-272).

| File | Function name |
|------|---------------|
| `ai-grading-prompts.js` | `buildReflectionPrompt` (Unit 3) |
| `ai-grading-prompts-u4.js` | `buildReflectionPromptU4` |
| `ai-grading-prompts-u4-l3.js` | `buildReflectionPromptU4L3` |
| `ai-grading-prompts-u4-l7-8.js` | `buildReflectionPromptU4L78` |
| `ai-grading-prompts-u5-l1-2.js` | `buildReflectionPromptU5L12` |
| `ai-grading-prompts-u5-l3.js` | `buildReflectionPromptU5L3` |
| `ai-grading-prompts-u5-l8.js` | `buildReflectionPromptU5L8` |
| `ai-grading-prompts-u6-l1-2.js` | `buildReflectionPromptU6L12` |
| `ai-grading-prompts-u6-l3.js` | `buildReflectionPromptU6L3` |

Also check each corresponding `*_live.html` file for inline copies of the prompt builder — those need the same update.

### What to replace

**Old (find this pattern in each file):**
```
Grade the response as E, P, or I. Be encouraging but accurate. Identify which elements were addressed and which were missing. Provide a specific suggestion for improvement if the score is P or I.

Respond in JSON format:
{
    "score": "E" | "P" | "I",
    "feedback": "Brief explanation of the grade",
    "matched": ["list of elements the student addressed"],
    "missing": ["list of elements the student missed"],
    "suggestion": "Specific suggestion for improvement (null if E)"
}
```

**New (from ai-grading-prompts-edgar-u6.js lines 257-272):**
```
Grade the response as E, P, or I. Be encouraging but accurate. Identify which elements were addressed and which were missing.

SUGGESTION RULES (for P or I only):
- For each missing element, write one concrete sentence starting with "Try adding..." or "Revise to include..." that tells the student EXACTLY what to write.
- Reference the specific concept or term they need (e.g., "define p as the true germination rate" not "clarify the parameter").
- Never say "lacks clarity" or "needs more detail" — always say WHAT detail.
- Keep it to 2-3 sentences max. Sound like a coach, not a judge.

Respond in JSON format:
{
    "score": "E" | "P" | "I",
    "feedback": "One sentence explaining the grade — what they got right first, then what's missing",
    "matched": ["list of elements the student addressed"],
    "missing": ["list of elements the student missed"],
    "suggestion": "2-3 actionable sentences using 'Try adding...' or 'Revise to include...' (null if E)"
}
```

### Server fix already deployed

`curriculum_render` server (`d9f6d57`) already passes `suggestion` through `normalizeGradingResponse()` — no further server changes needed.

## Session Commits

| Repo | Hash | Description |
|------|------|-------------|
| `apstats-live-worksheet` | `5372de8` | Tighten AI grading suggestion prompt for Edgar U6 (both .js and inline HTML) |
| `curriculum_render` | `d9f6d57` | Pass `suggestion` field through `normalizeGradingResponse` to client |

## Key Paths

- Grading prompt files: `ai-grading-prompts*.js` (9 files to update)
- Live worksheets with inline prompts: `u*_live.html`, `edgar_*_live.html`
- Server normalizer: `C:\Users\ColsonR\curriculum_render\railway-server\server.js` line 708
- Reference implementation: `ai-grading-prompts-edgar-u6.js` lines 257-272

## Environment

- Platform: Windows 11, Git Bash
- Node: v22.19.0
- Railway server: auto-deploys from `curriculum_render` main branch
- GitHub Pages: auto-deploys from `apstats-live-worksheet` master branch
- AI model: DeepSeek-V3 (`deepseek-chat`) via Railway
