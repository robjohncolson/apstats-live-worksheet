/**
 * AI Grading Prompts for Unit 8 Lesson 2: Chi-Square Distributions and Setting Up a GOF Test
 * Topic 8.2: Chi-Square Distributions / Stating Hypotheses / Identifying Procedure & Conditions
 *
 * Learning Objectives:
 *   Explain what the chi-square statistic measures and why values are always non-negative
 *   Describe how degrees of freedom affect the shape of chi-square distributions
 *   State null and alternative hypotheses for a chi-square goodness-of-fit test
 *   Identify when a chi-square goodness-of-fit test is the appropriate procedure
 *   Check the conditions for performing a chi-square goodness-of-fit test
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U8L2 = `
VIDEO 1 - Chi-Square Distributions (~8 min):
- Uses the predatory lending example from Dallas, Texas: a random sample of 40 predatory lending businesses across three household-income brackets
- Expected counts come from multiplying each bracket's proportion of households by the sample size of 40
- Observed counts: 20 (under 50K), 17 (50K–100K), 3 (100K+)
- Expected proportions from 2019 American Community Survey: 0.452, 0.292, 0.256
- Expected counts: 18.08, 11.68, 10.24
- Contributions = (Obs − Exp)^2 / Exp for each category
- Chi-square statistic = 7.746
- There are infinitely many chi-square distributions; shape is determined by degrees of freedom
- Degrees of freedom = number of categories minus 1 (NOT based on sample size like t-distributions)
- For this example: 3 categories → df = 2
- Simulation of 1000 samples: only 22 had chi-square ≥ 7.746, so about 2.2%
- As degrees of freedom increase, the chi-square distribution becomes less right-skewed
- Chi-square values are always non-negative (unlike normal and t-distributions)
- TAKEAWAY: chi-square measures distance between observed and expected counts relative to expected counts

VIDEO 2 - Stating Hypotheses (~8 min):
- Null hypothesis: the distribution of the categorical variable matches the specified proportions
- Can be written in words or symbols; if using symbols, must define what each p represents
- Example null: p₁ = 0.452, p₂ = 0.292, p₃ = 0.256
- Alternative hypothesis: at least one proportion is not as specified in the null
- MUST state the alternative in words for a chi-square GOF test
- Do NOT write the alternative as if ALL proportions differ
- Do NOT use directional inequalities (< or >) in the alternative
- Never refer to sample proportions (p-hat) in hypotheses; hypotheses are about parameters
- Practice: Battleship example with 4 quadrants, each hypothesized at 0.25

VIDEO 3 - Identifying the Procedure and Checking Conditions (~7 min):
- A chi-square goodness-of-fit test is used when:
  • Data are observed counts across categories of ONE categorical variable
  • There is ONE sample (not comparing groups)
  • We are making a decision (test, not interval)
- Conditions for inference:
  1. Random: data come from a random sample or randomized experiment
  2. 10% condition: sample ≤ 10% of population (when sampling without replacement)
  3. Large Counts: ALL expected counts must be greater than 5
- Expected counts = proportion from null hypothesis × sample size
- If all null proportions are equal, all expected counts will be equal
- Practice: Battleship example — 100 players, 4 quadrants, expected counts = 0.25 × 100 = 25 each
`;

// Rubrics for each reflection question
window.RUBRICS_U8L2 = {
    reflect1: {
        questionText: "Explain what the chi-square statistic measures in the predatory lending example and how degrees of freedom affect the chi-square distribution. Include the expected counts from the null model, the idea of contributions (Obs − Exp)²/Exp, the value χ² = 7.746, why df = 2, and how the distribution changes as degrees of freedom increase.",
        expectedElements: [
            { id: "expected-counts", description: "Explains that expected counts come from multiplying the hypothesized proportions (0.452, 0.292, 0.256) by the sample size of 40", required: true },
            { id: "contributions", description: "Describes contributions as (Obs − Exp)²/Exp for each category, measuring relative discrepancy", required: true },
            { id: "chi-square-value", description: "Identifies the observed chi-square statistic as 7.746", required: true },
            { id: "chi-square-meaning", description: "Explains that chi-square measures the distance between observed and expected counts relative to expected counts", required: true },
            { id: "df-calculation", description: "States that degrees of freedom = number of categories minus 1, so df = 3 − 1 = 2", required: true },
            { id: "df-not-sample-size", description: "Notes that chi-square df are based on number of categories, not sample size (unlike t-distributions)", required: true },
            { id: "df-shape-effect", description: "Explains that as degrees of freedom increase the chi-square distribution becomes less right-skewed", required: true },
            { id: "non-negative", description: "May mention that chi-square values are always non-negative", required: false },
            { id: "simulation-result", description: "May mention that only about 2.2% of simulated samples had chi-square ≥ 7.746", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains expected counts from the null model, contributions, the chi-square value 7.746, why df = 2, and how distribution shape changes with degrees of freedom",
            P: "Response covers most ideas but misses one major element such as df calculation, how contributions work, or the effect of df on distribution shape",
            I: "Response confuses expected and observed counts, gives wrong chi-square value, or does not explain either the statistic or the degrees of freedom"
        },
        commonMistakes: [
            "Saying degrees of freedom depend on sample size like t-distributions",
            "Forgetting to explain that contributions divide by expected count to make discrepancies relative",
            "Reporting the wrong chi-square value",
            "Saying the chi-square distribution becomes more right-skewed as df increase (opposite is true)",
            "Using equal proportions (1/3 each) instead of the census-based proportions"
        ],
        contextFromVideo: "The lesson builds chi-square from the predatory lending example with 3 income brackets and df = 2, then contrasts the shape with the 10-sided die example with df = 9."
    },

    reflect2: {
        questionText: "Explain how to state hypotheses and check conditions for a chi-square goodness-of-fit test. Include what the null and alternative hypotheses should say, why the alternative is written in words, why the procedure fits one sample and one categorical variable, and the random, 10%, and expected-count conditions.",
        expectedElements: [
            { id: "null-hypothesis", description: "States that the null hypothesis says the proportions for each category equal specified values", required: true },
            { id: "alternative-hypothesis", description: "States that the alternative says at least one proportion is not as specified in the null", required: true },
            { id: "alternative-in-words", description: "Explains that the alternative must be stated in words because directional inequalities do not apply with multiple categories", required: true },
            { id: "procedure-identification", description: "Identifies chi-square GOF test as appropriate for one categorical variable with one sample", required: true },
            { id: "random-condition", description: "States data must come from a random sample or randomized experiment", required: true },
            { id: "ten-percent-condition", description: "States the sample must be ≤ 10% of the population when sampling without replacement", required: true },
            { id: "large-counts-condition", description: "States that all expected counts must be greater than 5", required: true },
            { id: "expected-count-formula", description: "May explain that expected counts are found by multiplying null proportions by sample size", required: false },
            { id: "parameters-not-statistics", description: "May note that hypotheses are about population parameters, never sample statistics like p-hat", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states both hypotheses, explains the word-form alternative, identifies the GOF procedure, and lists all three conditions with the expected-count threshold",
            P: "Response covers the main ideas but misses one condition, does not explain why the alternative is in words, or confuses the procedure identification",
            I: "Response omits or misstates multiple conditions, writes directional alternative hypotheses, or does not connect the procedure to one sample and one categorical variable"
        },
        commonMistakes: [
            "Writing the alternative with directional inequalities (< or >) instead of words",
            "Stating the alternative as if all proportions are different rather than at least one",
            "Using sample proportions (p-hat) in the hypotheses instead of population parameters",
            "Forgetting the expected-count condition or using an incorrect threshold",
            "Confusing chi-square GOF (one variable, one sample) with chi-square independence (two variables)"
        ],
        contextFromVideo: "Video 2 demonstrates hypotheses for predatory lending, Video 3 demonstrates procedure ID and condition checking for both predatory lending and Battleship examples."
    },

    exitTicket: {
        questionText: "A random sample of 100 Battleship players produced observed counts of 16, 22, 33, and 29 for quadrants 1 through 4. Suppose no quadrant is preferred, so each quadrant has probability 0.25. (a) State the null and alternative hypotheses for this situation. (b) Identify the correct significance test procedure and explain why it fits this setting. (c) Check the conditions for inference, including the expected count for each quadrant. (d) State the degrees of freedom and describe the general shape of the chi-square distribution for this test. (e) Explain what a larger chi-square value would mean about how well the observed counts fit the equal-proportions model.",
        expectedElements: [
            { id: "null-hypothesis", description: "States H₀: p₁ = p₂ = p₃ = p₄ = 0.25 or equivalent wording that all quadrants have equal proportions", required: true },
            { id: "alternative-hypothesis", description: "States Hₐ in words: at least one proportion is not 0.25 or the distribution is not equal across quadrants", required: true },
            { id: "procedure", description: "Identifies chi-square goodness-of-fit test because there is one categorical variable (quadrant) and one sample", required: true },
            { id: "random-condition", description: "Checks that a random sample of 100 Battleship players was selected", required: true },
            { id: "ten-percent", description: "States 100 ≤ 10% of all Battleship players (at least 1000 exist)", required: true },
            { id: "expected-counts", description: "Calculates expected counts as 0.25 × 100 = 25 for each quadrant and notes all are > 5", required: true },
            { id: "degrees-of-freedom", description: "States df = 4 − 1 = 3 for four categories", required: true },
            { id: "distribution-shape", description: "Describes the chi-square distribution with 3 df as right-skewed with only non-negative values", required: true },
            { id: "larger-chi-square", description: "Explains that a larger chi-square value means observed counts deviate more from expected, indicating a poorer fit to the equal-proportions model", required: true },
            { id: "define-parameters", description: "May define p₁ through p₄ as the proportions of players placing most ships in each quadrant", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states both hypotheses, identifies the GOF procedure, checks all three conditions with expected counts of 25, gives df = 3, describes the right-skewed shape, and interprets larger chi-square values",
            P: "Response addresses most parts but misses one condition, omits df or the shape description, or does not fully explain what larger chi-square values mean",
            I: "Response misstates hypotheses, gives wrong expected counts or wrong df, or draws incorrect conclusions about what chi-square values indicate"
        },
        commonMistakes: [
            "Stating the alternative with inequalities instead of words",
            "Using 100 as the expected count instead of 25",
            "Forgetting to check the 10% condition",
            "Calculating df from sample size instead of number of categories",
            "Saying a larger chi-square means a better fit (opposite is true)"
        ],
        contextFromVideo: "The Battleship problem is the practice example from Videos 2 and 3: 4 quadrants, equal proportions, n = 100, expected count = 25 each, df = 3."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU8L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U8L2[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Chi-Square Distributions and Setting Up a Goodness-of-Fit Test.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U8L2}

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
window.getRubricU8L2 = function(questionId) {
    return window.RUBRICS_U8L2[questionId];
};
