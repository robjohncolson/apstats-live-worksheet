/**
 * AI Grading Prompts for Unit 9 Lesson 4: Setting Up a Test for the Slope of a Regression Model
 * Topic 9.4: Setting Up a Test for the Slope of a Regression Model
 *
 * Learning Objectives:
 *   State the null and alternative hypotheses for a test about slope
 *   Define the parameter beta in context
 *   Choose between one-sided and two-sided alternatives based on the research question
 *   Identify the t-test for slope as the appropriate procedure
 *   Verify the four conditions for performing a test about slope
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U9L4 = `
VIDEO 1 - Stating the Null and Alternative Hypotheses (~7:40):
- The lesson asks how to state a null hypothesis and alternative hypothesis in a test about the slope of a population regression line.
- The Texas Algebra 1 attendance study is introduced: researchers collected data on percent of school days attended and number of questions answered correctly for a random sample of 11 students.
- Computer output shows: Constant coef = -7.69, Attendance coef = 0.57, SE = 0.062, T = 9.18, P = 0.000, S = 1.99, R-sq = 90.3%.
- The research question: Do the data give convincing evidence at alpha = 0.01 of a positive linear relationship between test score and percent attendance?
- The null hypothesis is typically H0: beta = 0, meaning no linear relationship (horizontal regression line with slope zero).
- The alternative hypothesis uses a strict inequality: beta > 0 (positive), beta < 0 (negative), or beta != 0 (any relationship).
- For the Texas study, Ha: beta > 0 because researchers suspected a positive linear relationship.
- One-sided alternatives match directional claims; two-sided alternatives test for any linear relationship.
- The choice of alternative must be stated before data collection.
- Never refer to sample statistics like b in the hypotheses. Always define the parameter beta.
- Practice problem: "Don't Spill My Drink!" experiment with 25 trials of car speed vs. drink spilled.
- Since no direction was specified, the correct alternative is Ha: beta != 0 (two-sided).
- Beta is defined as the slope of the true regression line for predicting amount of drink spilled from car speed on a bumpy dirt road.

VIDEO 2 - Identifying the Procedure and Checking Conditions (~7:06):
- The appropriate significance test procedure for the slope of a population regression line is the t-test for slope.
- There are four conditions for inference about slope:
  1. The true relationship between x and y is linear. Check with scatterplot and residual plot (no curved pattern).
  2. The standard deviation of y does not vary with x. Check that residuals are similar in size across x values.
  3. For a particular value of x, the y-values are approximately normally distributed. Check with a dotplot of residuals for skewness or outliers.
  4. Independence in data collection: requires random sample or randomized experiment, and n <= 10% of N when sampling without replacement.
- Applying to the Texas data: scatterplot shows positive linear relationship, residual plot shows random scatter, residuals show no skewness or outliers, data came from a random sample of 11 students, and 11 <= 10% of all Texas Algebra 1 students.
- All conditions were met, so the test can proceed.
`;

// Rubrics for each reflection question
window.RUBRICS_U9L4 = {
    reflect1: {
        questionText: 'Why is it important to choose the alternative hypothesis before looking at the data?',
        expectedElements: [
            { id: 'prevent-bias', description: 'States that choosing Ha after seeing data would bias the test or allow researchers to pick a convenient direction', required: true },
            { id: 'pre-registration', description: 'Explains that the research question should drive the hypothesis, not the observed pattern', required: true },
            { id: 'integrity', description: 'May mention that choosing after data collection undermines the integrity or validity of the significance test', required: false },
            { id: 'one-vs-two', description: 'May connect this to the choice between one-sided and two-sided alternatives', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that choosing Ha after seeing data introduces bias and that the research question, not the data, should determine the alternative.',
            P: 'Response mentions bias or the importance of pre-specifying but lacks a clear connection to how it affects the validity of the test.',
            I: 'Response does not address why the timing of the hypothesis choice matters or gives an incorrect explanation.'
        },
        commonMistakes: [
            'Saying it does not matter when you choose the alternative',
            'Confusing the null hypothesis with the alternative hypothesis',
            'Not explaining how post-hoc hypothesis selection introduces bias'
        ],
        contextFromVideo: 'Video 1 emphasizes that the choice of alternative is determined by the researchers when they pose their question and should be stated before they collect data.'
    },

    reflect2: {
        questionText: 'Why are there four separate conditions to check before running a t-test for slope? What could go wrong if one condition is violated?',
        expectedElements: [
            { id: 'list-conditions', description: 'Names or references the four conditions: linearity, constant spread, normality, and independence', required: true },
            { id: 'validity-reason', description: 'Explains that the conditions ensure the t-test produces valid and reliable results', required: true },
            { id: 'violation-consequence', description: 'Gives at least one example of what could go wrong if a condition is violated (e.g., curved relationship makes the linear model meaningless, non-constant spread distorts standard errors, non-normality affects the t-distribution, non-independence invalidates the sampling distribution)', required: true },
            { id: 'each-serves-purpose', description: 'May explain that each condition addresses a different aspect of the statistical model', required: false }
        ],
        scoringGuide: {
            E: 'Response references the four conditions, explains why they are needed for valid inference, and gives a specific consequence of violating at least one condition.',
            P: 'Response mentions the conditions or gives a consequence but does not fully connect both ideas.',
            I: 'Response does not meaningfully address the conditions or their purpose.'
        },
        commonMistakes: [
            'Listing the conditions without explaining why they matter',
            'Giving only a vague consequence like "the test would be wrong" without specifics',
            'Confusing the conditions for slope inference with conditions for a different test'
        ],
        contextFromVideo: 'Video 2 walks through all four conditions and checks each one using the Texas data with scatterplot, residual plot, dotplot, and study design information.'
    },

    exitTicket: {
        questionText: 'A marine biologist collects data from a random sample of 20 coral reefs and measures water temperature and coral growth rate. She wonders whether higher water temperatures are associated with slower coral growth. (a) State appropriate hypotheses and define beta in context. (b) Name the test procedure. (c) List the four conditions.',
        expectedElements: [
            { id: 'null-hypothesis', description: 'States H0: beta = 0', required: true },
            { id: 'alternative-hypothesis', description: 'States Ha: beta < 0 because higher temperature is expected to be associated with slower growth (negative relationship)', required: true },
            { id: 'define-beta', description: 'Defines beta as the slope of the population regression line for predicting coral growth rate from water temperature for all coral reefs', required: true },
            { id: 'test-name', description: 'Names the procedure as a t-test for slope', required: true },
            { id: 'condition-linear', description: 'Lists linearity: the true relationship between temperature and growth rate is linear', required: true },
            { id: 'condition-constant-sd', description: 'Lists constant standard deviation: the spread of growth rates does not vary with temperature', required: true },
            { id: 'condition-normality', description: 'Lists normality: for a particular temperature, growth rates are approximately normally distributed', required: true },
            { id: 'condition-independence', description: 'Lists independence: random sample and n <= 10% of all coral reefs', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly states both hypotheses with a one-sided alternative (beta < 0), defines beta in context, names the t-test for slope, and lists all four conditions.',
            P: 'Response gets most elements correct but misses one or two, such as using a two-sided alternative, omitting the beta definition, or listing only some conditions.',
            I: 'Response has major errors in the hypotheses, does not define the parameter, or misidentifies the test procedure.'
        },
        commonMistakes: [
            'Using Ha: beta > 0 instead of beta < 0 (the question says slower growth with higher temperature)',
            'Using Ha: beta != 0 when the question implies a directional claim',
            'Forgetting to define beta in the context of coral reefs',
            'Listing conditions for a different test such as a t-test for a mean',
            'Not mentioning the 10% condition for independence'
        ],
        contextFromVideo: 'Videos 1 and 2 together cover stating hypotheses, choosing a one-sided or two-sided alternative, naming the t-test for slope, and checking all four conditions.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU9L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U9L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about setting up a test for the slope of a regression model (Topic 9.4).

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Required Elements (must be present for full credit)
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
window.getRubricU9L4 = function(questionId) {
    return window.RUBRICS_U9L4[questionId] || null;
};
