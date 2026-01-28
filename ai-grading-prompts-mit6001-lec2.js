/**
 * AI Grading Prompts for MIT 6.0001 Lecture 2: Branching and Iteration
 *
 * Based on MIT OpenCourseWare 6.0001 Introduction to Computer Science
 * and Programming in Python, Fall 2016, Instructor: Ana Bell
 *
 * Topics covered:
 * - Strings and string operations (concatenation, repetition)
 * - Print function nuances (commas vs. concatenation)
 * - User input and type casting
 * - Comparison and logic operators
 * - Branching with if, elif, else
 * - While loops and for loops
 * - range() function
 * - break statement
 */

const LESSON_CONTEXT_MIT6001_LEC2 = {
  course: "MIT 6.0001",
  lecture: 2,
  title: "Branching and Iteration",
  instructor: "Ana Bell",
  keyTopics: [
    "Strings as sequences of characters",
    "String concatenation (+) and repetition (*)",
    "print() with commas vs. concatenation",
    "input() always returns a string",
    "Type casting for math operations",
    "Comparison operators (>, <, ==, !=, >=, <=)",
    "Logic operators (and, or, not)",
    "Branching: if, elif, else",
    "Code blocks and indentation",
    "While loops for unknown iterations",
    "For loops with range() for known iterations",
    "range(stop), range(start, stop), range(start, stop, step)",
    "break statement to exit loops early"
  ],
  keyVocabulary: {
    "string": "A sequence of characters enclosed in quotation marks",
    "concatenation": "Joining strings together using the + operator",
    "casting": "Converting one type to another (e.g., int(), float(), str())",
    "branching": "Choosing different code paths based on conditions",
    "iteration": "Repeating code multiple times using loops",
    "code block": "Indented group of statements that execute together",
    "condition": "An expression that evaluates to True or False",
    "infinite loop": "A loop whose condition never becomes False"
  },
  keyPrinciples: [
    "User input via input() is ALWAYS a string - must cast for math",
    "Single = is assignment, double == is equality test",
    "Commas in print() add spaces automatically; concatenation gives precise control",
    "Code blocks are defined by indentation (typically 4 spaces)",
    "In if-elif-else, only the FIRST true condition's block executes",
    "While loops are for unknown/unpredictable iteration counts",
    "For loops are for known iteration counts",
    "range(n) produces 0 to n-1, not 0 to n",
    "break exits only the innermost loop"
  ]
};

/**
 * Grading rubrics for each reflection question
 * Following E/P/I scoring (Essentially correct / Partially correct / Incorrect)
 */
