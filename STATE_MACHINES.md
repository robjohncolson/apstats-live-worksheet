# Live Worksheet State Machine Documentation

For the current app-wide ownership map, invariants and regression commands, start with [STATE_MACHINE_MAP.md](STATE_MACHINE_MAP.md). This document retains the original worksheet-specific diagrams; its historical line numbers and client-grading descriptions are not the current server-authority contract.

This document describes the state machines governing the interactive behaviors in the live worksheets (`u3_lesson6-7_live.html`, `u4_lesson1-2_live.html`).

---

## Table of Contents

1. [Application Lifecycle](#1-application-lifecycle)
2. [User Session](#2-user-session)
3. [Blank Input Field](#3-blank-input-field)
4. [Answer Validation](#4-answer-validation)
5. [Score Display](#5-score-display)
6. [Server Synchronization](#6-server-synchronization)
7. [Aggregate Drawer](#7-aggregate-drawer)
8. [Save Indicator](#8-save-indicator)
9. [Particle Effects](#9-particle-effects)
10. [Global Worksheet Actions](#10-global-worksheet-actions)
11. [AI Reflection Grading](#11-ai-reflection-grading)
12. [Appeal System](#12-appeal-system)
13. [Grading State Management](#13-grading-state-management)
14. [Coin Flip Activity Grid (U4 only)](#14-coin-flip-activity-grid-u4-only)

---

## 1. Application Lifecycle

Controls initialization sequence on page load.

```
┌─────────────┐
│   LOADING   │
│  (DOM not   │
│   ready)    │
└──────┬──────┘
       │ DOMContentLoaded
       ▼
┌─────────────┐
│    INIT     │──────────────────────────────────┐
└──────┬──────┘                                  │
       │                                         │
       ├─► ensureRailwayDefaults()               │
       ├─► restoreSavedUser()                    │
       ├─► assignQuestionIds()                   │  Sequential
       ├─► addSaveIndicators()                   │  Operations
       ├─► bindBlankEvents()                     │
       └─► injectAggregateButtons()              │
                                                 │
       ▼                                         │
┌─────────────┐◄─────────────────────────────────┘
│    READY    │
│  (User can  │
│  interact)  │
└─────────────┘
```

**Functions involved:**
- `init()` - Entry point (line 1574)
- `ensureRailwayDefaults()` - Sets `window.RAILWAY_SERVER_URL` (line 1322)
- `restoreSavedUser()` - Loads from localStorage (line 1215)
- `assignQuestionIds()` - Assigns `WS-U3L6-7-Q{N}` to each blank (line 1091)
- `addSaveIndicators()` - Injects `✓ saved` spans (line 1099)
- `bindBlankEvents()` - Attaches blur/keydown handlers (line 1111)
- `injectAggregateButtons()` - Adds `📊 Class` buttons (line 1179)

---

## 2. User Session

Manages user identity persistence via localStorage.

```
┌───────────────┐
│   NO_USER     │
│ (username     │
│  field empty) │
└───────┬───────┘
        │ User types in #worksheetUsername
        │ + blur/submit triggers getUsername()
        ▼
┌───────────────┐
│  IDENTIFIED   │
│  (username    │◄───────────────────────────────┐
│   present)    │                                │
└───────┬───────┘                                │
        │                                        │
        │ localStorage.setItem()                 │
        ▼                                        │
┌───────────────┐                                │
│   PERSISTED   │                                │
│  (saved to    │────────────────────────────────┘
│  localStorage)│     Page reload triggers
└───────────────┘     restoreSavedUser()
```

**localStorage Key:** `worksheet-user`

**Stored Object:**
```javascript
{
  username: string,   // Required for server sync
  name: string,       // Display name
  klass: string       // Period/class
}
```

**Guard Condition:** Server sync operations abort if `getUsername()` returns empty string.

---

## 3. Blank Input Field

Each `.blank` input has its own interaction state machine.

```
┌─────────────┐
│    IDLE     │
│  (no focus, │
│  no value)  │
└──────┬──────┘
       │ User clicks/tabs into field
       ▼
┌─────────────┐
│   FOCUSED   │◄──────────────────────┐
│ (has focus, │                       │
│  bg: light  │                       │
│   blue)     │                       │
└──────┬──────┘                       │
       │                              │
       ├── User types ──► value changes
       │                              │
       ├── Enter key ─────────────────┤
       │   • handleLiveUpdate()       │
       │   • focus moves to next      │
       │     blank                    │
       │                              │
       └── Blur ──────────────────────┘
           • handleLiveUpdate()
           • Returns to IDLE or
             FILLED state

       ▼
┌─────────────┐
│   FILLED    │
│ (has value, │
│  no focus)  │
└─────────────┘
```

**CSS Classes Applied:**
| State | Class | Background |
|-------|-------|------------|
| Idle | (none) | transparent |
| Focused | `:focus` | `#f0f7ff` |
| Filled | (none) | transparent |

**Events:**
- `blur` → `handleLiveUpdate(blank)` (line 1114)
- `keydown[Enter]` → `handleLiveUpdate(blank)` + focus next (line 1115-1125)

---

## 4. Answer Validation

Per-blank validation state after `checkAnswer()` or `showAnswers()`.

```
                    ┌─────────────┐
                    │  UNCHECKED  │
                    │  (default)  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          │ checkAnswers() │ showAnswers()  │ resetAnswers()
          │                │                │
          ▼                ▼                ▼
    ┌───────────┐    ┌───────────┐    ┌───────────┐
    │ CHECKING  │    │ REVEALING │    │  CLEARED  │
    └─────┬─────┘    └─────┬─────┘    └───────────┘
          │                │                ▲
          │                │                │
    ┌─────┴─────┬──────────┤                │
    │           │          │                │
    ▼           ▼          ▼                │
┌───────┐ ┌─────────┐ ┌───────────┐         │
│CORRECT│ │ PARTIAL │ │ INCORRECT │         │
│ green │ │ yellow  │ │   red     │         │
└───┬───┘ └────┬────┘ └─────┬─────┘         │
    │          │            │               │
    │          │            ▼               │
    │          │      ┌───────────┐         │
    │          └─────►│ REVEALED  │◄────────┤
    └────────────────►│  purple   │         │
                      └─────┬─────┘         │
                            │               │
                            └───────────────┘
                              resetAnswers()
```

**Validation Logic (line 998-1027):**
```
normalize(userAnswer) vs normalize(acceptedAnswers)

EXACT MATCH:    userAnswer === accepted        → CORRECT
PARTIAL MATCH:  userAnswer.includes(accepted)  → PARTIAL
                OR accepted.includes(userAnswer)
NO MATCH:       else                           → INCORRECT
EMPTY:          !userAnswer                    → UNCHECKED
```

**CSS Classes:**
| State | Class | Background | Border |
|-------|-------|------------|--------|
| Correct | `.correct` | `#d4edda` | `#28a745` |
| Partial | `.partial` | `#fff3cd` | `#ffc107` |
| Incorrect | `.incorrect` | `#f8d7da` | `#dc3545` |
| Revealed | `.revealed` | `#e2e3f3` | `#6c757d` |

---

## 5. Score Display

Controls visibility of the score summary element.

```
┌──────────────┐
│    HIDDEN    │
│  (default,   │
│  display:    │
│   none)      │
└───────┬──────┘
        │
        │ checkAnswers() called
        │ AND total > 0
        ▼
┌──────────────┐
│   VISIBLE    │
│  "Score:     │
│   X/Y (Z%)"  │
│  +N partial  │
└───────┬──────┘
        │
        │ showAnswers() OR
        │ resetAnswers() OR
        │ total === 0
        ▼
┌──────────────┐
│    HIDDEN    │
└──────────────┘
```

**Element:** `#scoreDisplay`

**Visibility Toggle:**
- Add class `.visible` → `display: inline-block`
- Remove class `.visible` → `display: none`

---

## 6. Server Synchronization

Manages communication with Railway backend.

```
┌───────────────┐
│     IDLE      │
│  (no pending  │
│   requests)   │
└───────┬───────┘
        │
        │ handleLiveUpdate() OR
        │ checkAnswers() OR
        │ showAnswers()
        ▼
┌───────────────┐
│   DEBOUNCE    │──── <250ms since last ────► [ABORT]
│   CHECK       │     for same questionId
└───────┬───────┘
        │ ≥250ms elapsed
        ▼
┌───────────────┐
│  SUBMITTING   │
│  sendAnswer() │
└───────┬───────┘
        │
   ┌────┴────┐
   │         │
   ▼         ▼
┌──────┐  ┌──────┐
│SUCCESS│  │FAILED│
│       │  │      │
└───┬───┘  └───┬──┘
    │          │
    │          │ console.warn()
    │          │
    ▼          ▼
┌───────────────┐
│ showSaved()   │ (success only)
│ + refresh     │
│   drawer if   │
│   open        │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│     IDLE      │
└───────────────┘
```

**Debounce Map:** `debounceMap = new Map<questionId, timestamp>`

**API Endpoints:**
| Operation | Method | Endpoint |
|-----------|--------|----------|
| Submit Answer | POST | `/api/submit-answer` |
| Fetch Stats | GET | `/api/question-stats/:questionId` |

**Payload (submit):**
```javascript
{
  username: string,
  question_id: "WS-U3L6-7-Q{N}",
  answer_value: string,
  timestamp: number
}
```

**Client Abstraction:** Prefers `window.railwayClient.submitAnswer()` if available (line 1244).

---

## 7. Aggregate Drawer

Slide-out panel showing class response distribution for a **single input** with focus-following behavior.

```
┌───────────────┐
│    CLOSED     │
│  (right:      │
│   -380px)     │
└───────┬───────┘
        │
        │ Click "📊 Class" button OR
        │ focus input while drawer open
        │ openDrawerForBlank(blank)
        ▼
┌───────────────┐
│   OPENING     │
│  (transition  │
│   0.25s)      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    OPEN       │◄───────────────────────────┐
│  (right: 0)   │                            │
└───────┬───────┘                            │
        │                                    │
        │ currentFocusedBlank = blank        │
        │ Update title with question ID      │
        ▼                                    │
┌───────────────┐                            │
│   LOADING     │                            │
│  "Loading..." │                            │
│  for single   │                            │
│  input        │                            │
└───────┬───────┘                            │
        │                                    │
        │ fetchQuestionStats(blank.id)       │
        ▼                                    │
┌───────────────┐                            │
│  DISPLAYING   │                            │
│  Single bar   │                            │
│  chart with   │                            │
│  count-scaled │                            │
│  bars         │                            │
└───────┬───────┘                            │
        │                                    │
        │ spawnPeerSnow()                    │
        │                                    │
        ├─── User tabs to new input ─────────┘
        │    handleBlankFocus() triggers
        │    loadAggregateDataForBlank()
        │
        ├─── User submits answer ────────────┘
        │    refreshDrawerIfOpen()
        │
        │ Click × button OR
        │ Press Escape key
        │ closeDrawer()
        ▼
┌───────────────┐
│   CLOSING     │
│  (transition  │
│   0.25s)      │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    CLOSED     │
└───────────────┘
```

**Key Changes (v2):**
- **Focus-following:** Drawer updates when user tabs between inputs
- **Single chart:** One bar chart per input (not grouped by question)
- **Count-scaled bars:** Bars scaled by max count, not percentage
- **Escape key:** Closes drawer via `bindGlobalKeys()`
- **Keyboard hint:** Header shows "Tab to change input • Esc to close"

**CSS Animation:**
```css
.aggregate-drawer {
  right: -380px;
  transition: right 0.25s ease;
}
.aggregate-drawer.open {
  right: 0;
}
```

**Global State:** `currentFocusedBlank: HTMLInputElement | null`

**Chart Header Structure:**
```html
<div class="chart-header">
  <strong>WS-U4L1-3-Q5</strong>
  <span class="chart-question-num">Question 5.</span>
  <span class="chart-total">12 responses</span>
</div>
```

**API Response Format Detection:**

The `renderBarChart` function handles multiple API response formats:

| Format | Detection | Display |
|--------|-----------|---------|
| `responses` array | `stats.responses` exists | Count responses directly |
| Distribution with `totalResponses` | `stats.totalResponses > 0` | Convert percentages to counts |
| Distribution percentages (no total) | `sumValues <= 101` and `entries > 1` | Show as "Distribution" with % |
| Distribution counts | `sumValues > 101` | Show as "N responses" |

**Percentage Detection Heuristic:**
```javascript
// If values sum to ~100 (allowing for rounding) and there are multiple entries,
// treat as percentages rather than raw counts
if (sumValues > 0 && sumValues <= 101 && rawEntries.length > 1) {
    isPercentages = true;
    total = null;  // Don't show "100 responses"
    // Display values with % symbol
}
```

This prevents the bug where percentage distributions (summing to 100) would incorrectly display as "100 responses gathered".

---

## 8. Save Indicator

Per-question feedback showing successful server sync.

```
┌───────────────┐
│    HIDDEN     │
│  (opacity: 0) │
└───────┬───────┘
        │
        │ sendAnswer() resolves successfully
        │ showSaved(blank) called
        ▼
┌───────────────┐
│   VISIBLE     │
│ "✓ saved"     │
│ (opacity: 1)  │
└───────┬───────┘
        │
        │ setTimeout 2000ms
        ▼
┌───────────────┐
│   FADING      │
│ (transition   │
│  opacity      │
│  0.2s)        │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│    HIDDEN     │
└───────────────┘
```

**Element:** `.save-indicator` (one per `.question`)

**Visibility:**
```css
.save-indicator { opacity: 0; transition: opacity 0.2s ease; }
.save-indicator.visible { opacity: 1; }
```

---

## 9. Particle Effects

Decorative animations for user feedback.

### 9a. Upload Particle (↑)

Spawned on successful answer save.

```
┌───────────────┐
│   SPAWNED     │
│  positioned   │
│  above blank  │
└───────┬───────┘
        │
        │ CSS animation: floatUp
        │ duration: 0.9s
        ▼
┌───────────────┐
│  ANIMATING    │
│  translateY   │
│  (-16px)      │
│  opacity → 0  │
└───────┬───────┘
        │
        │ setTimeout 900ms
        │ particle.remove()
        ▼
┌───────────────┐
│   REMOVED     │
└───────────────┘
```

### 9b. Snow Particle (❄)

Spawned when drawer content loads.

```
┌───────────────┐
│   SPAWNED     │
│  positioned   │
│  near drawer  │
└───────┬───────┘
        │
        │ CSS animation: snowDrift
        │ duration: 1.4s
        ▼
┌───────────────┐
│  ANIMATING    │
│  translateY   │
│  (-18px)      │
│  rotate(10°)  │
│  opacity → 0  │
└───────┬───────┘
        │
        │ setTimeout 1400ms
        │ particle.remove()
        ▼
┌───────────────┐
│   REMOVED     │
└───────────────┘
```

---

## 10. Global Worksheet Actions

Top-level control buttons that orchestrate multiple state machines.

```
                        ┌─────────────────┐
                        │  NORMAL MODE    │
                        │  (default)      │
                        └────────┬────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ CHECK ANSWERS   │    │  SHOW ANSWERS   │    │     RESET       │
│ checkAnswers()  │    │  showAnswers()  │    │ resetAnswers()  │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │                      │                      │
┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
│ For each blank: │    │ For each blank: │    │ For each blank: │
│ • checkAnswer() │    │ • Set value to  │    │ • Clear value   │
│ • Apply class   │    │   primary answer│    │ • Remove all    │
│                 │    │ • Add .revealed │    │   validation    │
│ Calculate score │    │                 │    │   classes       │
│ Show scoreDisp  │    │ Hide scoreDisp  │    │                 │
│                 │    │                 │    │ For textareas:  │
│ pushAllAnswers()│    │ pushAllAnswers()│    │ • Clear value   │
│ refreshDrawer() │    │ refreshDrawer() │    │                 │
└────────┬────────┘    └────────┬────────┘    │ Hide scoreDisp  │
         │                      │             └────────┬────────┘
         │                      │                      │
         └──────────────────────┴──────────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  NORMAL MODE    │
                        └─────────────────┘
```

### Button Actions Summary

| Button | Function | Side Effects |
|--------|----------|--------------|
| ✓ Check | `checkAnswers()` | Validates all, shows score, syncs to server, refreshes drawer |
| 👁 Show | `showAnswers()` | Fills all with correct answers, hides score, syncs, refreshes |
| ↺ Reset | `resetAnswers()` | Clears all inputs and textareas, removes classes, hides score |
| 🖨 Print | `window.print()` | Opens print dialog (CSS hides controls) |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER ACTIONS                               │
└─────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         │ Type in      │ Click        │ Click        │ Click
         │ blank        │ Check        │ Show         │ Class
         ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│handleLive   │  │checkAnswers │  │showAnswers  │  │openDrawer   │
│Update()     │  │()           │  │()           │  │ForQuestion()│
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       │                │                │                │
       ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         sendAnswer()                                 │
│                    (debounced per question)                          │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      RAILWAY SERVER                                  │
│           https://curriculumrender-production.up.railway.app         │
│                                                                      │
│  POST /api/submit-answer     GET /api/question-stats/:id             │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    fetchQuestionStats()                              │
│              (called when drawer opens or refreshes)                 │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              renderBarChartFromResponses/Distribution()              │
│                     (updates drawer content)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Persistence Summary

| State | Storage | Key/Mechanism |
|-------|---------|---------------|
| User identity | localStorage | `worksheet-user` |
| Answer values | Server | `POST /api/submit-answer` |
| Validation states | DOM classes | `.correct`, `.partial`, etc. |
| Drawer open state | DOM class | `.open` on `#aggregateDrawer` |
| Current focused input | JS variable | `currentFocusedBlank` |
| Debounce timestamps | JS Map | `debounceMap` |

---

## Print Mode

Special state activated via CSS `@media print`:

```
┌─────────────────┐
│   SCREEN MODE   │
│  (default)      │
└────────┬────────┘
         │
         │ window.print() called
         ▼
┌─────────────────┐
│   PRINT MODE    │
│                 │
│ Hidden:         │
│ • .controls     │
│ • .aggregate-   │
│   trigger       │
│ • .aggregate-   │
│   drawer        │
│ • .save-        │
│   indicator     │
│                 │
│ Modified:       │
│ • .blank bg:    │
│   transparent   │
│ • body bg:      │
│   white         │
│                 │
│ Page breaks:    │
│ • .section      │
│ • .exit-ticket  │
└─────────────────┘
```

---

## 11. AI Reflection Grading

Controls the AI grading workflow for reflection textareas.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AI REFLECTION GRADING STATE MACHINE                    │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  USER CLICKS    │
                         │ "🤖 Grade My    │
                         │  Reflections"   │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  BUTTON DISABLED        │
                    │  "⏳ Grading..."        │
                    └─────────────┬───────────┘
                                  │
                    ┌─────────────▼───────────┐
                    │  FOR EACH TEXTAREA:     │
                    │  (reflect53, reflect54a,│
                    │   reflect54b, reflect55,│◄────────┐
                    │   reflect56, exitTicket)│         │
                    └─────────────┬───────────┘         │
                                  │                     │
                    ┌─────────────▼───────────┐         │
                    │  CHECK ANSWER LENGTH    │         │
                    │  < 20 chars?            │         │
                    └─────────────┬───────────┘         │
                                  │                     │
                    ┌─────────────┴─────────────┐       │
                    │                           │       │
              TOO SHORT                    VALID        │
                    │                           │       │
                    ▼                           ▼       │
          ┌─────────────────┐    ┌─────────────────────┐│
          │  SKIP           │    │  BUILD AI PROMPT    ││
          │  (no grading)   │    │  buildReflection    ││
          └────────┬────────┘    │  Prompt()           ││
                   │             └──────────┬──────────┘│
                   │                        │           │
                   │                        ▼           │
                   │             ┌─────────────────────┐│
                   │             │  POST /api/ai/grade ││
                   │             │  with scenario,     ││
                   │             │  prompt, answer     ││
                   │             └──────────┬──────────┘│
                   │                        │           │
                   │              ┌─────────┴─────────┐ │
                   │              │                   │ │
                   │              ▼                   ▼ │
                   │      ┌───────────┐       ┌───────────┐
                   │      │  SUCCESS  │       │  FAILED   │
                   │      └─────┬─────┘       └─────┬─────┘
                   │            │                   │
                   │            ▼                   ▼
                   │      ┌───────────┐       ┌───────────┐
                   │      │ STORE IN  │       │ SHOW      │
                   │      │ grading   │       │ ERROR     │
                   │      │ State     │       │ FEEDBACK  │
                   │      └─────┬─────┘       └─────┬─────┘
                   │            │                   │
                   └────────────┼───────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  APPLY VISUAL STATE     │
                    │  .graded-E / P / I      │
                    └─────────────┬───────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  SHOW FEEDBACK PANEL    │
                    │  showReflectionFeedback │
                    └─────────────┬───────────┘
                                  │
                                  │ Next textarea
                                  └─────────────────────►

                    ┌─────────────────────────┐
                    │  ALL COMPLETE           │
                    │  Button restored        │
                    │  "🤖 Grade My..."       │
                    └─────────────────────────┘
```

**Grading Endpoint:** `POST /api/ai/grade`

**Request Payload:**
```javascript
{
  scenario: {
    topic: "AP Statistics - Experimental Design",
    questionId: "reflect53",
    lessonContext: { unit: 3, lessons: "6-7", ... }
  },
  answers: { answer: "student response" },
  prompt: "Built from ai-grading-prompts.js rubric"
}
```

**Response:**
```javascript
{
  score: "E" | "P" | "I",
  feedback: "Explanation of score",
  matched: ["elements found"],
  missing: ["elements missing"],
  suggestion: "How to improve",
  _model: "llama-3.3-70b-versatile"
}
```

---

## 12. Appeal System

Students can appeal P or I scores up to 3 times per question.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPEAL STATE MACHINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  GRADED STATE   │
                         │  Score: P or I  │
                         │  appealCount<3  │
                         └────────┬────────┘
                                  │
                                  │ "💬 Disagree?" button visible
                                  ▼
                         ┌─────────────────┐
                         │  APPEAL BUTTON  │
                         │  AVAILABLE      │
                         └────────┬────────┘
                                  │
                                  │ User clicks button
                                  ▼
                         ┌─────────────────┐
                         │  FORM OPENS     │
                         │  .appeal-form   │
                         │  .visible       │
                         └────────┬────────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                    CANCEL            SUBMIT
                         │                 │
                         ▼                 ▼
               ┌─────────────┐   ┌─────────────────┐
               │ FORM CLOSES │   │ VALIDATE TEXT   │
               │ (no change) │   │ length >= 10?   │
               └─────────────┘   └────────┬────────┘
                                          │
                                 ┌────────┴────────┐
                                 │                 │
                            TOO SHORT          VALID
                                 │                 │
                                 ▼                 ▼
                       ┌─────────────┐   ┌─────────────────┐
                       │ SHOW ALERT  │   │ DISABLE BUTTONS │
                       │ "More       │   │ "⏳ Processing" │
                       │  detail"    │   └────────┬────────┘
                       └─────────────┘            │
                                                  ▼
                                        ┌─────────────────┐
                                        │ POST /api/ai/   │
                                        │     appeal      │
                                        └────────┬────────┘
                                                 │
                                   ┌─────────────┴─────────────┐
                                   │                           │
                                SUCCESS                     FAILED
                                   │                           │
                         ┌─────────┴─────────┐                 │
                         │                   │                 │
                    UPGRADED            MAINTAINED             │
                         │                   │                 │
                         ▼                   ▼                 ▼
               ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
               │ "🎉 Appeal      │ │ "Score          │ │ "⚠️ Appeal      │
               │  Granted!"      │ │  Maintained"    │ │  Error"         │
               │ .appeal-result  │ │ .appeal-result  │ │ .appeal-result  │
               │ .upgraded       │ │ .maintained     │ │ .error          │
               └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                        │                   │                   │
                        └───────────────────┼───────────────────┘
                                            │
                                            ▼
                                  ┌─────────────────┐
                                  │ UPDATE STATE    │
                                  │ - appealCount++ │
                                  │ - history.push  │
                                  │ - result.score  │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ RE-RENDER       │
                                  │ FEEDBACK PANEL  │
                                  │ (new score,     │
                                  │  appeal count)  │
                                  └────────┬────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      │                                         │
               appealCount < 3                          appealCount >= 3
                      │                                         │
                      ▼                                         ▼
            ┌─────────────────┐                       ┌─────────────────┐
            │ APPEAL BUTTON   │                       │ "Maximum        │
            │ STILL AVAILABLE │                       │  appeals        │
            │ (if score != E) │                       │  reached"       │
            └─────────────────┘                       └─────────────────┘
```

**Appeal Endpoint:** `POST /api/ai/appeal`

**Request Payload:**
```javascript
{
  scenario: {
    questionId: "reflect53",
    topic: "AP Statistics - Experimental Design",
    prompt: "Question text from rubric",
    expectedElements: ["element descriptions"],
    lessonContext: { ... }
  },
  answers: { answer: "original student answer" },
  appealText: "Student's reasoning for appeal",
  previousResults: { answer: { score: "P", feedback: "..." } }
}
```

**Response:**
```javascript
{
  score: "E" | "P" | "I",
  feedback: "Appeal evaluation response",
  _provider: "groq",
  _model: "llama-3.3-70b-versatile",
  _appealProcessed: true
}
```

---

## 13. Grading State Management

Tracks per-question grading results and appeal history.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GRADING STATE STRUCTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

gradingState = Map<textareaId, GradingStateEntry>

GradingStateEntry:
┌─────────────────────────────────────────────────────────────────────────────┐
│  {                                                                           │
│    result: {                    // Current grading result                    │
│      score: "E" | "P" | "I",                                                 │
│      feedback: string,                                                       │
│      matched: string[],                                                      │
│      missing: string[],                                                      │
│      suggestion: string,                                                     │
│      _aiGraded: boolean,                                                     │
│      _model: string                                                          │
│    },                                                                        │
│    originalAnswer: string,      // Stored for appeals                        │
│    appealCount: number,         // 0-3, max 3 appeals                        │
│    history: [                   // Appeal history                            │
│      {                                                                       │
│        appealText: string,      // What student wrote                        │
│        previousScore: "P"|"I",  // Score before appeal                       │
│        newScore: "E"|"P"|"I",   // Score after appeal                        │
│        response: string,        // AI response                               │
│        upgraded: boolean        // Was appeal successful?                    │
│      },                                                                      │
│      ...                                                                     │
│    ]                                                                         │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

State Transitions:

┌─────────────┐                   ┌─────────────┐
│  EMPTY      │                   │  GRADED     │
│  (no entry) │ ─── gradeAll ───► │  appealCt=0 │
└─────────────┘                   └──────┬──────┘
                                         │
                                    appeal (if P/I)
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │  APPEALED   │
                                  │  appealCt=1 │ ◄────┐
                                  └──────┬──────┘      │
                                         │             │
                                    appeal again       │
                                    (if still P/I)     │
                                         │             │
                                         ▼             │
                                  ┌─────────────┐      │
                                  │  appealCt++ │ ─────┘
                                  │  (up to 3)  │
                                  └──────┬──────┘
                                         │
                                    appealCt >= 3
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │  EXHAUSTED  │
                                  │  No more    │
                                  │  appeals    │
                                  └─────────────┘
```

**State Persistence:** In-memory only (Map). Cleared on page refresh.

**Access Pattern:**
```javascript
// Get state for a question
const state = gradingState.get('reflect53');

// Check if can appeal
const canAppeal = state &&
                  state.result.score !== 'E' &&
                  state.appealCount < 3;

// Update after appeal
state.appealCount++;
state.history.push({ ... });
state.result.score = newScore;
```

---

## 14. Coin Flip Activity Grid (U4 only)

Interactive 100-cell grid where students enter their "fake" random coin flip sequence.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COIN FLIP ACTIVITY GRID STATE MACHINE                     │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │  GRID CREATED   │
                         │  (100 cells,    │
                         │   all empty)    │
                         └────────┬────────┘
                                  │
                                  │ generateCoinGrid() on init
                                  ▼
                         ┌─────────────────┐
                         │  AWAITING INPUT │◄──────────────────┐
                         │  (cells ready)  │                   │
                         └────────┬────────┘                   │
                                  │                            │
                                  │ User types in cell         │
                                  ▼                            │
                         ┌─────────────────┐                   │
                         │  INPUT EVENT    │                   │
                         │  (validate H/T) │                   │
                         └────────┬────────┘                   │
                                  │                            │
                        ┌─────────┴─────────┐                  │
                        │                   │                  │
                   VALID (H/T)          INVALID                │
                        │                   │                  │
                        ▼                   ▼                  │
              ┌─────────────────┐  ┌─────────────────┐         │
              │  ACCEPT INPUT   │  │  CLEAR INPUT    │         │
              │  • Uppercase    │  │  • Set to ''    │         │
              │  • Store value  │  └────────┬────────┘         │
              └────────┬────────┘           │                  │
                       │                    │                  │
                       │                    └──────────────────┘
                       ▼
              ┌─────────────────┐
              │  AUTO-ADVANCE   │
              │  Focus next     │
              │  cell (if < 99) │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  UPDATE SUMMARY │
              │  updateActivity │
              │  Summary()      │
              └────────┬────────┘
                       │
                       │ Calculate:
                       │ • Total Heads
                       │ • Total Tails
                       │ • Longest Streak
                       ▼
              ┌─────────────────┐
              │  DISPLAY STATS  │
              │  #activityHeads │
              │  #activityTails │
              │  #activityStreak│
              └─────────────────┘
```

**Input Validation:**
- Only accepts: `H`, `h`, `T`, `t`, or empty
- Auto-converts to uppercase
- Any other character is rejected (input cleared)

**Auto-Advance Logic:**
```javascript
if (val && i < 99) {
    const nextInput = grid.querySelector(`input[data-index="${i + 1}"]`);
    if (nextInput) nextInput.focus();
}
```

**Summary Calculation:**
```javascript
// Streak detection algorithm
inputs.forEach(input => {
    const val = input.value.toUpperCase();
    if (val === 'H') heads++;
    if (val === 'T') tails++;

    if (val && val === lastVal) {
        currentStreak++;
    } else if (val) {
        currentStreak = 1;
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    if (val) lastVal = val;
});
```

**CSS Structure:**
```css
.activity-grid {
    display: grid;
    grid-template-columns: repeat(20, 1fr);  /* 20 columns × 5 rows */
    gap: 2px;
}
.activity-cell input {
    width: 100%;
    height: 100%;
    text-align: center;
    text-transform: uppercase;
}
```

---

## Updated State Persistence Summary

| State | Storage | Key/Mechanism |
|-------|---------|---------------|
| User identity | localStorage | `worksheet-user` |
| Answer values | Server | `POST /api/submit-answer` |
| Validation states | DOM classes | `.correct`, `.partial`, etc. |
| Drawer open state | DOM class | `.open` on `#aggregateDrawer` |
| Current focused input | JS variable | `currentFocusedBlank` |
| Debounce timestamps | JS Map | `debounceMap` |
| **AI grading results** | JS Map | `gradingState` |
| **Appeal history** | JS Map | `gradingState[id].history` |
| **Appeal count** | JS Map | `gradingState[id].appealCount` |
| **Coin flip grid (U4)** | DOM inputs | `#coinGrid input[data-index]` |
