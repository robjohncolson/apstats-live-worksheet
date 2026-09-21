/**
 * AI Grading Prompts for Unit 1 Lesson 5: Topic 1.5
 * Topic 1.5: Topic 1.5
 *
 * Learning Objectives:
 *   Classify quantitative variables as discrete or continuous
 *   Represent quantitative data with dotplots, stem-and-leaf plots, and histograms
 *   Describe advantages and disadvantages of common graphs for quantitative data
 *   Explain how graph choice depends on data type and data-set size
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L5 = `
VIDEO 1 - Representing a Quantitative Variable with Graphs (~8:37):
- The video focuses on two big questions: the two types of quantitative variables and the advantages and disadvantages of common graphs for quantitative data.
- It reviews that categorical variables use labels, while quantitative variables use numerical values for a measured or counted quantity.
- A discrete variable can take a countable number of values with gaps.
- The lesson uses number of siblings as a discrete example because values like 2.5 siblings are not possible.
- A continuous variable can take infinitely many values with no gaps.
- The lesson uses a person's height as a continuous example because values between whole numbers are possible.
- The teacher summarizes that discrete variables usually come from counting and continuous variables usually come from measuring.
- The Flint water crisis example uses lead levels from 71 water samples collected from Flint residents.
- Even though the displayed lead levels were rounded to whole numbers, the original measurements included decimals, so the variable is continuous.
- The teacher says the dotplot is his personal favorite display.
- In a dotplot, each observation is represented by a dot, so all 71 observations can be seen.
- A dotplot makes the shape of the distribution easy to see.
- A disadvantage of dotplots is that they become difficult to make for very large data sets.
- A stem-and-leaf plot splits each value into a stem and a leaf.
- The value 104 is represented by a stem of 10 and a leaf of 4.
- If a stem has many values, it can be split into two stems, with one handling 0 to 4 and the other handling 5 to 9.
- Like a dotplot, a stem-and-leaf plot shows every individual value and makes the shape easy to see.
- A stem-and-leaf plot is also harder to make for large data sets.
- A histogram uses intervals or bins and counts how many observations fall in each interval.
- In the histogram example, values on endpoints go into the bar for the left endpoint, so 10 belongs in the 0 to 10 bar and 20 belongs in the 10 to 20 bar.
- Changing the interval width can change the appearance of the histogram.
- A histogram is easier to make for large data sets and still makes the shape easy to see.
- The disadvantage of a histogram is that it does not show every exact individual value.
- The lesson closes by emphasizing that dotplots and stem-and-leaf plots show each value but are harder for large data sets, while histograms work better for large data sets but lose exact values.
`;
// Rubrics for each reflection question
window.RUBRICS_U1L5 = {
    reflect1: {
        questionText: 'Explain the difference between a discrete quantitative variable and a continuous quantitative variable. Use one example from the lesson.',
        expectedElements: [
            { id: 'discrete-definition', description: 'Explains that a discrete variable has countable values or has gaps between possible values', required: true },
            { id: 'continuous-definition', description: 'Explains that a continuous variable has infinitely many possible values or no gaps between values', required: true },
            { id: 'counting-measuring', description: 'Connects discrete to counting and continuous to measuring', required: false },
            { id: 'lesson-example', description: 'Uses a correct lesson example such as number of siblings for discrete, height for continuous, or Flint water measurements as continuous', required: false },
            { id: 'rounded-values-note', description: 'May mention that rounded data can still come from a continuous variable when the original values included decimals', required: false }
        ],
        scoringGuide: {
            E: 'Explains that a discrete variable takes countable values with gaps between them, and a continuous variable can take any value in an interval. Counting-versus-measuring language, or correct examples of both types, counts as that explanation.',
            P: 'Explains one type correctly, but the other is missing or muddled.',
            I: 'Does not correctly distinguish discrete from continuous quantitative variables.'
        },
        commonMistakes: [
            'Saying discrete just means small numbers',
            'Calling any decimal value discrete',
            'Ignoring the idea of gaps between possible values',
            'Giving an example that does not match the definition'
        ],
        contextFromVideo: 'The lesson defines discrete variables as countable with gaps and continuous variables as having infinitely many values with no gaps. It uses number of siblings as discrete, height as continuous, and Flint water lead levels as continuous because the original measurements included decimals.'
    },

    reflect2: {
        questionText: 'Compare a dotplot or stem-and-leaf plot with a histogram. When is a histogram more useful, and what information do you lose?',
        expectedElements: [
            { id: 'large-data-set', description: 'Explains that a histogram is more useful for a large data set', required: true },
            { id: 'shows-individual-values', description: 'Explains that a dotplot or stem-and-leaf plot shows each individual value', required: false },
            { id: 'histogram-intervals', description: 'Explains that a histogram groups data into intervals or bins', required: false },
            { id: 'lose-exact-values', description: 'States that a histogram does not show each exact individual value', required: true },
            { id: 'shape-idea', description: 'May mention that both types of displays still help show the shape of the distribution', required: false }
        ],
        scoringGuide: {
            E: 'Says a histogram is more useful for a large data set, and that it no longer shows each exact individual value.',
            P: 'Gives either when a histogram is more useful or what is lost, but not both clearly.',
            I: 'Does not correctly compare a histogram with a dotplot or stem-and-leaf plot.'
        },
        commonMistakes: [
            'Saying histograms show every exact data value',
            'Ignoring the role of intervals or bins in a histogram',
            'Not mentioning that large data sets make histograms more useful',
            'Comparing graph appearance without explaining what information is lost'
        ],
        contextFromVideo: 'The video says dotplots and stem-and-leaf plots show each individual value and make the shape easy to see, but they are hard to make for very large data sets. Histograms use intervals, are easier for large data sets, still show shape, and lose the exact values.'
    },

    exitTicket: {
        questionText: 'A teacher recorded the number of siblings for 12 students. Classify the variable, explain why, choose the best display for the data set, and justify your choice by explaining one advantage of that display and why a histogram would hide useful information.',
        expectedElements: [
            { id: 'discrete-classification', description: 'Classifies number of siblings as a discrete variable', required: true },
            { id: 'countable-gaps-explanation', description: 'Explains that the values are countable whole-number counts with gaps, so values like 2.5 siblings are not possible', required: true },
            { id: 'best-display-choice', description: 'Chooses a dotplot or stem-and-leaf plot as the better display for this small data set', required: true },
            { id: 'chosen-display-advantage', description: 'Explains that the chosen display shows each individual value and/or makes the shape easy to see', required: false },
            { id: 'histogram-limitation', description: 'Explains that a histogram would group the data into intervals and hide the exact values for this small set', required: true }
        ],
        scoringGuide: {
            E: 'Classifies number of siblings as discrete with a correct reason, chooses a dotplot or stem-and-leaf plot for this small data set, and explains that a histogram would group the values and hide them.',
            P: 'Most of those ideas are correct, but one is missing or muddled.',
            I: 'Two or more of those ideas are missing or wrong.'
        },
        commonMistakes: [
            'Calling number of siblings continuous because the values are numbers',
            'Choosing a histogram without explaining the loss of exact values',
            'Forgetting that sibling counts cannot take values like 2.5',
            'Describing the graph without tying it to this small data set'
        ],
        contextFromVideo: 'The lesson says discrete variables are countable with gaps and that dotplots and stem-and-leaf plots are especially helpful when you want to see each individual value. Histograms are better for large data sets but do not show exact values.'
    }
};
// Build reflection prompt for AI grading
window.buildReflectionPromptU1L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L5[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.5: Topic 1.5.

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Key Elements (what a complete answer usually covers)
${requiredElements}

## Optional Elements (bonus, not required)
${optionalElements || 'None'}

## Scoring Guide
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

## Common Mistakes to Watch For
${rubric.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Lesson Context
${rubric.contextFromVideo}

## Instructions
GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

Grade the student's response. Return JSON:
{
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU1L5 = function(questionId) {
    return window.RUBRICS_U1L5[questionId] || null;
};

