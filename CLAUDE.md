# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This directory contains AP Statistics "Video Follow-Along" live worksheets—single-file HTML web apps that students complete while watching instructional videos. Worksheets connect to a Railway backend for real-time class answer aggregation and AI-powered grading.

## Files

| File | Purpose |
|------|---------|
| `u3_lesson6-7_live.html` | Live worksheet for Topics 3.6–3.7 (Experimental Design & Inference) |
| `ai-grading-prompts.js` | Rubrics, vocabulary, and prompt templates for AI grading |
| `live-worksheet.skill` | Claude Code skill definition for generating new worksheets |
| `STATE_MACHINES.md` | Detailed state machine documentation for all interactive behaviors |
| `AI_GRADING_INTEGRATION.md` | Integration guide for AI grading features |

## Architecture

Each worksheet is self-contained HTML with embedded CSS and JavaScript. Key components:

### Core Features
1. **Fill-in-the-blank inputs** (`<input class="blank" data-answer="...">`) with pipe-separated accepted answers
2. **Answer validation** - Color-coded feedback (green=correct, yellow=partial, red=incorrect)
3. **Railway sync** - Answers POST to `/api/submit-answer`; aggregates fetched from `/api/question-stats/:id`
4. **Aggregate drawer** - Slide-out panel showing class answer distributions as bar charts
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

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Testing

Tests use Vitest with jsdom for DOM simulation:

| Test File | Coverage |
|-----------|----------|
| `tests/grading-prompts.test.js` | Rubric structure, prompt building, lesson context |
| `tests/reflection-grader.test.js` | Grading workflow, API calls, appeal system |
| `tests/ui-components.test.js` | DOM interactions, CSS classes, UI states |

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

## Naming Convention

`u{unit}_lesson{lesson-range}_live.html` (e.g., `u3_lesson6-7_live.html`)

## Key State Machines

See `STATE_MACHINES.md` for detailed diagrams. Key flows:

1. **Answer Validation** - Unchecked → Correct/Partial/Incorrect/Revealed
2. **AI Grading** - Click → Build Prompt → API Call → Display Feedback
3. **Appeal System** - Disagree → Form → Submit → Upgraded/Maintained
4. **Grading State** - Empty → Graded → Appealed (up to 3x) → Exhausted