const REFLECTION_RUBRICS_MIT_LEC2 = {

  // R1: Why input() returns a string by default
  "reflect1": {
    questionText: "Why does Python treat user input as a string by default, and what problem does this create for math operations?",
    expectedElements: [
      { id: "universal-type", description: "Strings can represent ANY input (text, numbers, symbols)", required: true },
      { id: "math-problem", description: "Math operators on strings do different things (concatenation/repetition instead of arithmetic)", required: true },
      { id: "cast-solution", description: "Must cast to int/float to do math operations", required: true },
      { id: "example", description: "Gives an example like '5' * 3 = '555' vs 5 * 3 = 15", required: false }
    ],
    scoringGuide: {
      E: "Explains that strings are universal AND that math operators behave differently on strings, requiring casting",
      P: "Mentions one aspect (universal input OR math problem) but doesn't fully connect them",
      I: "Doesn't explain why strings are the default OR doesn't identify the math operation problem"
    },
    commonMistakes: [
      "Just saying 'you need to cast' without explaining why",
      "Not recognizing that * and + work on strings but do different things",
      "Thinking input() sometimes returns numbers"
    ],
    contextFromVideo: `From the lecture: "Whatever the user types in is always interpreted as a string... If a user types in a number, that becomes the string of that number. So if the user gave me 5, what do you think is going to be printed out? 25 or 5 five times? Exactly - 5 five times."`
  },

  // R2: Why = causes syntax error in if
  "reflect2": {
    questionText: "Explain why if x = 5: causes a syntax error but if x == 5: works. What's the conceptual difference?",
    expectedElements: [
      { id: "single-is-assignment", description: "Single = is the assignment operator (binds a value to a name)", required: true },
      { id: "double-is-comparison", description: "Double == is the equality test (compares two values, returns Boolean)", required: true },
      { id: "condition-needs-boolean", description: "if statement needs a condition that evaluates to True/False", required: true },
      { id: "assignment-not-test", description: "Assignment doesn't produce a Boolean, so it can't be used as a condition", required: false }
    ],
    scoringGuide: {
      E: "Clearly distinguishes assignment (=) from equality test (==) and explains why conditions need Boolean values",
      P: "Knows the operators are different but doesn't fully explain why assignment can't be a condition",
      I: "Confuses assignment and equality OR doesn't explain the Boolean requirement"
    },
    commonMistakes: [
      "Just saying '= is wrong, use ==' without explaining why",
      "Not connecting to the Boolean requirement for conditions",
      "Thinking = would 'set x to 5 and then check' (that's not how Python works)"
    ],
    contextFromVideo: `From the lecture: "The single equals sign is an assignment. So you're taking a value and you're assigning it to a variable. But when you're doing the double equals sign, this is the test for equality... If you just use one equals sign, Python's going to give you an error. It's going to say syntax error."`
  },

  // R3: Why while loop is needed for Lost Woods
  "reflect3": {
    questionText: "In the Lost Woods example, why can't we solve the problem with just if/elif/else statements? What makes a while loop necessary?",
    expectedElements: [
      { id: "unknown-iterations", description: "Don't know how many times the user will go right", required: true },
      { id: "infinite-nesting", description: "Would need infinitely nested if statements (one for each possible 'right')", required: true },
      { id: "while-repeats", description: "While loop can repeat the same code block any number of times", required: true },
      { id: "user-unpredictable", description: "User input is unpredictable - might go right 1000 times", required: false }
    ],
    scoringGuide: {
      E: "Explains that unknown iteration count requires infinite nesting with if/else, but while loop handles this elegantly",
      P: "Mentions unknown iterations but doesn't clearly explain the infinite nesting problem",
      I: "Doesn't understand why if statements can't handle the problem OR doesn't see the unknown iteration issue"
    },
    commonMistakes: [
      "Thinking you could just use 'a lot' of if statements",
      "Not recognizing the fundamental problem of unknown iteration count",
      "Confusing 'hard to write' with 'impossible to write'"
    ],
    contextFromVideo: `From the lecture: "How many times do you know how many times the user might keep going right? They might be really persistent... Maybe if I go 1,000 times, I'll get out of the woods. Maybe 1,001? So this would probably be who knows how deep with nested ifs. So we don't know. With what we know so far, we can't really code this cute little game. But enter loops."`
  },

  // R4: When to use for vs while loops
  "reflect4": {
    questionText: "When would you choose a for loop over a while loop, and vice versa? Give an example scenario for each.",
    expectedElements: [
      { id: "for-known", description: "For loops when you KNOW the number of iterations in advance", required: true },
      { id: "while-unknown", description: "While loops when iterations are unpredictable/unknown", required: true },
      { id: "for-example", description: "Example for for loop (e.g., sum numbers 1-10, process each item in a list)", required: true },
      { id: "while-example", description: "Example for while loop (e.g., user input, searching until found, game loop)", required: true }
    ],
    scoringGuide: {
      E: "Correctly identifies when to use each loop type AND provides appropriate examples for both",
      P: "Understands the distinction but examples are weak, missing, or not clearly matched to loop type",
      I: "Confuses when to use for vs while OR provides inappropriate examples"
    },
    commonMistakes: [
      "Thinking for loops are 'better' or 'simpler' in all cases",
      "Not recognizing that user input is the classic while loop case",
      "Giving examples where either loop would work equally well"
    ],
    contextFromVideo: `From the lecture: "For loops you usually use when you know the number of iterations. While loops are very useful when, for example, you're getting user input, and user input is unpredictable. You don't know how many times they're going to do a certain task."`
  },

  // Exit Ticket: Trace for loop with range
  "exitTicket": {
    questionText: "Trace through the code and explain what it prints and why: total = 0; for i in range(1, 4): total = total + i; print(total)",
    expectedElements: [
      { id: "range-values", description: "range(1, 4) produces 1, 2, 3 (not 4!)", required: true },
      { id: "trace-iterations", description: "Shows iterations: total=0+1=1, then 1+2=3, then 3+3=6", required: true },
      { id: "final-answer", description: "Final printed value is 6", required: true },
      { id: "explains-accumulator", description: "Recognizes total as an accumulator pattern", required: false }
    ],
    scoringGuide: {
      E: "Correctly identifies range produces 1,2,3, traces each iteration showing total updates, arrives at 6",
      P: "Gets final answer right but trace is incomplete, OR understands trace but makes arithmetic error",
      I: "Misunderstands range (includes 4 or starts at 0) OR doesn't trace properly"
    },
    commonMistakes: [
      "Including 4 in the range (range(1,4) goes to 4-1=3)",
      "Starting at 0 instead of 1",
      "Not showing step-by-step accumulation",
      "Forgetting that range stops at stop-1"
    ],
    contextFromVideo: `From the lecture: "range(5) actually creates internally a sequence of numbers starting from 0 and going to that number 5 minus 1... If you give it two things in the parentheses, you're giving it start and stop. So the first being start, the second being stop. And step gets this value of 1 by default."`
  }
};

