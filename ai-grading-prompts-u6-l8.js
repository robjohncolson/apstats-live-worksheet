/**
 * AI Grading Prompts for Unit 6 Lesson 8: Confidence Intervals for the Difference of Two Proportions
 * Topic 6.8: Confidence Intervals for the Difference of Two Proportions
 *
 * Learning Objectives:
 *   UNC-4.I - Identify an appropriate confidence interval procedure for a comparison of population proportions
 *   UNC-4.J - Verify the conditions for calculating confidence intervals for a difference between population proportions
 *   UNC-4.K / UNC-4.L - Calculate and interpret a confidence interval for a difference between population proportions
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L8 = `
VIDEO 1 - Choosing the Procedure and Checking Conditions (~8 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - The correct procedure for comparing two population proportions is a two-sample z-interval for a difference in proportions
  - This interval is appropriate when you have two independent random samples from two populations or subjects randomly assigned to two treatment groups in a randomized experiment
  - In general, check independence and that the sampling distribution has the correct shape
  - If sampling without replacement, check that n1 <= 10%N1 and n2 <= 10%N2
  - Check that the observed counts of successes and failures in both groups are all at least 10
- TREE EXAMPLE:
  - High elevation sample: 36 of 240 trees died
  - Low elevation sample: 25 of 200 trees died
  - Random samples were given
  - 240 and 200 are reasonable as less than or equal to 10% of the numbers of trees in large forests
  - Counts are 36, 204, 25, and 175, so all large-count conditions are met
- SWIMMER EXAMPLE:
  - Randomized experiment with drag suits versus regular suits
  - Drag-suit group: 13 successes and 10 failures
  - Regular-suit group: 8 successes and 16 failures
  - Because 8 is less than 10, the large counts condition is not met
  - The 10% condition does not apply to experiments because there is no sampling

VIDEO 2 - Margin of Error and Calculating the Interval (~9 min):
- Same presenter
- MARGIN OF ERROR:
  - Confidence intervals have the form point estimate +/- margin of error
  - Margin of error = critical value * standard error
  - Margin of error depends on how much the statistic varies from the parameter and how confident we want to be
- STANDARD ERROR:
  - Standard error estimates the standard deviation of the sampling distribution of phat1 - phat2
  - Because p1 and p2 are unknown, replace them with phat1 and phat2
  - SE = sqrt[(phat1(1-phat1))/n1 + (phat2(1-phat2))/n2]
- CRITICAL VALUE:
  - z* captures the middle C% of the standard normal distribution
  - For 90% confidence, z* = 1.645
  - For 95% confidence, z* = 1.96
- TREE INTERVAL EXAMPLE:
  - phat1 = 36/240 = 0.15
  - phat2 = 25/200 = 0.125
  - Point estimate = 0.025
  - Margin of error = 0.054
  - 90% confidence interval = (-0.029, 0.079)
- FORMULA SHEET NOTE:
  - Students do not need to memorize the full formula; they can combine the generic confidence interval template with the standard error formula from the AP formula sheet
- DOG EXAMPLE:
  - New formula: 12/80 = 0.15 got ticks
  - Old formula: 25/80 = 0.3125 got ticks
  - Point estimate new - old = -0.1625
  - 95% confidence interval = (-0.2907, -0.0343)
- INTERPRETATION:
  - A confidence interval gives plausible values for the true difference p1 - p2 in context
  - Interpret the interval using the parameter, the groups, and the direction of the difference
`;

// Rubrics for each reflection question
window.RUBRICS_U6L8 = {
    reflect1: {
        questionText: "A botanist takes two independent random samples from two large parks to compare the proportion of trees with leaf damage. In Park A, 42 of 210 sampled trees had leaf damage. In Park B, 30 of 190 sampled trees had leaf damage. Identify the appropriate confidence interval procedure and verify whether the conditions are met. Justify each condition in context.",
        expectedElements: [
            { id: "procedure-name", description: "Identifies the correct procedure as a two-sample z-interval for a difference in proportions", required: true },
            { id: "independence", description: "Explains that the data come from two independent random samples, one from each park", required: true },
            { id: "ten-percent", description: "States that the 10% condition is reasonable because the parks are large so 210 and 190 are no more than 10% of the tree populations", required: true },
            { id: "large-counts", description: "Checks the large counts condition using 42, 168, 30, and 160, and notes that all are at least 10", required: true },
            { id: "conclusion", description: "Concludes that the conditions are met and the interval procedure is appropriate", required: true },
            { id: "context-language", description: "Uses the park and leaf-damage context rather than only giving abstract definitions", required: false }
        ],
        scoringGuide: {
            E: "Response identifies the correct two-sample z-interval procedure and correctly verifies the random-sample, 10%, and large-counts conditions in context",
            P: "Response gets the main idea but misses one condition, gives an incomplete justification, or names the procedure correctly without fully checking the conditions",
            I: "Response identifies the wrong procedure, omits multiple conditions, or gives only vague statements without checking the conditions in context"
        },
        commonMistakes: [
            "Naming a one-sample interval instead of a two-sample z-interval for a difference in proportions",
            "Forgetting to check the 10% condition when the setting uses random samples",
            "Checking only the successes and not the failures",
            "Saying the conditions are met without supporting the claim with the actual counts",
            "Giving only generic definitions and not referring to the two parks"
        ],
        contextFromVideo: "Doug Tyson emphasizes that a two-sample z-interval for a difference in proportions is appropriate when data come from two independent random samples or a randomized experiment, and that the conditions include independence, the 10% condition for sampling, and observed counts of successes and failures all at least 10."
    },

    reflect2: {
        questionText: "In the dog tick experiment, a 95% confidence interval for p_new - p_old is (-0.2907, -0.0343), where the parameters are the true proportions of similar dogs that would get ticks with each formula. Interpret this interval in context, and explain what the negative values suggest about the new formula.",
        expectedElements: [
            { id: "interval-interpretation", description: "Interprets the interval in context: we are 95% confident that the true proportion of similar dogs that would get ticks with the new formula is between 0.0343 and 0.2907 lower than with the old formula", required: true },
            { id: "parameter-context", description: "Refers to the true proportions of similar dogs that would get ticks with the two formulas, not just the sample results", required: true },
            { id: "negative-values-meaning", description: "Explains that the negative values mean p_new - p_old is likely less than 0, so the new formula likely leads to a lower tick rate than the old formula", required: true },
            { id: "direction-language", description: "States the direction correctly by describing the new formula as lower or better at preventing ticks", required: true },
            { id: "not-probability", description: "Does not say there is a 95% probability that the parameter is in the interval", required: false },
            { id: "percentage-points", description: "May express the interpretation in percentage points lower", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the confidence interval in context and explains that the negative values suggest the new formula has a lower true tick proportion than the old formula",
            P: "Response captures part of the interpretation but is vague about the parameter, the context, or what the negative values mean",
            I: "Response misinterprets the interval, reverses the direction of the difference, or does not explain the meaning of the negative values"
        },
        commonMistakes: [
            "Saying the interval is about sample proportions instead of population proportions",
            "Reversing the subtraction and claiming the old formula is lower",
            "Saying the interval means there is a 95% chance the parameter is in this one computed interval",
            "Ignoring the context of dogs getting ticks",
            "Treating the negative values as if they are impossible instead of meaningful for a difference"
        ],
        contextFromVideo: "In the dog example, the lesson forms a 95% confidence interval for new minus old and gets an entirely negative interval. The lesson emphasizes that a confidence interval gives plausible values for the true difference in proportions and should be interpreted in context."
    },

    exitTicket: {
        questionText: "A school district wants to compare the proportion of students who buy lunch at two high schools. Random samples of 150 students from High School A and 150 students from High School B found that 60 students from A and 39 students from B bought lunch that day. Assume each school has far more than 1,500 students. Use p_A - p_B as the parameter and use z* = 1.96 for a 95% confidence interval. (a) Identify the appropriate confidence interval procedure and verify that the conditions are met. (b) Calculate a 95% confidence interval for p_A - p_B. (c) Interpret the interval in context, including what it suggests about a possible difference between the schools.",
        expectedElements: [
            { id: "procedure-name", description: "Identifies the correct procedure as a two-sample z-interval for a difference in proportions", required: true },
            { id: "independence", description: "Explains that the data come from two independent random samples, one from each high school", required: true },
            { id: "ten-percent", description: "Checks the 10% condition by noting that each sample of 150 is no more than 10% of each school's population because each school has far more than 1,500 students", required: true },
            { id: "large-counts", description: "Checks the large counts condition using 60, 90, 39, and 111, and notes that all are at least 10", required: true },
            { id: "point-estimate", description: "Finds the point estimate p-hat_A - p-hat_B = 0.40 - 0.26 = 0.14", required: true },
            { id: "confidence-interval", description: "Calculates a 95% confidence interval approximately equal to (0.035, 0.245), allowing for reasonable rounding", required: true },
            { id: "interpretation", description: "Interprets the interval in context: we are 95% confident that the proportion who buy lunch at High School A is about 3.5 to 24.5 percentage points higher than at High School B", required: true },
            { id: "difference-meaning", description: "Notes that the interval is entirely positive, suggesting High School A likely has the higher true lunch-buying proportion", required: true },
            { id: "calculation-details", description: "May show intermediate work such as the standard error or margin of error", required: false }
        ],
        scoringGuide: {
            E: "Response correctly names the procedure, verifies all conditions, computes an appropriate interval, and interprets the interval in context with the correct direction",
            P: "Response has most of the structure correct but misses one meaningful component, such as one condition, the interval arithmetic, or part of the interpretation",
            I: "Response uses the wrong procedure, fails to check the conditions, gives an incorrect interval, or misinterprets the meaning or direction of the difference"
        },
        commonMistakes: [
            "Using a one-sample procedure instead of a two-sample z-interval for a difference in proportions",
            "Forgetting the 10% condition even though the data come from random samples",
            "Checking only the numbers who bought lunch and not the numbers who did not",
            "Computing the point estimate incorrectly or reversing A - B",
            "Giving an interval but not interpreting it in context",
            "Ignoring that the interval is entirely positive when describing the conclusion"
        ],
        contextFromVideo: "The lesson shows that the interval for a difference in proportions uses the point estimate plus or minus a margin of error, with z* times the standard error. It also stresses that students should verify the random-sample or random-assignment condition, the 10% condition when sampling, and that all success and failure counts are at least 10."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L8 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L8[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Confidence Intervals for the Difference of Two Proportions.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L8}

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
window.getRubricU6L8 = function(questionId) {
    return window.RUBRICS_U6L8[questionId];
};
