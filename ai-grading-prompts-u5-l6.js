/**
 * AI Grading Prompts for Unit 5 Lesson 6: Sampling Distributions for Differences in Sample Proportions
 * Topic 5.6 — Parameters, Shape, & Probability for p-hat_1 - p-hat_2
 *
 * Learning Objectives:
 *   UNC-3.N - Determine parameters of a sampling distribution for a difference in sample proportions
 *   UNC-3.O - Determine whether approximately normal (Large Counts condition)
 *   UNC-3.P - Interpret probabilities and parameters in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U5L6 = `
VIDEO 1 — Topic 5.6 Daily Video 1: Parameters & Shape (Josh Tabor):
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

VIDEO 2 — Topic 5.6 Daily Video 2: Interpreting Parameters & Calculating Probabilities (Josh Tabor):
INTERPRETING THE MEAN:
- Interpretation must be IN CONTEXT and reference "all possible samples" of these sizes
- "For all random samples of 50 from High School A and 50 from High School B, the differences (A-B) in sample proportions will have a mean of about 0.08."
- Must specify the order of subtraction (A - B vs B - A). Reversing gives -0.08 instead of +0.08.

INTERPRETING THE SD:
- "The differences typically vary by about 0.087 from the true difference of 0.08."
- Must include "typically" or "on average" in the interpretation
- KEY INSIGHT: Knowing how much a statistic typically varies from the truth is one of the MOST IMPORTANT reasons to study sampling distributions. Connects to confidence intervals in later units.

CALCULATING PROBABILITIES:
- Question: Would it be unusual to get a greater proportion from School B (the lower population)?
- This means finding P(p-hat_A - p-hat_B < 0)
- Draw a normal curve centered at 0.08, shade left of 0
- z-score: z = (0 - 0.08) / 0.087 = -0.92 (less than 1 SD below mean — not very far out)
- P(p-hat_A - p-hat_B < 0) = 0.1788 using Table A or technology
- Interpretation: "Getting a difference of 0 or less happens in about 17.88% of all possible samples of size 50. This is NOT unusual."
- KEY INSIGHT: Determining whether a statistic value is unusual is one of the most important reasons to study sampling distributions. Connects to significance tests in later units.
`;

// Rubrics for each reflection question
window.RUBRICS_U5L6 = {
    reflect1: {
        questionText: "The video emphasizes that interpreting the standard deviation of the sampling distribution is 'one of the most important reasons to study sampling distributions.' Explain what the SD tells us in practical terms. Why is it more useful to know how much a statistic typically varies than to know just the mean of the sampling distribution?",
        expectedElements: [
            { id: "sd-meaning", description: "Explains that the SD tells us how much the difference in sample proportions typically varies from the true difference", required: true },
            { id: "practical-value", description: "Explains the practical value: without knowing typical variation, we can't judge whether an observed difference is close to or far from the truth", required: false },
            { id: "mean-insufficient", description: "Explains why the mean alone is insufficient — it tells us the center but not how spread out the values are around it", required: true },
            { id: "connection-to-inference", description: "Connects to later inference: SD helps us build confidence intervals or determine if results are unusual (significance tests)", required: false },
            { id: "typically-language", description: "Uses language like 'typically' or 'on average' when describing the SD", required: false }
        ],
        scoringGuide: {
            E: "All 2 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Confusing the SD of the sampling distribution with the SD of individual observations",
            "Thinking the mean is sufficient because it tells us the 'right answer'",
            "Not explaining WHY knowing variation matters (just stating that it does)",
            "Confusing standard deviation with standard error"
        ],
        contextFromVideo: "Josh Tabor states: 'Knowing how much a sample statistic typically varies from the truth is one of the most important reasons to study sampling distributions. This will come up in Units 6, 7, 8, and 9 when we talk about confidence intervals.' The SD of 0.087 means most sample differences are within about 0.087 of the true 0.08."
    },

    reflect2: {
        questionText: "In the probability calculation, we found P(p-hat_A - p-hat_B < 0) ≈ 0.18. Explain in your own words what this probability means in context. If the probability had been 0.001 instead, how would your interpretation change? Connect this to the idea of whether a result is 'unusual.'",
        expectedElements: [
            { id: "probability-meaning", description: "Explains that 0.18 means about 18% of all possible sample pairs would produce School B with a higher proportion than School A", required: true },
            { id: "not-unusual", description: "Concludes this is not unusual — 18% is a reasonable probability, so this could easily happen by chance", required: true },
            { id: "small-prob-contrast", description: "Explains that 0.001 would mean only 0.1% of samples produce this result — very unusual and surprising", required: true },
            { id: "unusual-definition", description: "Connects to the concept of 'unusual': small probabilities suggest the result is unlikely by chance, large probabilities suggest it's not surprising", required: false },
            { id: "context", description: "Uses context of driver's licenses and schools in the explanation", required: false }
        ],
        scoringGuide: {
            E: "All 3 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Interpreting 0.18 as the probability that School B actually has more licensed students",
            "Not referencing 'all possible samples' in the interpretation",
            "Thinking any probability below 0.50 is 'unusual'",
            "Not explaining the contrast — just stating 0.001 is 'smaller'"
        ],
        contextFromVideo: "Josh Tabor concludes: 'Getting a difference of 0 or less happens in about 17.88% of all possible samples of size 50 from these populations. This is not unusual.' He adds: 'Noting whether a value of a statistic is unusual is one of the most important reasons we study sampling distributions.'"
    },

    exitTicket: {
        questionText: "A polling company surveys voters in two cities about support for a ballot measure. In City 1, the true proportion in favor is p_1 = 0.58 and they sample n_1 = 100 voters. In City 2, the true proportion is p_2 = 0.45 and they sample n_2 = 80 voters. (a) Find the mean and SD and interpret both in context. (b) Verify Large Counts condition. (c) Would it be unusual to get a sample difference of 0 or less? Calculate z-score and probability.",
        expectedElements: [
            { id: "mean-calculation", description: "Calculates mean = 0.58 - 0.45 = 0.13", required: false },
            { id: "mean-interpretation", description: "Interprets mean in context: for all random samples of these sizes, the differences in sample proportions of support will have a mean of about 0.13", required: true },
            { id: "sd-calculation", description: "Calculates SD = sqrt[0.58(0.42)/100 + 0.45(0.55)/80] ≈ 0.074", required: true },
            { id: "sd-interpretation", description: "Interprets SD: the differences typically vary by about 0.074 from the true difference of 0.13", required: true },
            { id: "large-counts-check", description: "Checks all four: 100(0.58)=58, 100(0.42)=42, 80(0.45)=36, 80(0.55)=44 — all >= 10, so approximately normal", required: true },
            { id: "z-score", description: "Calculates z = (0 - 0.13) / 0.074 ≈ -1.76", required: true },
            { id: "probability", description: "Finds P(p-hat_1 - p-hat_2 < 0) ≈ 0.039 using Table A or technology", required: false },
            { id: "unusual-conclusion", description: "Concludes this IS somewhat unusual — only about 3.9% of sample pairs would show City 2 with equal or more support", required: true }
        ],
        scoringGuide: {
            E: "All 6 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Subtracting in wrong order (0.45 - 0.58)",
            "Forgetting to take the square root in the SD formula",
            "Only checking 2 of the 4 Large Counts products (treating it as single-proportion check)",
            "Not interpreting calculations in the context of cities and ballot measure support",
            "Forgetting to calculate the z-score before finding the probability",
            "Confusing which direction to shade on the normal curve"
        ],
        contextFromVideo: "This parallels the driver's license example from both videos. Students should apply the same process: calculate mean and SD, check Large Counts, then use the normal distribution (z-score) to find the probability. They should interpret whether the result is unusual, as emphasized in Video 2."
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

KEY ELEMENTS (what a complete answer usually covers):
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

GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

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
window.getRubricU5L6 = function(questionId) {
    return window.RUBRICS_U5L6[questionId];
};
