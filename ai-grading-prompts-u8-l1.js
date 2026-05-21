/**
 * AI Grading Prompts for Unit 8 Lesson 1: Introducing Statistics: Are My Results Unexpected?
 * Topic 8.1: Introducing Statistics: Are My Results Unexpected?
 *
 * Learning Objectives:
 *   Determine whether observed counts in categorical data are consistent with expected counts due to random variation
 *   Compute expected counts from a null model for a one-way table
 *   Explain why the chi-square statistic uses squared differences divided by expected counts
 *   Use simulation to judge whether an observed chi-square value is surprising
 *   Interpret a large P-value in context for a goodness-of-fit situation
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L1 = `
VIDEO 1 - Introducing Statistics: Are My Results Unexpected? (~7 min):
- Presenter introduces the logic of significance testing for the distribution of one categorical variable with more than two categories
- MAIN IDEAS:
  - The central question is whether observed counts are consistent with expected counts due to random variation
  - Unit 8 extends inference beyond success-failure data to variables with more than two categories
  - The example uses a 10-sided die rolled 100 times to test whether the die seems fair or weighted
  - If the die is fair, each of the 10 outcomes should occur about 10 times because 1/10 of 100 is 10
  - Observed minus expected differences sum to 0, so simple addition does not measure overall discrepancy well
  - Absolute values avoid cancellation but still grow with sample size
  - Squaring the differences keeps contributions positive and gives more weight to large discrepancies
  - Dividing each squared difference by the expected count makes the contribution relative to what was expected
  - The chi-square statistic is the sum of (Obs - Exp)^2 / Exp across all categories
  - Larger chi-square values represent bigger mismatches between observed and expected counts
  - Simulation can be used to judge whether the observed chi-square value is surprising under the fair-die model
  - The sampling distribution in the applet is built from many simulated samples of 100 rolls from a fair die
  - The P-value is estimated as the proportion of simulated chi-square values at least as large as the observed value
- DIE EXAMPLE DETAILS:
  - Observed frequencies for results 1 through 10 were 7, 11, 7, 11, 9, 8, 12, 10, 13, and 12
  - Expected count for each category under a fair die is 10
  - Obs - Exp differences are -3, 1, -3, 1, -1, -2, 2, 0, 3, 2 and sum to 0
  - Sum of absolute differences is 18
  - Sum of squared differences is 42
  - Contributions (Obs - Exp)^2 / Exp sum to 4.2
  - The observed chi-square statistic is 4.2
  - In the simulation applet, 932 out of 1023 simulated samples had chi-square values at least 4.2
  - The estimated P-value is about 0.9110
  - Because a result this extreme happens over 90% of the time under a fair die, the data are not surprising
  - Conclusion: the die results are consistent with random variation and there is not convincing evidence that the die is weighted
- TAKEAWAYS:
  - Expected counts provide the baseline for comparison
  - Chi-square measures total relative discrepancy, not simple signed difference
  - A large P-value means the observed counts are a good fit to the expected model
  - The simulation shows that 4.2 is a very typical chi-square value for 100 fair-die rolls
`;

// Rubrics for each reflection question
window.RUBRICS_U8L1 = {
    reflect1: {
        questionText: "Explain how the chi-square statistic is built for the 10-sided die example. Include the expected counts for a fair die, why adding Obs - Exp is not enough, why the differences are squared and divided by expected count, the value chi-square = 4.2, and what a larger chi-square value would mean.",
        expectedElements: [
            { id: "expected-counts", description: "States that a fair 10-sided die gives expected counts of 10 in each category", required: true },
            { id: "cancellation-problem", description: "Explains that Obs - Exp values sum to 0 or cancel, so adding them is not a useful overall measure", required: true },
            { id: "squaring-reason", description: "Explains that the differences are squared so the contributions are positive and larger discrepancies get more weight", required: true },
            { id: "divide-by-expected", description: "Explains that dividing by expected count makes the discrepancy relative to what was expected", required: true },
            { id: "chi-square-formula", description: "Describes chi-square as the sum of (Obs - Exp)^2 / Exp across categories", required: true },
            { id: "chi-square-value", description: "Identifies the observed chi-square statistic as 4.2", required: true },
            { id: "larger-chi-square", description: "Explains that a larger chi-square value means a bigger mismatch or poorer fit between observed and expected counts", required: true },
            { id: "absolute-values-issue", description: "May mention that absolute values still depend heavily on sample size", required: false },
            { id: "squared-sum", description: "May mention that the sum of squared differences was 42 before dividing by expected counts", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains the expected counts, the cancellation problem, the chi-square construction, the observed value 4.2, and what larger chi-square values mean",
            P: "Response shows the main idea of building chi-square but misses one major reason, one structural step, or the interpretation of the statistic",
            I: "Response confuses expected and observed counts, skips the core chi-square construction, or does not explain what the statistic means in this example"
        },
        commonMistakes: [
            "Saying the observed minus expected differences can just be added directly",
            "Leaving out why the differences are squared",
            "Leaving out why each squared difference is divided by the expected count",
            "Reporting the wrong chi-square value instead of 4.2",
            "Treating a larger chi-square value as a better fit rather than a worse fit"
        ],
        contextFromVideo: "The lesson builds chi-square from the fair-die example, moving from Obs - Exp to squared differences to (Obs - Exp)^2 / Exp and ending with chi-square = 4.2."
    },

    reflect2: {
        questionText: "Explain how the simulation is used to decide whether the die results are surprising. Describe the fair-die model, what the sampling distribution represents, how the P-value is estimated, the approximate P-value, and the conclusion about whether the die seems weighted.",
        expectedElements: [
            { id: "fair-die-model", description: "States that the simulation assumes the die is fair and rolls 100 outcomes under that model", required: true },
            { id: "sampling-distribution", description: "Explains that the dotplot shows the sampling distribution of chi-square values from many simulated samples", required: true },
            { id: "p-value-estimate", description: "Explains that the P-value is found from the proportion of simulated chi-square values at least as large as 4.2", required: true },
            { id: "approximate-p-value", description: "Gives the approximate P-value as about 0.9110 or 932/1023", required: true },
            { id: "not-surprising", description: "Explains that such a result is not surprising under the fair-die model because it happens over 90% of the time", required: true },
            { id: "contextual-conclusion", description: "Concludes that the results are consistent with random variation and there is not convincing evidence that the die is weighted", required: true },
            { id: "good-fit-language", description: "May describe the observed counts as a good fit to the expected counts", required: false },
            { id: "large-p-value-meaning", description: "May explicitly say that a large P-value means the observed statistic is typical rather than unusual under the model", required: false }
        ],
        scoringGuide: {
            E: "Response clearly explains the fair-die simulation, the sampling distribution, the P-value estimate near 0.911, and the correct conclusion that the die does not appear weighted",
            P: "Response understands the basic simulation idea and conclusion but leaves one major part incomplete, such as how the P-value is computed or what the sampling distribution represents",
            I: "Response misinterprets the simulation, gives the wrong P-value or conclusion, or treats the result as strong evidence that the die is weighted"
        },
        commonMistakes: [
            "Describing the P-value as the probability that the die is fair",
            "Forgetting that the simulation assumes the fair-die model is true",
            "Leaving out that the P-value counts chi-square values at least as large as 4.2",
            "Calling 0.911 a small P-value or saying the result is statistically significant",
            "Concluding that the die is weighted even though the simulated result is very common"
        ],
        contextFromVideo: "The applet simulation produces many chi-square values for fair-die samples, and 932 out of 1023 are at least 4.2, giving a P-value near 0.911 and a not-weighted conclusion."
    },

    exitTicket: {
        questionText: "A gamer rolls a 10-sided die 100 times and gets frequencies 7, 11, 7, 11, 9, 8, 12, 10, 13, and 12 for results 1 through 10. Assume a fair die has probability 1/10 for each result, and a simulation shows that chi-square values of 4.2 or greater occurred in 932 out of 1023 simulated samples. (a) State the expected count for each outcome and explain why adding Obs - Exp is not a good overall measure of discrepancy. (b) Describe how to compute the chi-square statistic and identify the observed value. (c) Explain what the simulation distribution represents and estimate the P-value. (d) Decide whether the results are surprising if the die is fair and state a conclusion about whether the die seems weighted. (e) Explain what the large P-value says about random variation in this setting.",
        expectedElements: [
            { id: "expected-count", description: "States that the expected count is 10 for each of the 10 outcomes under a fair die", required: true },
            { id: "obs-exp-problem", description: "Explains that adding Obs - Exp is not useful because the positive and negative differences cancel", required: true },
            { id: "chi-square-computation", description: "Describes chi-square as adding (Obs - Exp)^2 / Exp across categories", required: true },
            { id: "observed-statistic", description: "Identifies the observed chi-square statistic as 4.2", required: true },
            { id: "simulation-distribution", description: "Explains that the simulation distribution is made from many chi-square values from fair-die samples of 100 rolls", required: true },
            { id: "p-value", description: "Estimates the P-value as about 0.9110 or 932/1023 by counting simulated values at least as large as 4.2", required: true },
            { id: "conclusion", description: "Concludes that the result is not surprising and there is not convincing evidence that the die is weighted", required: true },
            { id: "random-variation", description: "Explains that the large P-value means random variation is a very reasonable explanation for the observed counts", required: true },
            { id: "good-fit", description: "May describe the observed counts as a good fit to the fair-die model", required: false },
            { id: "extreme-weighting", description: "May note that larger chi-square values would indicate more evidence against the fair-die model", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains the expected counts, chi-square setup, simulation-based P-value near 0.911, and the conclusion that the die results are consistent with random variation",
            P: "Response gets most of the process right but misses one major explanation, one numerical summary, or the meaning of the large P-value",
            I: "Response gives the wrong expected counts, misstates chi-square or the P-value, or draws the wrong conclusion about whether the die is weighted"
        },
        commonMistakes: [
            "Using the observed counts as the expected counts",
            "Forgetting that Obs - Exp sums to 0 because of cancellation",
            "Leaving out the division by expected count in the chi-square statistic",
            "Interpreting 0.911 as evidence against the fair die",
            "Claiming the die is weighted even though the result is very common under the fair-die model"
        ],
        contextFromVideo: "The exit ticket mirrors the lesson's fair-die example, including expected counts of 10, chi-square = 4.2, and a simulation-based P-value around 0.911."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L1[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Introducing Statistics: Are My Results Unexpected?.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L1}

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
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
window.getRubricU8L1 = function(questionId) {
    return window.RUBRICS_U8L1[questionId];
};
