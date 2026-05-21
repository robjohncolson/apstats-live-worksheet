/**
 * AI Grading Prompts for Unit 7 Lesson 6: Confidence Intervals for the Difference of Two Means
 * Topic 7.6: Confidence Intervals for the Difference of Two Means
 *
 * Learning Objectives:
 *   Identify an appropriate confidence interval procedure for the difference of two population means
 *   Verify the conditions for calculating a confidence interval for a difference in means
 *   Determine the margin of error for a two-sample t-interval
 *   Calculate a confidence interval for the difference of two population means
 *   Use technology to find degrees of freedom and the interval with pooled set to no
 *   Interpret a confidence interval for a difference in means in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L6 = `
VIDEO 1 - Identifying the Procedure and Checking Conditions (~7 min):
- Presenter: Mrs. Matamoras
- MAIN IDEAS:
  - To identify the procedure, ask how many groups there are, what type of data were collected, and what kind of estimate is requested
  - Two groups plus quantitative data plus estimating a difference in population means with a confidence interval leads to a 2-sample t-interval
  - For independence, the data should come from two independent random samples or a randomized experiment
  - When sampling without replacement, each sample should be less than or equal to 10% of its respective population
  - For the normal condition, both sample sizes should be greater than 30 or both samples should come from approximately normal populations
  - If samples are small, the sample distributions should be free from extreme skewness or outliers
- ARGIOPE SPIDER EXAMPLE:
  - Random sample of 14 adult female spiders and 14 adult male spiders
  - Goal: calculate and interpret a 95% confidence interval for the difference in the population mean body lengths of female and male spiders
  - Histograms for both groups were roughly unimodal and symmetric, so it was reasonable to assume approximately normal populations
- LARGE-SAMPLE SPIDER VARIATION:
  - If the researchers had 35 female and 35 male spiders, condition 3 would be easier because both samples would have more than 30 observations
- SLOW-INTERNET PRACTICE:
  - Teacher randomly assigned 18 students to slow internet and 18 students to fast internet
  - Random assignment satisfies the first condition even without random selection
  - You cannot combine the groups into 36 total observations; each sample must be checked separately
  - Clear skewness and an outlier make the normal condition fail
  - The correct multiple-choice answer was C

VIDEO 2 - Margin of Error and Calculating the Interval (~8 min):
- MAIN IDEAS:
  - In general, a confidence interval is statistic plus or minus critical value times standard error of the statistic
  - For two means, the statistic is the difference in sample means
  - The standard error for a 2-sample t-interval is sqrt((s1^2 / n1) + (s2^2 / n2))
  - The point estimate is the statistic and is the center of the interval
  - The margin of error is the critical value times the standard error
  - Higher confidence levels produce larger critical values
  - For a two-sample t-interval, degrees of freedom are best found with technology
  - On the calculator, use 2-SampTInt and keep pooled set to no
- ARGIOPE SPIDER CALCULATIONS:
  - Female sample: n = 14, x-bar = 14.15 mm, s = 3.54 mm
  - Male sample: n = 14, x-bar = 4.107 mm, s = 0.92 mm
  - Point estimate for female minus male: 14.15 - 4.107 = 10.043 mm
  - 2-SampTInt gives the 95% confidence interval (7.956, 12.129)
  - Technology gives degrees of freedom about 14.73
  - invT(0.025, 14.73) gives t* about 2.13
  - Margin of error is 2.086 mm
  - The interval can also be written as 10.043 +/- 2.086
  - Because the entire interval is positive, the female spiders are estimated to be longer on average than the male spiders
- MULTIPLE-CHOICE PRACTICE:
  - Answer choice A was wrong because it used a z critical value instead of t
  - Answer choice D was wrong because the standard deviations were not squared
  - Answer choice E was wrong because the sample sizes were matched with the wrong standard deviations
  - For the 90% interval, t* was about 1.73 and the correct answer was C
`;

// Rubrics for each reflection question
window.RUBRICS_U7L6 = {
    reflect1: {
        questionText: "Explain how to identify the correct confidence interval procedure for the difference of two population means and how to verify the conditions. Use the spider example and the slow-internet experiment to discuss the roles of two groups, quantitative data, independence, the 10% condition, and the shape or sample-size requirement.",
        expectedElements: [
            { id: "procedure-match", description: "Explains that two groups with quantitative data and a confidence interval for a difference in population means leads to a 2-sample t-interval", required: true },
            { id: "independence", description: "States that independence requires two independent random samples or a randomized experiment", required: true },
            { id: "ten-percent", description: "States that when sampling without replacement, each sample should be no more than 10% of its respective population", required: true },
            { id: "normal-condition", description: "Explains that both sample sizes must be greater than 30 or both samples should come from approximately normal populations, and if samples are small there should be no extreme skewness or outliers", required: true },
            { id: "spider-example", description: "Uses the spider example to note random samples of 14 females and 14 males and that the histograms were roughly unimodal and symmetric", required: true },
            { id: "slow-internet-assignment", description: "Uses the slow-internet example to explain that random assignment satisfies the first condition", required: true },
            { id: "slow-internet-shape", description: "Explains that the slow-internet example fails because of clear skewness and an outlier, and that you cannot just combine the groups into 36", required: true },
            { id: "large-sample-variation", description: "May mention that if both spider samples were 35, the normal condition would be easier because both sample sizes exceed 30", required: false }
        ],
        scoringGuide: {
            E: "Response correctly identifies the 2-sample t-interval and clearly explains the required conditions using both the spider example and the slow-internet counterexample",
            P: "Response identifies the general procedure and some conditions but omits an important condition or uses the examples only partially",
            I: "Response gives the wrong procedure, misstates the conditions, or misuses the examples in a way that changes the conclusion"
        },
        commonMistakes: [
            "Using a 1-sample t-interval instead of a 2-sample t-interval",
            "Forgetting that each sample must satisfy the 10% condition separately",
            "Combining 18 and 18 into 36 to justify normality",
            "Thinking random selection is required even when there is random assignment",
            "Ignoring the skewness and outlier in the slow-internet example"
        ],
        contextFromVideo: "Video 1 identifies the 2-sample t-interval with the spider example and then uses the slow-internet problem to show a situation where the conditions are not met."
    },

    reflect2: {
        questionText: "Explain how to calculate and interpret a 2-sample t-interval for a difference in means. Use the spider example to describe the point estimate, margin of error, how technology gives the degrees of freedom, why pooled should be set to no, and what the interval (7.956, 12.129) means in context.",
        expectedElements: [
            { id: "general-formula", description: "States the general confidence interval form statistic plus or minus critical value times standard error", required: true },
            { id: "two-sample-formula", description: "States or describes the 2-sample t-interval formula using the difference in sample means and the standard error sqrt((s1^2 / n1) + (s2^2 / n2))", required: true },
            { id: "point-estimate", description: "Identifies the point estimate as the difference in sample means and gives 10.043 mm for female minus male", required: true },
            { id: "technology-df", description: "Explains that the degrees of freedom are found with technology and that the calculator uses pooled set to no", required: true },
            { id: "interval-values", description: "Gives the interval (7.956, 12.129) or equivalent values from the example", required: true },
            { id: "critical-value-or-moe", description: "Includes t* about 2.13 or the margin of error 2.086 mm", required: true },
            { id: "interpretation", description: "Interprets the interval in context as plausible values for how much longer female Argiope spiders are on average than male Argiope spiders", required: true },
            { id: "positive-interval", description: "Recognizes that because the interval is entirely positive, females are estimated to be larger on average than males", required: true },
            { id: "equivalent-form", description: "May mention that the interval can also be written as 10.043 +/- 2.086", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains the calculation structure, the role of technology, and the contextual interpretation of the spider interval",
            P: "Response captures the general interval process but leaves out an important calculation detail or gives only a weak interpretation",
            I: "Response uses the wrong formula, misstates the interval, or does not interpret the interval as a range of plausible values in context"
        },
        commonMistakes: [
            "Using a z interval instead of a t interval",
            "Forgetting the square root standard error formula for two means",
            "Using n - 1 for the degrees of freedom instead of technology",
            "Turning pooled on even though the lesson says to keep pooled set to no",
            "Interpreting the interval as a probability that the parameter is in the interval"
        ],
        contextFromVideo: "Video 2 builds the interval from the general formula, uses 2-SampTInt to find the interval and degrees of freedom, and interprets the positive spider interval in context."
    },

    exitTicket: {
        questionText: "Random samples of 14 adult female Argiope spiders and 14 adult male Argiope spiders were collected. Histograms for both groups were roughly unimodal and symmetric. The summary statistics were x-bar_F = 14.15 mm, s_F = 3.54 mm, x-bar_M = 4.107 mm, and s_M = 0.92 mm. A calculator produced the 95% confidence interval (7.956, 12.129) for (female - male). (a) Define the parameter and identify the correct confidence interval procedure. (b) Explain why the conditions are met, including independence, the 10% condition, and why the shape check is needed here. (c) Interpret the interval in context and explain what the positive endpoints suggest about female and male spider body lengths.",
        expectedElements: [
            { id: "parameter", description: "Defines the parameter as mu_F - mu_M, the true difference in mean body lengths of female and male Argiope spiders", required: true },
            { id: "procedure", description: "Identifies the correct procedure as a 2-sample t-interval for the difference in population means", required: true },
            { id: "independence", description: "Explains that the independence condition is met because the data came from two random samples", required: true },
            { id: "ten-percent", description: "Explains that each sample of 14 spiders is less than or equal to 10% of its respective population", required: true },
            { id: "shape-check-needed", description: "Explains that the shape check is needed because both sample sizes are less than 30", required: true },
            { id: "shape-result", description: "States that the histograms were roughly unimodal and symmetric with no extreme skewness or outliers, so the normal condition is reasonable", required: true },
            { id: "interpretation", description: "Interprets the 95% confidence interval as plausible values for the true difference female minus male in mean body length", required: true },
            { id: "contextual-values", description: "States that female Argiope spiders are estimated to be about 7.956 to 12.129 millimeters longer on average than male Argiope spiders", required: true },
            { id: "positive-endpoints", description: "Explains that the positive endpoints suggest females tend to be larger on average than males", required: true },
            { id: "pooled-no", description: "May mention that technology should be used with pooled set to no", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states the parameter and procedure, verifies all conditions, and gives a full contextual interpretation of the interval",
            P: "Response gets most of the setup and interpretation right but misses an important condition or does not fully explain what the positive interval means",
            I: "Response gives the wrong parameter or procedure, does not justify the conditions, or misinterprets the confidence interval"
        },
        commonMistakes: [
            "Defining the parameter as a single mean instead of mu_F - mu_M",
            "Using a 1-sample procedure instead of a 2-sample t-interval",
            "Forgetting that both sample sizes are under 30, so a shape check is needed",
            "Saying the confidence interval proves the result rather than giving plausible values",
            "Failing to connect the positive interval to females being larger on average"
        ],
        contextFromVideo: "The exit ticket is built directly from the spider example developed across both videos: procedure and conditions from Video 1, and the interval calculation and interpretation from Video 2."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L6[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Confidence Intervals for the Difference of Two Means.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L6}

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
window.getRubricU7L6 = function(questionId) {
    return window.RUBRICS_U7L6[questionId];
};
