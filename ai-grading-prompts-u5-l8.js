/**
 * AI Grading Prompts for Unit 5 Lesson 8: Sampling Distributions for Differences in Sample Means
 * Topic 5.8 — Parameters, Shape, Interpretation, & Probability for x-bar_1 - x-bar_2
 *
 * Learning Objectives:
 *   UNC-3.T - Determine parameters of a sampling distribution for a difference in sample means
 *   UNC-3.U - Determine whether a sampling distribution of a difference in sample means can be described as approximately normal
 *   UNC-3.V - Interpret probabilities and parameters for a sampling distribution for a difference in sample means
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U5L8 = `
VIDEO 1 — Topic 5.8 Daily Video 1: Parameters & Shape (Josh Tabor):
- Context: Lemons with mu_L = 4 oz, sigma_L = 0.5 oz. Oranges with mu_O = 3 oz, sigma_O = 0.4 oz. Both approximately normal. n = 6 from each tree.
- Each dot on the sampling distribution represents one value of x-bar_L - x-bar_O from a pair of random samples.
- After 500 simulated samples: distribution is approximately normal, centered at 1 oz, varies from about 0.2 to 1.8 oz.

FORMULAS (on AP formula sheet):
- Mean: mu_{x-bar_1 - x-bar_2} = mu_1 - mu_2 (difference in population means)
- SD: sigma_{x-bar_1 - x-bar_2} = sqrt(sigma_1^2/n_1 + sigma_2^2/n_2)
- Note: The SD formula ADDS variances even though we subtract means — variability accumulates when combining independent random variables.
- Conditions for SD formula: both sample sizes < 10% of respective population sizes, AND samples are independent.
- Example: mean = 4 - 3 = 1 oz. SD = sqrt(0.25/6 + 0.16/6) = sqrt(0.0417 + 0.0267) = sqrt(0.0683) = 0.26 oz.

SHAPE — Two ways the sampling distribution of x-bar_1 - x-bar_2 can be approximately normal:
1. BOTH population distributions are approximately normal (applies to citrus example)
2. BOTH sample sizes are large enough: n_1 >= 30 AND n_2 >= 30
Only ONE of these conditions needs to be met.

VIDEO 2 — Topic 5.8 Daily Video 2: Interpreting Parameters & Calculating Probabilities (Josh Tabor):
INTERPRETING THE MEAN (mu = 1):
- "For all random samples of 6 lemons and 6 oranges, the differences (L - O) in sample mean weight will have a mean of 1 ounce."
- Must reference "all possible samples" of these sizes from these populations.
- Must include context and UNITS (ounces).
- ORDER OF SUBTRACTION MATTERS: L - O gives mean of 1; O - L would give mean of -1.

INTERPRETING THE SD (sigma = 0.26):
- "The differences (L - O) in sample mean weight will typically vary by about 0.26 ounces from the true mean difference of 1 ounce."
- Must include "typically" or "on average."
- KEY: Knowing how much a statistic typically varies from the truth is important for confidence intervals and significance tests (Units 6-9).

CALCULATING PROBABILITIES:
- Question: Would it be unusual to get x-bar_L - x-bar_O > 1.2?
- Draw normal curve, label mean (1), shade right of 1.2.
- z-score: z = (1.2 - 1) / 0.26 = 0.77
- P(x-bar_L - x-bar_O > 1.2) = 0.2206
- Interpretation: ~22% of all possible samples would give a difference this large or larger. NOT unusual.
- KEY: Knowing what values are unusual connects to significance tests in Units 6-9.
`;

// Rubrics for each reflection question
window.RUBRICS_U5L8 = {
    reflect1: {
        questionText: "Compare the sampling distribution of x-bar_1 - x-bar_2 (difference in sample means) with the sampling distribution of p-hat_1 - p-hat_2 (difference in sample proportions) from Topic 5.6. How are the formulas for the mean and standard deviation similar? How are the normality conditions different?",
        expectedElements: [
            { id: "mean-similarity", description: "Explains that both sampling distributions have means equal to the difference in population parameters (mu_1 - mu_2 for means, p_1 - p_2 for proportions)", required: true },
            { id: "sd-similarity", description: "Explains that both SD formulas add variability from the two groups under a square root — both involve adding terms (one per group) under a radical", required: true },
            { id: "normality-difference", description: "Correctly states that normality conditions differ: for x-bar_1 - x-bar_2, both populations normal OR both n >= 30; for p-hat_1 - p-hat_2, Large Counts condition (four checks of np >= 10)", required: true },
            { id: "variance-addition", description: "Notes that both SD formulas ADD components even though the statistic involves subtraction — variability accumulates for independent random variables", required: false },
            { id: "sd-decrease-with-n", description: "Notes that both SDs decrease as sample sizes increase", required: false }
        ],
        scoringGuide: {
            E: "Response correctly identifies similarities in mean formulas (difference in parameters) and SD formulas (additive structure, both decrease with n), and correctly contrasts the normality conditions",
            P: "Response identifies some similarities or differences but misses key comparisons, or confuses which normality conditions apply to which statistic",
            I: "Response shows fundamental confusion between the two distributions, or provides no meaningful comparison"
        },
        commonMistakes: [
            "Applying Large Counts condition to difference in sample means instead of CLT/normal populations",
            "Thinking the SD formulas subtract terms because the statistic involves subtraction",
            "Not recognizing that both distributions share the additive variance structure",
            "Confusing the 10% condition (for SD formula validity) with the normality condition"
        ],
        contextFromVideo: "Video 1 explicitly states two ways x-bar_1 - x-bar_2 can be approximately normal: (1) both populations are approximately normal, or (2) both n >= 30 (CLT). For p-hat_1 - p-hat_2 from Topic 5.6, Large Counts condition requires four checks. Both SD formulas ADD variance terms under a square root."
    },

    reflect2: {
        questionText: "In the citrus example, the z-score for a difference of 1.2 ounces was only 0.77 (not unusual). Suppose we increased both sample sizes from 6 to 60. Without calculating the exact probability, explain what would happen to the standard deviation of the sampling distribution, the z-score, and the probability. Would a difference of 1.2 ounces become unusual? Explain your reasoning.",
        expectedElements: [
            { id: "sd-decreases", description: "Explains that increasing both sample sizes from 6 to 60 would make the SD of the sampling distribution smaller (denominators in the SD formula get larger)", required: true },
            { id: "z-increases", description: "Explains that a smaller SD means the same difference of 0.2 (numerator of z-score stays 1.2 - 1 = 0.2) is divided by a smaller number, making the z-score larger", required: true },
            { id: "probability-decreases", description: "Correctly predicts that a larger z-score means the probability P(x-bar_1 - x-bar_2 > 1.2) would decrease (smaller tail area)", required: true },
            { id: "unusual-prediction", description: "Concludes that with larger samples, a difference of 1.2 oz would likely become unusual", required: false },
            { id: "formula-reasoning", description: "References the SD formula: sqrt(sigma_1^2/n_1 + sigma_2^2/n_2) — dividing by larger n values reduces each term", required: false }
        ],
        scoringGuide: {
            E: "Response correctly traces the chain: larger n → smaller SD → larger z-score → smaller probability, with reasoning connected to the SD formula",
            P: "Response correctly identifies that SD decreases but does not clearly connect to the z-score or probability, OR correctly predicts the outcome without explaining the mechanism",
            I: "Response incorrectly predicts the direction of change, or does not connect sample size to the SD formula"
        },
        commonMistakes: [
            "Thinking larger samples increase variability (confusing within-sample spread with sampling distribution spread)",
            "Not connecting the SD change to the z-score numerator staying the same",
            "Thinking the probability would increase with larger samples",
            "Not referencing the formula to explain why SD decreases"
        ],
        contextFromVideo: "The SD formula is sqrt(sigma_1^2/n_1 + sigma_2^2/n_2). With n=6: SD = 0.26. With n=60, each fraction decreases by factor of 10, so SD = sqrt(0.0042 + 0.0027) = sqrt(0.0068) ≈ 0.083. Then z = 0.2/0.083 ≈ 2.41, making P ≈ 0.008, which IS unusual."
    },

    exitTicket: {
        questionText: "A species of oak tree produces acorns with lengths approximately normally distributed with mu_1 = 50 mm and sigma_1 = 4 mm. A different species has mu_2 = 45 mm and sigma_2 = 3 mm (also approximately normal). A botanist selects 16 acorns from each species. (a) Find the mean and SD of the sampling distribution of x-bar_1 - x-bar_2 and interpret both in context. (b) Explain why the sampling distribution is approximately normal. (c) P(x-bar_1 - x-bar_2 > 7.5)? Calculate z-score, probability, and state if unusual.",
        expectedElements: [
            { id: "mean-calculation", description: "Calculates mean = 50 - 45 = 5 mm", required: true },
            { id: "mean-interpretation", description: "Interprets: for all random samples of 16 acorns from each species, the differences in sample mean lengths will have a mean of 5 mm", required: true },
            { id: "sd-calculation", description: "Calculates SD = sqrt(16/16 + 9/16) = sqrt(1 + 0.5625) = sqrt(1.5625) = 1.25 mm", required: true },
            { id: "sd-interpretation", description: "Interprets: the differences in sample mean lengths will typically vary by about 1.25 mm from the true mean difference of 5 mm", required: false },
            { id: "normality-justification", description: "States both population distributions are approximately normal, so the sampling distribution of x-bar_1 - x-bar_2 is also approximately normal", required: true },
            { id: "z-score", description: "Calculates z = (7.5 - 5) / 1.25 = 2.00", required: true },
            { id: "probability", description: "Finds P(x-bar_1 - x-bar_2 > 7.5) = P(z > 2.00) ≈ 0.0228", required: true },
            { id: "unusual-conclusion", description: "Concludes this is unusual — only about 2.28% of samples would produce a difference of 7.5+ mm", required: false }
        ],
        scoringGuide: {
            E: "Response correctly calculates mean (5 mm), SD (1.25 mm), interprets both with context and units, justifies normality, calculates z = 2.00, finds probability ≈ 0.0228, and concludes it is unusual",
            P: "Response gets most calculations correct but misses interpretations in context, or has minor errors in the SD calculation, or does not interpret the probability",
            I: "Response has major calculation errors (e.g., uses wrong formula, wrong values), or does not attempt the probability calculation"
        },
        commonMistakes: [
            "Using sigma values instead of sigma^2 in the SD formula (forgetting to square)",
            "Forgetting to take the square root at the end of the SD calculation",
            "Not interpreting in context with units (mm)",
            "Using the individual population SD instead of the SD of the sampling distribution for the z-score",
            "Forgetting to reference 'all possible samples' in interpretations",
            "Not specifying which normality condition applies"
        ],
        contextFromVideo: "This parallels the citrus example from both videos. Students should: (1) apply the formulas for mean and SD from the formula sheet, (2) justify normality using the fact that both populations are approximately normal, (3) calculate a z-score and probability, (4) interpret all values in context with units. The SD calculation requires squaring the population SDs: 4^2 = 16 and 3^2 = 9."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU5L8 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U5L8[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Sampling Distributions for Differences in Sample Means (Topic 5.8).

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U5L8}

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
window.getRubricU5L8 = function(questionId) {
    return window.RUBRICS_U5L8[questionId];
};
