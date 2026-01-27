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
| `live-worksheet.skill` | Claude Code skill (zip archive) for generating new worksheets |
| `STATE_MACHINES.md` | Detailed state machine documentation for all interactive behaviors |
| `AI_GRADING_INTEGRATION.md` | Integration guide for AI grading features |
| `tests/` | Vitest test suite (jsdom environment) |
| `u4_l1_l2/` | Source materials (transcripts, slides, PDFs) for Unit 4 L1-2 worksheet development |
| `u4_l7_l8/` | Source materials (transcripts, slides, PDFs) for Unit 4 L7-8 worksheet development |

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