/**
 * Build AI grading prompt for a specific reflection question
 * @param {string} questionId - The textarea ID (e.g., "reflect1")
 * @param {string} studentAnswer - The student's written response
 * @returns {string} Complete prompt for AI grading
 */
function buildReflectionPromptMIT_LEC2(questionId, studentAnswer) {
  const rubric = REFLECTION_RUBRICS_MIT_LEC2[questionId];
  if (!rubric) {
    throw new Error(`Unknown question ID: ${questionId}`);
  }

  const expectedList = rubric.expectedElements
    .map((e, i) => `${i + 1}. ${e.description}${e.required ? ' (REQUIRED)' : ' (optional)'}`)
    .join('\n');

  const mistakesList = rubric.commonMistakes
    .map((m, i) => `- ${m}`)
    .join('\n');

  return `You are a computer science instructor grading a student's response to a reflection question about programming concepts.

## Course Context
MIT 6.0001: Introduction to Computer Science and Programming in Python
Lecture 2: Branching and Iteration
Instructor: Ana Bell

## Key Vocabulary for This Lecture
${Object.entries(LESSON_CONTEXT_MIT6001_LEC2.keyVocabulary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

## Question
${rubric.questionText}

## Expected Elements (Rubric)
${expectedList}

## Scoring Guide
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

## Common Mistakes to Watch For
${mistakesList}

## Lesson Context from Video
${rubric.contextFromVideo}

## Student's Response
"${studentAnswer}"

## Instructions
Grade this response using the E/P/I scoring system. Be generous but accurate.
- Award credit for correct concepts even if phrasing is imperfect
- Look for understanding of key relationships, not just keywords
- Students may use their own words to express concepts
- Introductory CS students may not use precise terminology

Respond in JSON format:
{
  "score": "E" or "P" or "I",
  "feedback": "1-2 sentence explanation of the grade",
  "matched": ["list of rubric elements the student addressed"],
  "missing": ["list of required rubric elements the student missed"],
  "suggestion": "One specific thing the student could add to improve (optional for E scores)"
}`;
}

/**
 * Get the rubric configuration for a question
 * @param {string} questionId
 * @returns {object} The rubric object
 */
function getRubricMIT_LEC2(questionId) {
  return REFLECTION_RUBRICS_MIT_LEC2[questionId] || null;
}

/**
 * Get all reflection question IDs
 * @returns {string[]} Array of question IDs
 */
function getReflectionQuestionIdsMIT_LEC2() {
  return Object.keys(REFLECTION_RUBRICS_MIT_LEC2);
}

// Export for use in browser
if (typeof window !== 'undefined') {
  window.REFLECTION_RUBRICS_MIT_LEC2 = REFLECTION_RUBRICS_MIT_LEC2;
  window.LESSON_CONTEXT_MIT6001_LEC2 = LESSON_CONTEXT_MIT6001_LEC2;
  window.buildReflectionPromptMIT_LEC2 = buildReflectionPromptMIT_LEC2;
  window.getRubricMIT_LEC2 = getRubricMIT_LEC2;
  window.getReflectionQuestionIdsMIT_LEC2 = getReflectionQuestionIdsMIT_LEC2;
}

// Export for Node.js (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    REFLECTION_RUBRICS_MIT_LEC2,
    LESSON_CONTEXT_MIT6001_LEC2,
    buildReflectionPromptMIT_LEC2,
    getRubricMIT_LEC2,
    getReflectionQuestionIdsMIT_LEC2
  };
}
