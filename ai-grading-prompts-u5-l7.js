/**
 * AI Grading Prompts for Unit 5 Lesson 7: Sampling Distributions for Sample Means
 * Topic 5.7 — Parameters, Shape, & Probability for x-bar
 *
 * Learning Objectives:
 *   UNC-3.Q - Determine parameters for a sampling distribution for sample means
 *   UNC-3.R - Determine whether a sampling distribution of a sample mean can be described as approximately normal
 *   UNC-3.S - Interpret probabilities and parameters for a sampling distribution for a sample mean
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U5L7 = `
VIDEO 1 — Topic 5.7 Daily Video 1: Parameters & Shape (Josh Tabor):
- Context: A large lemon tree produces lemons with weights approximately normally distributed, mean mu = 4 oz, SD sigma = 0.5 oz.
- Sampling process: select random sample of n = 6 lemons, weigh each, calculate sample mean x-bar.
- Each dot on the sampling distribution represents a value of x-bar from one random sample — not an individual lemon's weight.
- After 500 simulated samples of size 6: distribution is approximately normal, centered at 4 oz, varies from about 3.4 to 4.6 oz.

FORMULAS (on AP formula sheet):
- Mean: mu_x-bar = mu (the population mean)
- SD: sigma_x-bar = sigma / sqrt(n)
- Condition for SD formula: sample size must be less than 10% of the population size.
- Example calculation: sigma_x-bar = 0.5 / sqrt(6) = 0.204 oz.

SHAPE — Two ways the sampling distribution of x-bar can be approximately normal:
1. The POPULATION distribution is approximately normal (applies to lemon example)
2. The sample size is large enough: n >= 30 (Central Limit Theorem from Topic 5.3)
Only ONE of these conditions needs to be met.

VIDEO 2 — Topic 5.7 Daily Video 2: Interpreting Parameters & Calculating Probabilities (Josh Tabor):
INTERPRETING THE MEAN (mu_x-bar = 4):
- "For all random samples of size n = 6 from this population, the sample mean weights of lemons will have a mean of 4 ounces."
- Must reference "all possible samples" of this size from this population.
- Must include context and UNITS (ounces).

INTERPRETING THE SD (sigma_x-bar = 0.204):
- "For all random samples of size n = 6 from this population, the sample mean weights of lemons will typically vary by about 0.204 ounces from the population mean of 4 ounces."
- Must include "typically" or "on average."
- KEY INSIGHT: Knowing how much a statistic typically varies from the truth is one of the MOST IMPORTANT reasons to study sampling distributions. Connects to confidence intervals in Units 6-9.

CALCULATING PROBABILITIES:
- Question: Would it be unusual to get x-bar = 4.5 or greater in a sample of 6?
- Draw normal curve, label mean (4), shade right of 4.5.
- z-score: z = (4.5 - 4) / 0.204 = 2.45
- P(x-bar >= 4.5) = 0.0071 using Table A or technology
- Interpretation: "Getting a sample mean of 4.5 ounces or more happens in only about 0.71% of all possible samples of size 6 from this tree. This is VERY unusual."
- KEY CONTRAST: One lemon weighing 4.5 oz is NOT surprising. An AVERAGE of 6 lemons at 4.5+ oz IS surprising. Averages are less variable than individual values.
`;

// Rubrics for each reflection question
window.RUBRICS_U5L7 = {
    reflect1: {
        questionText: "Compare the sampling distribution of x-bar (sample means) with the sampling distribution of p-hat (sample proportions) from Topic 5.5. How are the formulas for the mean and standard deviation similar? How are the conditions for approximate normality different? Why do you think the normality conditions differ?",
        expectedElements: [
            { id: "mean-similarity", description: "Explains that both sampling distributions have means equal to the population parameter (mu_x-bar = mu, mu_p-hat = p)", required: true },
            { id: "sd-similarity", description: "Explains that both SDs decrease as sample size increases — both have n in the denominator (sigma/sqrt(n) for means, sqrt(p(1-p)/n) for proportions)", required: true },
            { id: "normality-difference", description: "Correctly states the different normality conditions: for x-bar, population normal OR n >= 30; for p-hat, Large Counts condition (np >= 10 and n(1-p) >= 10)", required: true },
            { id: "why-different", description: "Offers a reasonable explanation for the different conditions, such as proportions arising from binary outcomes while sample means can originate from populations of many shapes", required: true },
            { id: "both-unbiased", description: "Notes that both statistics are unbiased estimators of their respective parameters", required: false }
        ],
        scoringGuide: {
            E: "Response correctly identifies similarities (means equal parameter, SDs decrease with n) and differences (normality conditions) between x-bar and p-hat sampling distributions, with at least some reasoning for why conditions differ",
            P: "Response identifies some similarities or differences but misses key comparisons, or confuses which conditions go with which statistic",
            I: "Response shows fundamental confusion between x-bar and p-hat distributions, or provides no meaningful comparison"
        },
        commonMistakes: [
            "Applying Large Counts condition to sample means instead of CLT/normal population",
            "Thinking both distributions use the same normality conditions",
            "Not recognizing that both SDs share the pattern of decreasing with larger n",
            "Confusing the 10% condition (for SD formula validity) with the normality condition"
        ],
        contextFromVideo: "Video 1 explicitly states two ways x-bar can be approximately normal: (1) population is approximately normal, or (2) n >= 30 (CLT). This contrasts with p-hat which uses the Large Counts condition from Topic 5.5. Both formulas appear on the AP formula sheet."
    },

    reflect2: {
        questionText: "The video shows that getting a single lemon weighing 4.5 ounces is not surprising, but getting an average of 6 lemons weighing 4.5 ounces or more IS very surprising (P = 0.0071). Explain in your own words why averages are less variable than individual values. What would happen to the probability P(x-bar >= 4.5) if we increased the sample size from 6 to 50? Explain your reasoning.",
        expectedElements: [
            { id: "averaging-effect", description: "Explains that when averaging multiple values, extreme highs and lows tend to cancel out, pulling the average closer to the population mean", required: true },
            { id: "sd-formula-connection", description: "Connects to the formula: sigma_x-bar = sigma/sqrt(n), so as n increases, the SD decreases, making the distribution narrower", required: true },
            { id: "n50-prediction", description: "Correctly predicts that with n = 50, P(x-bar >= 4.5) would be even smaller (much more unusual) because the SD decreases", required: true },
            { id: "n50-calculation-or-reasoning", description: "Provides reasoning or approximate calculation: sigma_x-bar for n=50 would be 0.5/sqrt(50) ≈ 0.071, making z = (4.5-4)/0.071 ≈ 7.07, which gives essentially 0 probability", required: false },
            { id: "inference-connection", description: "Connects to inference: the fact that averages are less variable is what makes them useful for making conclusions about populations", required: false }
        ],
        scoringGuide: {
            E: "Response explains why averages are less variable (cancellation of extremes), connects to the SD formula, and correctly predicts that larger n makes 4.5 even more unusual with reasoning",
            P: "Response explains averaging effect OR connects to SD formula, but not both; or correctly predicts n=50 effect without sufficient reasoning",
            I: "Response does not explain why averages are less variable, or incorrectly predicts the effect of increasing n"
        },
        commonMistakes: [
            "Thinking larger samples are MORE variable (confusing variability within a sample with variability of sample means)",
            "Not connecting the conceptual explanation to the formula sigma/sqrt(n)",
            "Thinking P(x-bar >= 4.5) would increase with larger n",
            "Confusing individual values with sample means"
        ],
        contextFromVideo: "Josh Tabor emphasizes: 'Getting one lemon that's 4.5 ounces? Not surprising. Getting an average of 6 lemons that's 4.5 ounces or greater? That is surprising. And that's because averages are a lot less variable than individual values.' The formula sigma/sqrt(n) shows SD shrinks as n grows."
    },

    exitTicket: {
        questionText: "The heights of adult women in a country are normally distributed with a mean of 64 inches and a standard deviation of 3 inches. A researcher takes a random sample of n = 36 women. (a) Find the mean and SD of the sampling distribution of x-bar and interpret both in context. (b) Explain why the sampling distribution is approximately normal (which condition applies?). (c) What is the probability that the sample mean height is 65 inches or more? Calculate the z-score, find the probability, and state whether this result is unusual.",
        expectedElements: [
            { id: "mean-calculation", description: "Calculates mean = mu = 64 inches", required: true },
            { id: "mean-interpretation", description: "Interprets: for all random samples of 36 women, the sample mean heights will have a mean of 64 inches", required: true },
            { id: "sd-calculation", description: "Calculates SD = 3/sqrt(36) = 3/6 = 0.5 inches", required: true },
            { id: "sd-interpretation", description: "Interprets: the sample mean heights will typically vary by about 0.5 inches from the population mean of 64 inches", required: true },
            { id: "normality-justification", description: "States the population is normally distributed, so the sampling distribution is also normal (could also note n >= 30 applies as a second reason)", required: true },
            { id: "z-score", description: "Calculates z = (65 - 64) / 0.5 = 2.00", required: true },
            { id: "probability", description: "Finds P(x-bar >= 65) = P(z >= 2.00) ≈ 0.0228", required: true },
            { id: "unusual-conclusion", description: "Concludes this is unusual — only about 2.28% of samples would produce a mean of 65+ inches", required: true }
        ],
        scoringGuide: {
            E: "Response correctly calculates mean (64) and SD (0.5) with context interpretations using units (inches), justifies normality, calculates z-score (2.00), finds probability (≈0.0228), and interprets whether it's unusual",
            P: "Response gets most calculations correct but misses interpretations, or has minor errors; or justifies normality but picks wrong condition; or doesn't interpret the probability",
            I: "Response has major calculation errors, misunderstands what is being calculated, or fails to attempt the probability calculation"
        },
        commonMistakes: [
            "Using sigma = 3 instead of sigma_x-bar = 0.5 when calculating the z-score",
            "Forgetting to take the square root of n in the SD formula",
            "Not interpreting in context with units (inches)",
            "Only citing CLT (n >= 30) without noting the population is already normal",
            "Forgetting to reference 'all possible samples' in interpretations",
            "Shading the wrong direction on the normal curve"
        ],
        contextFromVideo: "This parallels the lemon example from both videos. Students should: (1) calculate mean and SD using the formulas, (2) justify normality using the population distribution and/or CLT, (3) calculate a z-score and probability, (4) interpret in context. Unlike the lemon example (n=6 from normal population), this example has n=36 so both normality conditions are met."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU5L7 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U5L7[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Sampling Distributions for Sample Means (Topic 5.7).

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U5L7}

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
window.getRubricU5L7 = function(questionId) {
    return window.RUBRICS_U5L7[questionId];
};
