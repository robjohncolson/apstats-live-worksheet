/**
 * AI Grading Prompts for Unit 5 Lesson 5: Sampling Distributions for Sample Proportions
 * Topic 5.5: How Do Sample Proportions Behave?
 *
 * Learning Objectives:
 *   UNC-3.K - Determine parameters of a sampling distribution for sample proportions [Skill 3.B]
 *   UNC-3.L - Determine whether a sampling distribution for a sample proportion is approximately normal [Skill 3.C]
 *   UNC-3.M - Interpret probabilities and parameters for a sampling distribution for a sample proportion [Skill 4.B]
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U5L5 = `
VIDEO 1 - Sampling Distributions for Sample Proportions (Topic 5.5, Daily Video 1, ~6 min):
- Presenter: Josh Tabor
- Example: A high school with 2,000 students where 30% have a driver's license
- Task: Select a random sample of n = 50 students, calculate sample proportion p-hat

BUILDING THE SAMPLING DISTRIBUTION:
- First sample: p-hat = 12/50 = 0.24
- Second sample: p-hat = 19/50 = 0.38
- Third sample: p-hat = 16/50 = 0.32
- Different samples give different p-hat values — this is SAMPLING VARIABILITY
- After 500 random samples of size 50: distribution is approximately normal, centered at 0.30, varies from about 0.15 to 0.45

FORMULAS FOR MEAN AND STANDARD DEVIATION:
- Let p-hat be the sample proportion of successes in a random sample of size n from a population with proportion p
- Mean: mu_p-hat = p (the true population proportion)
- Standard deviation: sigma_p-hat = sqrt(p(1-p)/n)
- 10% CONDITION: The standard deviation formula requires that the sample size is less than 10% of the population size (or sampling with replacement)
- These formulas are on the AP exam formula sheet

APPLICATION TO EXAMPLE:
- n = 50, p = 0.30
- mu_p-hat = 0.3
- sigma_p-hat = sqrt(0.3 × 0.7 / 50) = 0.065
- 10% condition: 50 < 10% of 2000 = 200 ✓

SHAPE — LARGE COUNTS CONDITION:
- The sampling distribution of p-hat is approximately normal when BOTH:
  np >= 10 AND n(1-p) >= 10
- For the example: np = 50(0.3) = 15 >= 10 ✓ and n(1-p) = 50(0.7) = 35 >= 10 ✓
- So the sampling distribution of p-hat will be approximately normal

VIDEO 2 - Sampling Distributions for Sample Proportions (Topic 5.5, Daily Video 2, ~6 min):
- Presenter: Josh Tabor
- Same example continued

INTERPRETING THE MEAN:
- mu_p-hat = 0.30 means: "For all random samples of size n = 50 from this population, the sample proportions of students who have a driver's license will have a mean of 0.30."
- About half the p-hats are bigger than 0.3 and about half are less than 0.3

INTERPRETING THE STANDARD DEVIATION:
- sigma_p-hat = 0.065 means: "For all random samples of size n = 50 from this population, the sample proportions of students who have a driver's license typically vary by about 0.065 from the population proportion of 0.30."
- Knowing how a sample statistic typically varies from the truth is one of the MOST IMPORTANT reasons to study sampling distributions — this connects to confidence intervals in later units

CALCULATING PROBABILITIES:
- Question: Would it be unusual to get p-hat = 0.12 or less in a sample of n = 50?
- Step 1: Draw the normal curve centered at 0.30, shade left of 0.12
- Step 2: Calculate z-score: z = (0.12 - 0.30) / 0.065 = -2.77
- Step 3: Use Table A or technology: P(p-hat <= 0.12) = 0.0028
- Interpretation: "Getting a sample proportion of 0.12 or less happens in only about 0.28% of all possible samples of size 50 from this population. This is very unusual!"
- Identifying unusual values is the second key reason to study sampling distributions — connects to significance tests in later units

KEY INTERPRETATION RULES:
1. Always interpret IN CONTEXT
2. Reference "all possible samples of this size from the population"
3. For standard deviation, include "typically" or "on average"
4. Use normal distribution procedures from Topic 5.2 with sampling distribution parameters
`;

// Rubrics for each reflection question
window.RUBRICS_U5L5 = {
    reflect1: {
        questionText: "In the driver's license example, the standard deviation of the sampling distribution is 0.065. Explain what this value tells us in context. Why is understanding this variability important for statistics? (Hint: Josh Tabor says this is 'one of the most important reasons to study sampling distributions.')",
        expectedElements: [
            { id: "sd-in-context", description: "Interprets sigma_p-hat = 0.065 in context: sample proportions of students with driver's licenses typically vary by about 0.065 from the population proportion of 0.30", required: true },
            { id: "references-all-samples", description: "References 'all random samples of size 50 from this population' — not just one sample", required: true },
            { id: "uses-typically", description: "Uses language like 'typically' or 'on average' when describing the variability", required: true },
            { id: "importance-connection", description: "Connects to why this matters: knowing typical variability helps build confidence intervals or assess whether a result is unusual", required: false },
            { id: "not-single-sample", description: "Distinguishes that the standard deviation describes sample-to-sample variation, not variation within a single sample", required: false }
        ],
        scoringGuide: {
            E: "Response interprets sigma_p-hat = 0.065 in context (driver's license proportions), references all possible samples of this size, and uses 'typically' or 'on average.' Bonus for connecting to confidence intervals or significance tests.",
            P: "Response gives a partially correct interpretation — mentions variability but is missing context, doesn't reference all possible samples, or doesn't use 'typically/on average'",
            I: "Response shows fundamental misunderstanding — confuses standard deviation of sampling distribution with population SD, or provides a vague or incorrect interpretation"
        },
        commonMistakes: [
            "Interpreting 0.065 as the standard deviation of the population rather than the sampling distribution",
            "Forgetting to say 'typically' or 'on average' — implying every sample is exactly 0.065 away",
            "Not referencing all possible samples of this size",
            "Giving a generic definition of standard deviation without context (driver's licenses, this population)",
            "Confusing variation within one sample with variation between different sample proportions"
        ],
        contextFromVideo: "Josh Tabor interprets: 'For all random samples of size n = 50 from this population, the sample proportions of students who have a driver's license typically vary by about 0.065 from the population proportion of 0.30.' He then says: 'Knowing how much a sample statistic typically varies from the truth is one of the most important reasons to study sampling distributions. You'll see this coming up in Units 6, 7, 8, and 9 when we talk about confidence intervals.'"
    },

    reflect2: {
        questionText: "A polling company surveys n = 100 people from a large city where 40% support a new policy (p = 0.40). (a) Calculate the mean and standard deviation of the sampling distribution of p-hat. (b) Verify that the Large Counts condition is met. (c) Would it be surprising to get a sample proportion of 0.52 or higher? Calculate the z-score and explain.",
        expectedElements: [
            { id: "correct-mean", description: "Correctly calculates mu_p-hat = 0.40", required: true },
            { id: "correct-sd", description: "Correctly calculates sigma_p-hat = sqrt(0.40 × 0.60 / 100) = 0.049 (or approximately 0.049)", required: true },
            { id: "large-counts-check", description: "Checks Large Counts: np = 100(0.40) = 40 >= 10 and n(1-p) = 100(0.60) = 60 >= 10", required: true },
            { id: "z-score-calculation", description: "Calculates z = (0.52 - 0.40) / 0.049 = 2.45 (approximately)", required: true },
            { id: "interprets-unusual", description: "Interprets: 0.52 is about 2.45 standard deviations above the mean, which would be unusual/surprising", required: true },
            { id: "probability-value", description: "Calculates or estimates P(p-hat >= 0.52) ≈ 0.007 (very small probability)", required: false }
        ],
        scoringGuide: {
            E: "Response correctly calculates mean (0.40), SD (≈0.049), verifies Large Counts (40 ≥ 10 and 60 ≥ 10), calculates z ≈ 2.45, and correctly interprets the result as unusual/surprising",
            P: "Response gets most calculations correct but has a minor computational error, or calculations are correct but interpretation is incomplete or vague",
            I: "Response has major calculation errors (wrong formula, wrong values), fails to verify conditions, or fundamentally misinterprets the z-score"
        },
        commonMistakes: [
            "Using the wrong formula (e.g., sigma = p(1-p)/n without the square root)",
            "Forgetting to check the Large Counts condition",
            "Computing the z-score with the wrong values in the numerator or denominator",
            "Saying a z-score of 2.45 is 'not unusual' — it is quite unusual (beyond 2 SD)",
            "Not interpreting in context (just giving numbers without explanation)"
        ],
        contextFromVideo: "This applies the same process Josh Tabor demonstrates with the driver's license example. Students should calculate mu_p-hat = p, sigma_p-hat = sqrt(p(1-p)/n), verify the Large Counts condition (np >= 10 and n(1-p) >= 10), then use z = (p-hat - mu) / sigma to assess whether a value is unusual."
    },

    exitTicket: {
        questionText: "A factory produces light bulbs and historically 5% are defective (p = 0.05). A quality inspector takes a random sample of n = 200 bulbs. (a) Describe the sampling distribution of p-hat (shape, center, spread). Be sure to check the relevant conditions. (b) The inspector finds that 16 out of 200 bulbs are defective (p-hat = 0.08). Should the inspector be concerned that the defect rate has increased? Use a probability calculation to support your answer.",
        expectedElements: [
            { id: "center", description: "States mu_p-hat = 0.05", required: true },
            { id: "spread", description: "Calculates sigma_p-hat = sqrt(0.05 × 0.95 / 200) ≈ 0.0154", required: true },
            { id: "shape-conditions", description: "Checks Large Counts: np = 200(0.05) = 10 >= 10 and n(1-p) = 200(0.95) = 190 >= 10, so approximately normal", required: true },
            { id: "z-score", description: "Calculates z = (0.08 - 0.05) / 0.0154 ≈ 1.95", required: true },
            { id: "probability-interpretation", description: "Finds P(p-hat >= 0.08) ≈ 0.026 (about 2.6%) and interprets: this would be somewhat unusual if p truly equals 0.05, suggesting the inspector might have reason for concern", required: true },
            { id: "ten-percent-condition", description: "Mentions the 10% condition (200 < 10% of all bulbs produced)", required: false }
        ],
        scoringGuide: {
            E: "Response correctly describes the sampling distribution (shape with condition check, center = 0.05, spread ≈ 0.0154), calculates z ≈ 1.95, finds the probability, and provides a well-reasoned conclusion about whether the inspector should be concerned",
            P: "Response gets most of the description correct and attempts a probability calculation, but has a minor error or incomplete interpretation",
            I: "Response has major errors in describing the sampling distribution, uses wrong formulas, fails to check conditions, or draws conclusions not supported by calculations"
        },
        commonMistakes: [
            "Forgetting to check that np = 10 is EXACTLY at the boundary — it just barely meets the condition",
            "Using 16 instead of 0.08 in the z-score formula (must use proportions, not counts)",
            "Forgetting that sigma_p-hat uses the POPULATION proportion p = 0.05, not the sample proportion 0.08",
            "Not providing a clear conclusion — just calculating without interpreting",
            "Saying 'it's fine' without considering that z ≈ 1.95 is close to the typical threshold of 2"
        ],
        contextFromVideo: "This mirrors the probability calculation from Video 2. Josh Tabor shows how to: (1) describe the sampling distribution, (2) draw a picture, (3) calculate a z-score, and (4) interpret the probability in context. The key question is whether an observed sample proportion is unusual enough to suggest the true proportion has changed."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU5L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U5L5[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Sampling Distributions for Sample Proportions.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U5L5}

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
window.getRubricU5L5 = function(questionId) {
    return window.RUBRICS_U5L5[questionId];
};
