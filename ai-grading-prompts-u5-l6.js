/**
 * AI Grading Prompts for Unit 5 Lesson 6: Sampling Distributions for Differences in Sample Proportions
 * Topic 5.6 — Center, Spread, & Shape for p-hat_1 - p-hat_2
 *
 * Learning Objectives:
 *   UNC-3.N - Determine parameters of a sampling distribution for a difference in sample proportions
 *   UNC-3.O - Determine whether approximately normal (Large Counts condition)
 *   UNC-3.P - Interpret probabilities and parameters in context
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U5L6 = `
VIDEO — Topic 5.6: Sampling Distributions for Differences in Sample Proportions (Josh Tabor):
- Context: High School A has 30% students with driver's license (p_A = 0.30), High School B has 22% (p_B = 0.22). These are POPULATION proportions (parameters).
- Sampling process: select random sample of n = 50 from each school, compute p-hat_A - p-hat_B
- Each dot on the sampling distribution represents the DIFFERENCE from one pair of random samples — not an individual response
- Example samples:
  * Sample 1: p-hat_A = 0.36, p-hat_B = 0.20, difference = 0.16
  * Sample 2: p-hat_A = 0.26, p-hat_B = 0.28, difference = -0.02 (negative is OK — just means School B sample had higher proportion)
  * Sample 3: p-hat_A = 0.28, p-hat_B = 0.18, difference = 0.10
- After 500 simulated pairs: distribution is approximately normal, centered at 0.08, ranges from about -0.15 to +0.35
- The center 0.08 matches the TRUE difference p_A - p_B = 0.30 - 0.22 = 0.08, confirming p-hat_1 - p-hat_2 is an UNBIASED estimator

FORMULAS (on AP formula sheet):
- Mean: mu_{p-hat_1 - p-hat_2} = p_1 - p_2
- SD: sigma_{p-hat_1 - p-hat_2} = sqrt[ p_1(1-p_1)/n_1 + p_2(1-p_2)/n_2 ]
- SD formula ADDS variances because the two samples are INDEPENDENT
- Conditions for SD formula: (1) both sample sizes < 10% of population sizes, (2) samples are independent

SHAPE — Large Counts Condition:
- For the difference in sample proportions to be approximately normal, ALL FOUR of these must be >= 10:
  n_1*p_1, n_1*(1-p_1), n_2*p_2, n_2*(1-p_2)
- This extends the single-proportion check (2 products) to two populations (4 products)
- Example check: School A: 50(0.30)=15, 50(0.70)=35; School B: 50(0.22)=11, 50(0.78)=39 — all >= 10, so approximately normal

KEY CONNECTIONS:
- This extends Topic 5.5 (single proportion) to comparing TWO populations
- Same framework: describe shape, center, spread — but now for the difference statistic
- Formulas are on the AP formula sheet — no memorization required
`;

// Rubrics for each reflection question
window.RUBRICS_U5L6 = {
    reflect1: {
        questionText: "Compare the sampling distribution for a single sample proportion (Topic 5.5) to the sampling distribution for a difference in sample proportions (this lesson). What stays the same in how we describe them (shape, center, spread), and what changes? Why does the standard deviation formula add the variance terms?",
        expectedElements: [
            { id: "same-framework", description: "Identifies that both use shape/center/spread framework and can be approximately normal", required: true },
            { id: "center-comparison", description: "Compares centers: single proportion centers at p, difference centers at p_1 - p_2", required: true },
            { id: "sd-adds-variances", description: "Explains that the SD formula adds variance terms from each population", required: true },
            { id: "independence-reason", description: "Explains WHY we add variances — because the two samples are independent", required: true },
            { id: "large-counts-extension", description: "Notes that Large Counts condition extends from 2 checks to 4 checks", required: false }
        ],
        scoringGuide: {
            E: "Response correctly compares both distributions using shape/center/spread, explains that center shifts from p to p_1-p_2, discusses SD formula adding variances, and explains independence as the reason for adding variances",
            P: "Response shows partial understanding — identifies some similarities/differences but misses the independence explanation for adding variances, or confuses the center formulas",
            I: "Response shows fundamental misunderstanding, confuses the two distributions, or provides no meaningful comparison"
        },
        commonMistakes: [
            "Thinking we subtract variances because we subtract proportions (we ADD variances for independent random variables)",
            "Forgetting that both distributions can be approximately normal under appropriate conditions",
            "Not recognizing that the center formula changes from p to p_1 - p_2",
            "Confusing parameters (p_1, p_2) with statistics (p-hat_1, p-hat_2)"
        ],
        contextFromVideo: "The video explicitly builds on Topic 5.5 and states 'these questions probably look familiar because they're almost exactly the same as the questions we asked in Topic 5.5.' The key new concept is that variances ADD because the samples are independent."
    },

    reflect2: {
        questionText: "In the video, one pair of samples gave p-hat_A - p-hat_B = -0.02, even though the true difference is p_A - p_B = 0.08. Explain why a single pair of samples can produce a difference that has the wrong sign. What does the sampling distribution tell us about how often this might happen?",
        expectedElements: [
            { id: "sampling-variability", description: "Explains that sampling variability causes individual sample differences to vary around the true difference", required: true },
            { id: "wrong-sign-possible", description: "Explains that random chance can produce a negative value even when the true difference is positive — the sample from B just happened to have a higher proportion", required: true },
            { id: "distribution-context", description: "Connects to the sampling distribution — the distribution shows the range of possible differences and how often each occurs", required: true },
            { id: "frequency-estimate", description: "Uses the sampling distribution to estimate how often wrong-sign results occur (values below 0 in a distribution centered at 0.08 with SD 0.087)", required: false },
            { id: "unbiased-concept", description: "Notes that despite individual wrong-sign results, the distribution is centered at the true difference (unbiased)", required: false }
        ],
        scoringGuide: {
            E: "Response explains sampling variability as the reason, correctly interprets what a negative difference means (School B sample had higher proportion), and connects to the sampling distribution to discuss how often this might happen",
            P: "Response identifies sampling variability but doesn't connect to the sampling distribution, or explains the distribution but doesn't clearly explain why a negative value can occur",
            I: "Response shows fundamental misunderstanding, suggests the true difference might be wrong, or provides no meaningful explanation of variability"
        },
        commonMistakes: [
            "Thinking a negative result means the population proportions are wrong",
            "Not understanding that 'wrong sign' results are a natural consequence of sampling variability",
            "Failing to connect back to the sampling distribution as a tool for understanding how often unusual results occur",
            "Confusing the distribution of individual observations with the sampling distribution of the difference in proportions"
        ],
        contextFromVideo: "The video shows that the second sample pair gave p-hat_A = 0.26, p-hat_B = 0.28, yielding a difference of -0.02. Josh Tabor explains: 'Negatives are okay in this context. That just means we're subtracting a smaller number minus a bigger number.' The simulated distribution ranges from about -0.15 to +0.35, showing that negative values are possible but not common."
    },

    exitTicket: {
        questionText: "A polling company surveys voters in two cities about support for a ballot measure. In City 1, the true proportion in favor is p_1 = 0.58 and they sample n_1 = 100 voters. In City 2, the true proportion is p_2 = 0.45 and they sample n_2 = 80 voters. (a) Find the mean and interpret in context. (b) Calculate the SD and interpret. (c) Verify Large Counts condition.",
        expectedElements: [
            { id: "mean-calculation", description: "Calculates mean = 0.58 - 0.45 = 0.13", required: true },
            { id: "mean-interpretation", description: "Interprets mean in context: on average, sample differences in support will center around 0.13 (13 percentage points more support in City 1)", required: true },
            { id: "sd-calculation", description: "Calculates SD = sqrt[0.58(0.42)/100 + 0.45(0.55)/80] = sqrt[0.002436 + 0.0030938] ≈ sqrt[0.0055298] ≈ 0.074", required: true },
            { id: "sd-interpretation", description: "Interprets SD: the difference in sample proportions typically varies by about 0.074 from the true difference", required: false },
            { id: "large-counts-check", description: "Checks all four: 100(0.58)=58, 100(0.42)=42, 80(0.45)=36, 80(0.55)=44 — all >= 10, so approximately normal", required: true },
            { id: "normal-conclusion", description: "Concludes the sampling distribution is approximately normal", required: true }
        ],
        scoringGuide: {
            E: "Response correctly calculates mean (0.13) with context interpretation, calculates SD (approximately 0.074), checks all four Large Counts products correctly, and concludes approximately normal",
            P: "Response gets most calculations correct but misses interpretation, or has minor arithmetic errors, or checks fewer than 4 Large Counts products",
            I: "Response has major calculation errors, misunderstands what is being calculated, or fails to check the Large Counts condition"
        },
        commonMistakes: [
            "Subtracting in wrong order (0.45 - 0.58)",
            "Forgetting to take the square root in the SD formula",
            "Only checking 2 of the 4 Large Counts products (treating it as single-proportion check)",
            "Not interpreting calculations in the context of cities and ballot measure support",
            "Using n instead of the correct p values in the Large Counts check"
        ],
        contextFromVideo: "This parallels the driver's license example from the video. Students should apply the same formulas: mean = p_1 - p_2, SD = sqrt[p_1(1-p_1)/n_1 + p_2(1-p_2)/n_2], and check all four Large Counts products."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU5L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U5L6[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Sampling Distributions for Differences in Sample Proportions (Topic 5.6).

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U5L6}

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
window.getRubricU5L6 = function(questionId) {
    return window.RUBRICS_U5L6[questionId];
};
