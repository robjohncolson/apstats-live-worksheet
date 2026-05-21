/**
 * AI Grading Prompts for Unit 5 Lesson 4: Biased and Unbiased Point Estimates
 * Topic 5.4: When Does a Sample Statistic "Hit the Target" on Average?
 *
 * Learning Objectives:
 *   UNC-3.I - Explain why an estimator is or is not unbiased [Skill 4.B]
 *   UNC-3.J - Calculate estimates for a population parameter [Skill 3.B]
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U5L4 = `
VIDEO - Biased and Unbiased Point Estimates (Topic 5.4, ~4.5 min):
- Presenter: Penny Smeltzer
- Example: A breeder has 5 Weimaraner dogs with ages: 0, 2, 5, 8, 10
- Population mean (mu) = 5
- Population range = 10 - 0 = 10

SAMPLE MEAN AS UNBIASED ESTIMATOR:
- One sample of 3 dogs: {0, 2, 5} gives x-bar = 2.3
- x-bar is the POINT ESTIMATOR (the statistic); 2.3 is the POINT ESTIMATE (the value)
- The video lists ALL possible samples of size 3 and their means
- Key result: the mean of ALL sample means = 5 = mu
- Because the average of the estimator equals the parameter, x-bar is UNBIASED
- Individual sample means VARY around mu — some too high, some too low — but they center on mu
- "An estimator exhibits variability that can be modeled using probability"

SAMPLE RANGE AS BIASED ESTIMATOR:
- Sample {0, 2, 5}: range = 5 (this is the point estimate for range)
- The video lists ALL possible sample ranges
- Key result: the mean of ALL sample ranges = 7.8, which is NOT equal to 10
- So the sample range is a BIASED estimator of the population range
- The dot plot shows all sample ranges cluster to the LEFT of the population range (10)
- The range systematically UNDERESTIMATES the population range
- Reason: a sample can never have a range LARGER than the population (you can't get values outside the population), so it can only be equal or smaller

KEY TAKEAWAYS:
1. A sample statistic is a point estimator of the corresponding population parameter
2. Estimators exhibit variability that can be modeled using probability
3. An estimator is unbiased if, ON AVERAGE, the value of the estimator equals the population parameter
`;

// Rubrics for each reflection question
window.RUBRICS_U5L4 = {
    reflect1: {
        questionText: "The sample mean of {0, 2, 5} was 2.3 — way off from the population mean of 5. Yet we still call x-bar an 'unbiased' estimator. Explain what 'unbiased' actually promises and what it does NOT promise about any single sample.",
        expectedElements: [
            { id: "unbiased-means-on-average", description: "Explains that 'unbiased' means the average across ALL possible samples equals the parameter, not that any single sample is correct", required: true },
            { id: "single-sample-can-miss", description: "Acknowledges that individual samples can be far from the parameter — unbiased does NOT guarantee accuracy for one sample", required: true },
            { id: "centered-at-parameter", description: "Describes the sampling distribution as centered at mu — misses are equally likely on both sides", required: true },
            { id: "variability-is-natural", description: "Mentions that variability from sample to sample is expected and natural", required: false },
            { id: "uses-example", description: "References the Weimaraner example (2.3 vs 5) to illustrate the concept", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains that 'unbiased' is about the average across all possible samples (not any single sample), acknowledges individual samples can miss, and describes the sampling distribution as centered at the parameter",
            P: "Response shows partial understanding — mentions 'on average' but doesn't clearly distinguish between single-sample accuracy and long-run centering, or misses the 'centered at parameter' idea",
            I: "Response shows fundamental misunderstanding — thinks unbiased means every sample is correct, or confuses bias with variability, or provides no meaningful explanation"
        },
        commonMistakes: [
            "Thinking 'unbiased' means every sample gives the right answer",
            "Confusing bias (systematic error) with variability (random error)",
            "Thinking a single bad estimate proves the estimator is biased",
            "Not understanding what 'on average' refers to (all possible samples, not repeated measurements)"
        ],
        contextFromVideo: "Penny Smeltzer shows that x-bar = 2.3 for one sample but then lists ALL possible sample means and shows their average is 5 = mu. She highlights 'on average, the value of the estimator is equal to the population parameter.' Individual means 'vary about the population mean.'"
    },

    reflect2: {
        questionText: "Explain in your own words why the sample range is a biased estimator of the population range. Use the Weimaraner example to describe WHY the bias goes in one direction (always underestimating, never overestimating). Could a different statistic be biased in the opposite direction — systematically overestimating?",
        expectedElements: [
            { id: "mean-not-equal-parameter", description: "States that the mean of all sample ranges (7.8) does not equal the population range (10), so it's biased", required: true },
            { id: "direction-of-bias", description: "Explains that the sample range systematically underestimates — it tends to be LESS than the population range", required: true },
            { id: "why-one-direction", description: "Explains WHY: a sample can never have a range larger than the population range (can't get values outside population boundaries), so sample ranges can only be ≤ population range", required: true },
            { id: "overestimation-possible", description: "Addresses whether overestimation is possible for a different statistic (yes, in principle a different statistic could systematically overestimate)", required: false },
            { id: "dot-plot-reference", description: "References the dot plot clustering to the left of 10", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains why range is biased (average of sample ranges ≠ population range), identifies the direction (underestimates), and gives a clear reason why it can only underestimate (samples can't exceed population boundaries). Bonus for addressing the overestimation question.",
            P: "Response identifies range as biased and the direction, but doesn't clearly explain WHY it can only underestimate, or explanation is incomplete",
            I: "Response shows fundamental misunderstanding of bias, doesn't explain the mechanism, or confuses bias with variability"
        },
        commonMistakes: [
            "Saying the range is biased 'because 7.8 is close to 10' (closeness doesn't matter — not equal means biased)",
            "Confusing the direction — thinking range overestimates",
            "Not understanding WHY the bias is one-directional",
            "Thinking all statistics are biased, or that bias can be fixed by taking a larger sample"
        ],
        contextFromVideo: "Penny Smeltzer shows all sample ranges and notes: 'they don't vary on either side of the population range. They vary only on the left side.' The mean of sample ranges is 7.8, not 10. She explicitly states the range is biased because 'on average, the value of the estimator does not equal the population parameter.'"
    },

    exitTicket: {
        questionText: "A population of 4 students has quiz scores: {60, 70, 80, 90}. Population mean = 75, population range = 30. A researcher takes all possible samples of size 2. (a) Would you expect the mean of all sample means to equal 75? Explain why. (b) Would you expect the mean of all sample ranges to equal 30? Why or why not? (c) Which statistic is a more trustworthy estimator?",
        expectedElements: [
            { id: "mean-is-unbiased", description: "States yes, the mean of all sample means should equal 75 because x-bar is an unbiased estimator of mu", required: true },
            { id: "range-is-biased", description: "States no, the mean of all sample ranges will NOT equal 30 because the sample range is a biased estimator that underestimates", required: true },
            { id: "range-reasoning", description: "Explains why range underestimates: samples of 2 from 4 values are unlikely to capture both the min (60) and max (90) every time", required: true },
            { id: "mean-more-trustworthy", description: "Concludes the sample mean is more trustworthy because it's unbiased — it targets the parameter on average", required: true },
            { id: "clear-reasoning", description: "Shows clear connection between the Weimaraner lesson and this new context", required: false }
        ],
        scoringGuide: {
            E: "Response correctly predicts sample mean is unbiased (yes, equals 75), sample range is biased (no, less than 30), gives a clear reason for the range bias (hard to capture both extremes), and identifies sample mean as the more trustworthy estimator",
            P: "Response gets the predictions correct but reasoning is incomplete or vague, OR has one minor error but shows correct conceptual understanding",
            I: "Response has major conceptual errors — predicts range is unbiased, doesn't understand bias, or draws incorrect conclusions"
        },
        commonMistakes: [
            "Thinking both statistics are unbiased because 'samples are random'",
            "Thinking the range would equal 30 because it's a 'simple' statistic",
            "Not connecting back to the Weimaraner lesson (this is the same pattern)",
            "Confusing 'trustworthy' with 'always correct' instead of 'unbiased'"
        ],
        contextFromVideo: "This directly parallels the Weimaraner example. Students should recognize the same pattern: x-bar is unbiased (mean of all x-bars = mu), but sample range is biased (mean of all sample ranges < population range) because samples can't capture the full spread of the population every time."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU5L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U5L4[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Biased and Unbiased Point Estimates.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U5L4}

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
window.getRubricU5L4 = function(questionId) {
    return window.RUBRICS_U5L4[questionId];
};
