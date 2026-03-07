/**
 * AI Grading Prompts for Unit 6 Lesson 9: Justifying a Claim Based on a Confidence Interval for a Difference of Population Proportions
 * Topic 6.9: Justifying a Claim Based on a Confidence Interval for a Difference of Population Proportions
 *
 * Learning Objectives:
 *   UNC-4.M - Interpret a confidence interval for a difference of proportions
 *   UNC-4.N - Justify a claim based on a confidence interval for a difference of proportions
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L9 = `
VIDEO 1 - Interpreting a Confidence Interval and Justifying a Claim (~7 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - Students should interpret a confidence interval for a difference in population proportions using the template: "We are C% confident that the interval from ___ to ___ captures the value to be estimated"
  - The interpretation should name the direction of the difference and the population context
  - A confidence interval can be used to justify a claim by checking whether all interval values are consistent with the claim
  - If 0 is in the interval, then 0 is a plausible value for the difference and there is not convincing evidence of a difference
  - If all values in the interval are on one side of 0 and support the claim, then there is convincing evidence for the claim
- TREE EXAMPLE:
  - Random samples from two large forests: 36 of 240 high-elevation trees died, 25 of 200 low-elevation trees died
  - The 90% confidence interval for high minus low is (-0.029, 0.079)
  - Interpretation: We are 90% confident that this interval captures the difference high minus low in the proportions of all trees in these forests that died from the disease
  - Because 0 is in the interval, 0 is a plausible value for the true difference
  - Therefore there is not convincing evidence that the disease is more lethal at one elevation
- DOG EXAMPLE:
  - Dogs were randomly assigned to new or old tick repellent
  - The 95% confidence interval for new minus old is (-0.2907, -0.0343)
  - Interpretation: We are 95% confident that this interval captures the difference new minus old in the true proportions of similar dogs that would get ticks
  - Because all values are negative, the first proportion (new) is less than the second (old)
  - Therefore there is convincing evidence that the new formula is better at preventing ticks
- CLAIM RULE:
  - If all values in the interval are consistent with the claim, then there is convincing evidence for the claim
  - If one or more values in the interval are inconsistent with the claim, then there is not convincing evidence

VIDEO 2 - Using an Interval to Decide Whether a Difference Is Significant (~9 min):
- Same presenter
- AP EXAM EXAMPLE:
  - Random samples of 200 parts from a day shift and 200 parts from a night shift were selected
  - Day shift: 188 of 200 met specifications
  - Night shift: 180 of 200 met specifications
  - The parameter is the difference day minus night in the proportions of all parts produced within specifications
  - The procedure is a two-sample z-interval for a difference in proportions
  - For 96% confidence, z* = 2.054
  - Point estimate = 0.04
  - Margin of error = 0.056
  - 96% confidence interval = (-0.016, 0.096)
  - Interpretation: We are 96% confident that the interval from -0.016 to 0.096 captures the difference day minus night in the proportions of all parts produced within specifications by the two shifts
  - Because 0 is in the interval, 0 is a plausible value for the difference
  - Therefore there is not convincing evidence that the difference is significantly different from 0
- CONFIDENCE LEVEL:
  - Interpreting a confidence level is different from interpreting a confidence interval
  - In repeated random sampling with the same sample sizes, about C% of the intervals produced by the method would capture the true difference in population proportions
  - For this example, if many pairs of random samples of 200 parts from each shift were selected and a 96% confidence interval was built from each pair, about 96% of those intervals would capture the true difference day minus night
- TAKEAWAYS:
  - Define the difference and direction being estimated
  - Identify the interval procedure
  - Calculate or use the interval
  - Interpret the interval in context
  - Use the interval to decide whether a claim is supported
`;

// Rubrics for each reflection question
window.RUBRICS_U6L9 = {
    reflect1: {
        questionText: "For the tree-disease example, a 90% confidence interval for p_high - p_low is (-0.029, 0.079). Interpret this interval in context, and explain whether it gives convincing evidence that the disease is more lethal at one elevation.",
        expectedElements: [
            { id: "interval-interpretation", description: "Interprets the interval in context: we are 90% confident that the true difference high minus low in the proportions of trees that died from the disease is between -0.029 and 0.079", required: true },
            { id: "parameter-context", description: "Refers to the true population proportions of trees in the two forests or elevations, not just the sample proportions", required: true },
            { id: "zero-plausible", description: "Explains that 0 is in the interval, so 0 is a plausible value for the true difference", required: true },
            { id: "claim-conclusion", description: "Concludes that there is not convincing evidence that the disease is more lethal at one elevation", required: true },
            { id: "direction-language", description: "Uses the stated direction high minus low correctly", required: true },
            { id: "positive-negative-mention", description: "May note that the interval includes both negative and positive values", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the interval in context and clearly explains that because 0 is in the interval there is not convincing evidence that the disease is more lethal at one elevation",
            P: "Response captures part of the interpretation or conclusion but is vague about the parameter, the context, or why the claim is not supported",
            I: "Response misinterprets the interval, treats the interval as a probability statement about this one parameter, or gives the wrong conclusion about the claim"
        },
        commonMistakes: [
            "Talking only about the sample proportions instead of the population proportions",
            "Saying there is a 90% probability that the true difference is in this particular interval",
            "Ignoring the fact that 0 is inside the interval",
            "Claiming the interval proves one elevation is more lethal",
            "Reversing the direction of high minus low"
        ],
        contextFromVideo: "Doug Tyson explains that because 0 is in the tree interval (-0.029, 0.079), 0 is a plausible value for high minus low, so there is not convincing evidence that the disease is more lethal at one elevation."
    },

    reflect2: {
        questionText: "For the dog tick-repellent experiment, a 95% confidence interval for p_new - p_old is (-0.2907, -0.0343). Interpret this interval in context, and explain why it supports the claim that the new formula is better.",
        expectedElements: [
            { id: "interval-interpretation", description: "Interprets the interval in context: we are 95% confident that the true proportion of similar dogs that would get ticks with the new formula is between 0.0343 and 0.2907 lower than with the old formula", required: true },
            { id: "parameter-context", description: "Refers to the true proportions of similar dogs that would get ticks with the two formulas", required: true },
            { id: "all-negative", description: "Explains that all values in the interval are negative, so p_new - p_old is less than 0", required: true },
            { id: "claim-supported", description: "Concludes that there is convincing evidence that the new formula is better at preventing ticks than the old formula", required: true },
            { id: "direction-language", description: "States the direction correctly by describing the new formula as lower or better, not higher", required: true },
            { id: "percentage-points", description: "May describe the interval as a range of percentage points lower", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the interval in context and explains that the entirely negative interval provides convincing evidence that the new formula produces a lower true tick rate than the old formula",
            P: "Response gets the main idea but is incomplete about the parameter, the interpretation, or why negative values support the claim",
            I: "Response reverses the direction, misinterprets the interval, or does not connect the interval to the claim about the new formula being better"
        },
        commonMistakes: [
            "Reversing new minus old and saying the old formula is better",
            "Describing only the sample results instead of the population parameter",
            "Ignoring that every value in the interval is negative",
            "Saying negative values are impossible rather than meaningful for a difference",
            "Treating the confidence interval as a probability statement about this one interval"
        ],
        contextFromVideo: "In the dog example, the interval for new minus old is entirely negative, so every plausible value suggests the new formula has a lower true tick proportion than the old formula, which supports the claim that the new formula is better."
    },

    exitTicket: {
        questionText: "A large company compares the proportion of parts produced within specifications on its day shift and night shift. Random samples of 200 parts from each shift gave a 96% confidence interval of (-0.016, 0.096) for p_day - p_night. (a) Interpret the confidence interval in context. (b) Based only on the interval, do you think the true difference is significantly different from 0? Justify your answer. (c) Interpret the 96% confidence level.",
        expectedElements: [
            { id: "interval-interpretation", description: "Interprets the confidence interval in context: we are 96% confident that the true difference day minus night in the proportions of all parts produced within specifications is between -0.016 and 0.096", required: true },
            { id: "parameter-context", description: "Refers to the population proportions for all parts from the day and night shifts, not just the sampled parts", required: true },
            { id: "zero-plausible", description: "Explains that 0 is in the interval, so 0 is a plausible value for the true difference", required: true },
            { id: "not-significant", description: "Concludes that there is not convincing evidence that the true difference is significantly different from 0", required: true },
            { id: "confidence-level", description: "Correctly interprets the 96% confidence level using repeated random sampling and many intervals", required: true },
            { id: "repeated-samples-details", description: "Specifies that many pairs of random samples of 200 parts from each shift would be taken and about 96% of the resulting intervals would capture the true difference", required: true },
            { id: "not-probability", description: "Does not say there is a 96% probability that the true difference is in this one interval", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the interval, explains that 0 is plausible so the difference is not significantly different from 0, and correctly interprets the 96% confidence level with repeated random sampling",
            P: "Response has most of the ideas but is incomplete or vague about the interval interpretation, the conclusion about 0, or the meaning of the confidence level",
            I: "Response misinterprets the interval or confidence level, gives the wrong conclusion about significance, or omits major required components"
        },
        commonMistakes: [
            "Saying there is a 96% probability that the true difference is in this interval",
            "Ignoring that 0 is included in the interval",
            "Claiming the shifts are significantly different because the endpoints are not equal",
            "Describing only the sample proportions instead of the population proportions",
            "Leaving out the repeated-sampling language when interpreting the confidence level"
        ],
        contextFromVideo: "In the day-versus-night shift example, the interval (-0.016, 0.096) includes 0, so the lesson concludes there is not convincing evidence that the shift proportions differ. The video also states that the 96% confidence level means about 96% of such intervals from repeated random sampling would capture the true difference."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L9 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L9[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Justifying a Claim Based on a Confidence Interval for a Difference of Population Proportions.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L9}

REQUIRED ELEMENTS (must address for E score):
${requiredElements.map(e => `- ${e.description}`).join('\n')}

OPTIONAL ELEMENTS (strengthen response):
${optionalElements.map(e => `- ${e.description}`).join('\n')}

SCORING GUIDE:
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

COMMON MISTAKES TO WATCH FOR:
${rubric.commonMistakes.map(m => `- ${m}`).join('\n')}

CONTEXT FROM VIDEO:
${rubric.contextFromVideo}

Grade this response and provide:
1. A score (E, P, or I)
2. Brief feedback explaining the score
3. List of elements the student addressed correctly (matched)
4. List of elements that are missing or incorrect (missing)
5. A helpful suggestion for improvement (if not E)

Respond in JSON format:
{
    "score": "E|P|I",
    "feedback": "Brief explanation of score",
    "matched": ["element1", "element2"],
    "missing": ["element3"],
    "suggestion": "Helpful tip for improvement or null if E"
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU6L9 = function(questionId) {
    return window.RUBRICS_U6L9[questionId];
};
