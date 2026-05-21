/**
 * AI Grading Prompts for Unit 8 Lesson 3: Carrying Out a Chi-Square Test for Goodness of Fit
 * Topic 8.3: Carrying Out a Chi-Square Test for Goodness of Fit
 *
 * Learning Objectives:
 *   Calculate the chi-square test statistic from observed and expected counts for a goodness-of-fit test
 *   Use technology or Table C to find or estimate a p-value from a chi-square distribution
 *   Interpret the p-value for a chi-square goodness-of-fit test in context
 *   State a statistical decision and conclusion in context by comparing the p-value to alpha
 *   Use contributions to identify which categories produce the largest discrepancy
 *   Perform a complete significance test for one categorical variable with multiple categories
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L3 = `
VIDEO 1 - Carrying Out the Mechanics of a Chi-Square Goodness-of-Fit Test (~9 min):
- Presenter explains how to calculate the chi-square test statistic and the p-value for a chi-square goodness-of-fit test
- MAIN IDEAS:
  - After hypotheses and conditions are established, the next step is the mechanics of the test
  - Expected counts come from multiplying the null-hypothesis proportions by the sample size
  - Differences are calculated as observed minus expected counts
  - The differences are squared to keep them positive and give more weight to larger deviations
  - Each squared difference is divided by the expected count to produce a category contribution
  - The chi-square test statistic is the sum of all contributions, written as sum of (Obs - Exp)^2 / Exp
  - Degrees of freedom depend on the number of categories minus one, not the sample size
  - Chi-square goodness-of-fit tests use the upper tail of the chi-square distribution for the p-value
  - Technology such as the TI-84 GOF-Test or chi-square cdf can produce the p-value directly
  - Table C only gives a range estimate for the p-value by locating where the test statistic falls among critical values
  - A chi-square statistic of 0 means a perfect fit between observed and expected counts
  - Larger chi-square statistics mean larger discrepancies and a worse fit to the null model
- PREDATORY LENDING EXAMPLE DETAILS:
  - Random sample of 40 predatory lending businesses in Dallas, Texas
  - Null proportions: p1 = 0.452, p2 = 0.292, p3 = 0.256
  - Observed counts: 20, 17, 3
  - Expected counts: 18.08, 11.68, 10.24
  - Obs - Exp differences: 1.92, 5.32, -7.24
  - Squared differences: 3.6864, 28.3024, 52.4176
  - Contributions: 0.20389, 2.42315, 5.11891
  - Observed chi-square statistic: 7.746
  - Degrees of freedom: 2 because there are 3 categories
  - TI-84 GOF-Test output gives p = 0.0207964003
  - Chi-square cdf with lower bound 7.746, upper bound 1000, and df = 2 gives the same p-value
  - Table C for df = 2 shows 7.746 lies between 7.38 and 7.82, so the p-value is between 0.025 and 0.02
- BATTLESHIP PRACTICE DETAILS:
  - Observed counts for quadrants 1 to 4 are 16, 22, 33, and 29
  - If no quadrant is preferred, expected counts are 25 in each category
  - Correct chi-square statistic is 6.8 with df = 3 and p = 0.07855316, which rounds to 0.079
  - A common mistake is using df = 4 instead of 3, which gives an incorrect p-value around 0.147

VIDEO 2 - Interpreting the P-Value and Stating a Conclusion (~9 min):
- Presenter explains how to interpret a chi-square goodness-of-fit p-value and how to write the conclusion of the test
- MAIN IDEAS:
  - The p-value is the probability of obtaining a result as extreme as the one in the study, or more extreme, by chance alone, assuming the null hypothesis is true
  - In a chi-square test, that means the probability of getting the observed chi-square statistic or greater from the upper tail
  - A conclusion has two parts: compare the p-value to alpha and make a decision about H0, then interpret what that says about Ha in context
  - If p-value <= alpha, reject H0 and say there is convincing statistical evidence for Ha in context
  - If p-value > alpha, fail to reject H0 and say there is not convincing statistical evidence for Ha in context
  - Context matters; the conclusion should be written about the actual categorical variable, not just symbols
  - Looking at category contributions helps identify where the largest discrepancy from the null model occurred
- PREDATORY LENDING INTERPRETATION DETAILS:
  - Test statistic from the previous video is chi-square = 7.746 and p-value = 0.0208
  - Using alpha = 0.05, the p-value is less than alpha, so H0 is rejected
  - Conclusion: there is convincing statistical evidence that the distribution of predatory lending businesses across Dallas income brackets is not the same as the household proportions in the specified brackets
  - The highest income bracket, $100,000 and above, has the largest contribution to the chi-square statistic
  - Because predatory lending businesses were represented much less than expected in the highest income bracket, the data suggest they tend to be located in lower income regions
- BATTLESHIP INTERPRETATION DETAILS:
  - A p-value of 0.079 means there is a 0.079 probability of getting results this extreme or more extreme by chance alone if the quadrant proportions are all the same
  - The correct interpretation uses the null hypothesis as the assumption, not the alternative
  - Incorrect interpretations include treating the p-value as a category proportion or as the probability that the null is true

VIDEO 3 - Performing a Complete Significance Test for One Categorical Variable (~9 min):
- Presenter works a full AP exam style free-response question about household participation across six city districts
- MAIN IDEAS:
  - For one sample and one categorical variable with multiple categories, the correct procedure is a chi-square goodness-of-fit test
  - A full significance test includes hypotheses and parameters, procedure and conditions, mechanics, and conclusion
  - Null hypotheses should give the actual category proportions and define what the parameters represent
  - Conditions are a random sample or randomized experiment, the 10% condition when sampling without replacement, and all expected counts greater than 5
  - Mechanics should include the test statistic, the degrees of freedom, and the p-value
  - Contributions can be used afterward to identify which category changed the most
- CITY DISTRICT EXAMPLE DETAILS:
  - Null proportions for districts A through F are 0.32, 0.12, 0.10, 0.27, 0.05, and 0.14
  - Observed counts are 100, 35, 40, 22, 12, and 31
  - Total sample size is 240 households
  - Expected counts are 76.8, 28.8, 24, 64.8, 12, and 33.6
  - All expected counts are greater than 5
  - Degrees of freedom are 5 because there are 6 categories
  - Calculator output gives chi-square = 47.48 and p-value = 4.53 x 10^-9, approximately 0
  - Since the p-value is far below alpha = 0.05, the null hypothesis is rejected
  - Conclusion: there is convincing statistical evidence that the district participation proportions are not the same as those used by the city
  - District D has the largest contribution, 28.27, so it had the greatest change in participation
`;

// Rubrics for each reflection question
window.RUBRICS_U8L3 = {
    reflect1: {
        questionText: 'Explain how to calculate the chi-square test statistic and p-value for the predatory lending example. Include the expected counts, how the contributions are computed, chi-square = 7.746, why df = 2, why the p-value comes from the upper tail, and the approximate p-value 0.0208.',
        expectedElements: [
            { id: 'expected-counts', description: 'States that the expected counts are 18.08, 11.68, and 10.24, found by multiplying the null proportions by the sample size of 40', required: true },
            { id: 'obs-minus-exp', description: 'Explains that the differences are computed as observed minus expected counts', required: true },
            { id: 'contributions', description: 'Explains that each contribution is calculated with (Obs - Exp)^2 / Exp', required: true },
            { id: 'sum-to-chi-square', description: 'States that the chi-square statistic is the sum of the contributions across categories', required: true },
            { id: 'chi-square-value', description: 'Identifies the chi-square statistic as 7.746', required: true },
            { id: 'degrees-of-freedom', description: 'Explains that df = 2 because there are 3 categories and df = categories - 1', required: true },
            { id: 'upper-tail-p-value', description: 'Explains that the p-value is found from the upper tail of the chi-square distribution', required: true },
            { id: 'p-value-number', description: 'Gives the approximate p-value as 0.0208, or as between 0.02 and 0.025 from Table C', required: true },
            { id: 'upper-tail-reason', description: 'May explain that chi-square values are nonnegative and larger chi-square values mean a worse fit', required: false },
            { id: 'technology-or-table', description: 'May mention using the calculator GOF-Test, chi-square cdf, or Table C to obtain the p-value', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains the expected counts, contributions, chi-square value 7.746, df = 2, and the upper-tail p-value near 0.0208.',
            P: 'Response shows the main mechanics of the chi-square test but misses one major element such as the contribution formula, the degrees of freedom, or how the p-value is found.',
            I: 'Response confuses the mechanics of the test, gives the wrong statistic or p-value, or does not explain how chi-square and the p-value are obtained in this example.'
        },
        commonMistakes: [
            'Leaving out the division by expected count in the contribution formula',
            'Using expected minus observed or not mentioning the contribution formula at all',
            'Using the sample size instead of categories minus one for the degrees of freedom',
            'Treating the p-value as a lower-tail or two-sided probability instead of an upper-tail probability',
            'Reporting the Battleship p-value 0.079 instead of the predatory lending p-value 0.0208'
        ],
        contextFromVideo: 'Video 1 builds the predatory lending test step by step, ending with chi-square = 7.746, df = 2, and an upper-tail p-value near 0.0208.'
    },

    reflect2: {
        questionText: 'Explain how to interpret the p-value and state a conclusion in context for the predatory lending example. Include the null-hypothesis assumption, what 0.0208 means, the comparison to alpha = 0.05, the decision about H0, the conclusion in context, and what the largest contribution says about the highest income bracket.',
        expectedElements: [
            { id: 'null-assumption', description: 'States that the p-value is interpreted assuming the null hypothesis is true', required: true },
            { id: 'contextual-p-value', description: 'Explains that 0.0208 is the probability of getting a chi-square statistic of 7.746 or greater by chance alone under the null model', required: true },
            { id: 'compare-to-alpha', description: 'Compares the p-value 0.0208 to alpha = 0.05', required: true },
            { id: 'decision', description: 'States that we reject H0 because the p-value is less than alpha', required: true },
            { id: 'contextual-conclusion', description: 'Concludes that there is convincing statistical evidence that the distribution of predatory lending businesses is not the same as the specified household proportions', required: true },
            { id: 'largest-contribution', description: 'Identifies the highest income bracket as having the largest contribution', required: true },
            { id: 'practical-meaning', description: 'Explains that businesses were represented far less than expected in the highest income bracket, supporting the idea that they tend to be in lower income regions', required: true },
            { id: 'context-language', description: 'May note that conclusions should be written in context rather than only with symbols', required: false },
            { id: 'large-p-template', description: 'May mention the fail-to-reject template for cases where p-value is greater than alpha', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly interprets the p-value under the null, compares it to alpha = 0.05, rejects H0, gives the right contextual conclusion, and uses the contribution to explain the main discrepancy.',
            P: 'Response has the right general conclusion but leaves out one major part such as the null assumption, the alpha comparison, or the contribution-based explanation.',
            I: 'Response misinterprets the p-value, makes the wrong decision about H0, or gives an incorrect or context-free conclusion.'
        },
        commonMistakes: [
            'Saying the p-value is the probability that the null hypothesis is true',
            'Using the alternative hypothesis as the assumption for interpreting the p-value',
            'Failing to reject even though 0.0208 is less than 0.05',
            'Giving a conclusion with no context about predatory lending businesses and Dallas income brackets',
            'Ignoring the contribution evidence from the highest income bracket'
        ],
        contextFromVideo: 'Video 2 interprets p = 0.0208 under the null, rejects H0 at alpha = 0.05, and uses the largest contribution from the highest income bracket to explain the practical conclusion.'
    },

    exitTicket: {
        questionText: 'City leaders use district participation proportions 0.32, 0.12, 0.10, 0.27, 0.05, and 0.14 for districts A through F. A simple random sample of 240 households produced observed counts 100, 35, 40, 22, 12, and 31. A chi-square goodness-of-fit test gives chi-square = 47.48, df = 5, and p-value = 4.53 x 10^-9. (a) State the null and alternative hypotheses and define the parameters. (b) Identify the procedure and check the random, 10%, and expected-count conditions, including the expected counts 76.8, 28.8, 24, 64.8, 12, and 33.6. (c) Interpret the p-value and state the decision at alpha = 0.05. (d) Write the conclusion in context. (e) Identify which district had the greatest change and justify it using contributions.',
        expectedElements: [
            { id: 'hypotheses', description: 'States H0 with the six specified district proportions and Ha that at least one district proportion differs', required: true },
            { id: 'parameter-definition', description: 'Defines the parameters as the population proportions of households participating in the summer program for districts A through F', required: true },
            { id: 'procedure', description: 'Identifies the procedure as a chi-square goodness-of-fit test for one sample and one categorical variable with six categories', required: true },
            { id: 'conditions', description: 'Checks the simple random sample condition, the 10% condition for n = 240, and that all expected counts are greater than 5', required: true },
            { id: 'expected-counts', description: 'Uses or reports the expected counts 76.8, 28.8, 24, 64.8, 12, and 33.6', required: true },
            { id: 'mechanics', description: 'Reports chi-square = 47.48, df = 5, and p-value = 4.53 x 10^-9 or approximately 0', required: true },
            { id: 'decision-and-conclusion', description: 'Rejects H0 at alpha = 0.05 and concludes that the district participation proportions are not the same as those used by the city', required: true },
            { id: 'district-d', description: 'Identifies District D as having the greatest change because it has the largest contribution, about 28.27', required: true },
            { id: 'sample-size', description: 'May mention that the total sample size is 240 households', required: false },
            { id: 'full-test-structure', description: 'May organize the answer into hypotheses, procedure/conditions, mechanics, and conclusion', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly gives the hypotheses, procedure and conditions, mechanics, conclusion, and identifies District D with contribution-based support.',
            P: 'Response shows most parts of the full chi-square test but misses one major condition, one numerical summary, or the contribution-based justification for District D.',
            I: 'Response gives the wrong procedure, missing or incorrect hypotheses, wrong mechanics, or an incorrect conclusion about the city district proportions.'
        },
        commonMistakes: [
            'Using df = 6 instead of 5',
            'Omitting the specific null proportions or failing to define the parameters',
            'Skipping the expected counts when checking conditions',
            'Failing to reject even though the p-value is essentially 0',
            'Choosing the district with the largest observed count instead of the district with the largest contribution'
        ],
        contextFromVideo: 'Video 3 models a full AP exam response for the city district example, including expected counts, chi-square = 47.48, df = 5, p-value about 0, rejection of H0, and District D as the largest contributor.'
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L3[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Chi-Square Test for Goodness of Fit.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L3}

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
    'score': 'E', 'P', or 'I', // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    'feedback': 'Brief explanation of score',
    'matched': ['element1', 'element2'],
    'missing': ['element3'],
    'suggestion': 'Helpful tip for improvement or null if E'
}`;
};

/**
 * Get the rubric for a specific question
 * @param {string} questionId - The ID of the question
 * @returns {object} The rubric object
 */
window.getRubricU8L3 = function(questionId) {
    return window.RUBRICS_U8L3[questionId];
};
