/**
 * AI Grading Prompts for Unit 7 Lesson 7: Justifying a Claim About the Difference of Two Means Based on a Confidence Interval
 * Topic 7.7: Justifying a Claim About the Difference of Two Means Based on a Confidence Interval
 *
 * Learning Objectives:
 *   Interpret a confidence interval for a difference in population means in context
 *   Explain why the order of subtraction matters when interpreting the interval
 *   Distinguish correct and incorrect confidence interval interpretations
 *   Use whether 0 is in the interval to justify or fail to justify a claim about a difference in means
 *   Write a complete AP-style two-sample t-interval procedure and conclusion
 *   Interpret the meaning of the confidence level in repeated sampling
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L7 = `
VIDEO 1 - Interpreting a Confidence Interval for Two Means (~6 min):
- Presenter: Mrs. Matamoros
- MAIN IDEAS:
  - In general, a confidence interval is interpreted as: we are C% confident that the interval from the lower bound to the upper bound captures the value to be estimated
  - The interpretation must refer to the true population parameter, not the sample
  - The direction of subtraction matters and must be named in the interpretation
  - Reversing the subtraction order negates the interval and changes the wording of the interpretation
  - Incorrect interpretations include talking about the sample (for example, "these spiders") and saying there is a 95% chance the parameter is in the interval
- ARGIOPE SPIDER EXAMPLE:
  - From Topic 7.6, the 95% confidence interval for female minus male mean body length was (7.956, 12.129) millimeters
  - Correct interpretation: we are 95% confident that this interval captures the true difference, female minus male, in mean body length
  - Alternate interpretation: female Argiope spiders are between 7.956 and 12.129 millimeters larger on average than male Argiope spiders
  - If the subtraction were male minus female, the interval would be (-12.129, -7.956) and would be interpreted as males being 7.956 to 12.129 millimeters smaller
- JUSTIFYING THE CLAIM:
  - If females and males were equal in mean body length, the difference would be 0
  - Because 0 is not in the interval, 0 is not a plausible value
  - Therefore, the interval supports the claim that female Argiope spiders are larger on average, so Argiope spiders should be included in the follow-up study

VIDEO 2 - Using the Interval to Evaluate a Claim (~7 min):
- MAIN IDEAS:
  - A confidence interval interpretation must describe the population parameter rather than the sample data
  - If 0 is in a confidence interval for a difference in means, then no difference is plausible
  - If 0 is not in the interval and the sign is consistent with the claim, the interval can support the claim
- RESTAURANT CONTAINER PRACTICE:
  - The 95% confidence interval for foam minus plastic mean food temperature was (-9.3, 3.2)
  - The correct multiple-choice answer was B because it stated that the interval captures the true difference in mean internal temperatures
  - Since 0 is in the interval, it is plausible that there is no difference between foam and plastic containers in mean food temperature
  - Therefore, the interval does not support a claim that one container keeps food hotter on average

VIDEO 3 - Full AP Problem: Fire Station Response Times (~7 min):
- MAIN IDEAS:
  - Read the entire problem, annotate details, define subscripts, and answer the specific question being asked
  - For the AP problem, define mu_N as the mean response time for the northern fire station and mu_S as the mean response time for the southern fire station
  - The correct procedure is a 2-sample t-interval for mu_N - mu_S
  - Conditions: random samples from both stations, each sample is no more than 10% of its population, and both sample sizes are greater than 30 so the sampling distribution is approximately normal by the Central Limit Theorem
  - Use 2-SampTInt with input Stats and pooled set to no
- FIRE STATION CALCULATIONS:
  - Northern station: n = 50, x-bar = 4.3, s = 3.7
  - Southern station: n = 50, x-bar = 5.3, s = 3.2
  - The calculator gives the 95% confidence interval (-2.373, 0.373) with df about 96
  - invT(0.025, 96) gives t* about 1.985
  - Correct interpretation: the true difference in mean response times (northern minus southern) is between about -2.37 and 0.37 minutes
  - Because 0 is within the interval, 0 is a plausible value for the difference
  - Therefore, the interval does not support the council member's belief that the stations have different mean response times
  - Important note: do not say the council member is wrong

VIDEO 4 - Confidence Level and Final AP Takeaways (~7 min):
- MAIN IDEAS:
  - On the AP exam, students may report the numerical interval and the degrees of freedom instead of rewriting the full formula
  - If 0 is in the interval, say the confidence interval does not support the claim of a difference
  - Do not conclude that the population means are definitely equal
  - To interpret the 95% confidence level: if all possible random samples of 50 calls from each station were selected and a 95% confidence interval were built from each pair of samples, about 95% of those intervals would capture the true difference mu_N - mu_S
  - Key takeaways are to define the direction of the difference, identify the procedure, verify the conditions, calculate the interval, and interpret the interval in context
`;

// Rubrics for each reflection question
window.RUBRICS_U7L7 = {
    reflect1: {
        questionText: "Explain how to correctly interpret a confidence interval for a difference of two means. Use the Argiope spider interval (7.956, 12.129) to give a valid interpretation, explain why the subtraction order matters, and describe two incorrect interpretations students should avoid.",
        expectedElements: [
            { id: "general-template", description: "States that we are C% confident that the interval captures the true population difference being estimated", required: true },
            { id: "spider-context", description: "Uses the spider context and identifies the parameter as the true difference in mean body lengths of female and male Argiope spiders", required: true },
            { id: "direction", description: "Includes the subtraction direction female minus male or explains that female spiders are 7.956 to 12.129 millimeters larger on average", required: true },
            { id: "order-matters", description: "Explains that reversing the subtraction order negates the interval and changes the interpretation", required: true },
            { id: "sample-error", description: "Explains that an interpretation should not refer to the sample or use wording like these spiders", required: true },
            { id: "probability-error", description: "Explains that a 95% confidence level is not a 95% chance that the fixed parameter is in this interval", required: true },
            { id: "alternate-interpretation", description: "May give the alternate valid wording that females are between 7.956 and 12.129 millimeters larger than males", required: false },
            { id: "reverse-interval", description: "May mention the reversed interval (-12.129, -7.956) for male minus female", required: false }
        ],
        scoringGuide: {
            E: "Response gives a correct contextual interpretation, explains why direction matters, and clearly identifies the common mistakes about samples and probability",
            P: "Response shows the basic interpretation idea but misses either the subtraction direction, one major mistake to avoid, or a clear explanation of why reversal changes the interval",
            I: "Response misinterprets the interval, treats confidence as probability, or focuses on the sample rather than the population parameter"
        },
        commonMistakes: [
            "Referring to the sample instead of the population parameter",
            "Saying there is a 95% chance the parameter is in the interval",
            "Leaving out the subtraction order",
            "Ignoring that reversing the subtraction negates the interval",
            "Describing the interval as the difference in sample means rather than true means"
        ],
        contextFromVideo: "Videos 1 and 2 emphasize the general confidence interval template, the spider interpretation, the direction of subtraction, and the two incorrect interpretations to avoid."
    },

    reflect2: {
        questionText: "Explain how a confidence interval can be used to justify or fail to justify a claim about a difference in means. Compare the spider interval (7.956, 12.129) and the fire-station interval (-2.37, 0.37), and explain the role of 0 as a plausible value.",
        expectedElements: [
            { id: "zero-means-no-difference", description: "Explains that 0 represents no difference between the two population means", required: true },
            { id: "spider-support", description: "Explains that 0 is not in the spider interval, so 0 is not plausible and the interval supports the claim that female spiders are larger on average", required: true },
            { id: "sign-matches-claim", description: "Connects the positive spider interval to a directional claim that female minus male is greater than 0", required: true },
            { id: "firestation-no-support", description: "Explains that 0 is in the fire-station interval, so no difference is plausible and the interval does not support the council member's belief of different mean response times", required: true },
            { id: "contextual-conclusion", description: "Makes both conclusions in context rather than as abstract rules only", required: true },
            { id: "do-not-say-wrong", description: "Notes that when 0 is in the interval you should not say the council member is wrong, only that the interval does not support the claim", required: true },
            { id: "restaurant-connection", description: "May connect the same 0-in-interval reasoning to the restaurant container example", required: false },
            { id: "plausible-language", description: "Uses the language of plausible or not plausible values for the parameter", required: false }
        ],
        scoringGuide: {
            E: "Response correctly uses 0 as the decision marker, contrasts the spider and fire-station intervals, and states both contextual conclusions accurately",
            P: "Response understands the general role of 0 but gives only one example clearly or leaves the conclusion too vague",
            I: "Response misuses the role of 0, reaches the wrong conclusion for one of the intervals, or does not connect the interval to the claim"
        },
        commonMistakes: [
            "Forgetting that 0 means no difference",
            "Claiming that 0 in the interval proves the means are equal",
            "Saying the council member is wrong instead of saying the interval does not support the claim",
            "Ignoring the sign of the spider interval when making the directional conclusion",
            "Giving conclusions without context"
        ],
        contextFromVideo: "Videos 1 through 4 use the spider interval as an example where 0 is not plausible and the fire-station interval as an example where 0 is plausible, so the claim is not supported."
    },

    exitTicket: {
        questionText: "A random sample of 50 calls from the northern fire station had a mean response time of 4.3 minutes with a standard deviation of 3.7 minutes. A random sample of 50 calls from the southern fire station had a mean response time of 5.3 minutes with a standard deviation of 3.2 minutes. A calculator produced the 95% confidence interval (-2.37, 0.37) for (mu_N - mu_S). (a) Define the parameter and identify the correct confidence interval procedure. (b) Explain why the conditions are met, including random sampling, the 10% condition, and the large-sample condition. (c) Interpret the interval in context and explain whether it supports the council member's belief that the two fire stations have different mean response times. (d) Briefly interpret the meaning of the 95% confidence level for this procedure.",
        expectedElements: [
            { id: "parameter", description: "Defines the parameter as mu_N - mu_S, the true difference in mean response times for calls from the northern and southern fire stations", required: true },
            { id: "procedure", description: "Identifies the correct procedure as a 2-sample t-interval for a difference in population means", required: true },
            { id: "random-samples", description: "Explains that the independence condition is met because there are random samples from both fire stations", required: true },
            { id: "ten-percent", description: "States that each sample of 50 calls is reasonably no more than 10% of all calls for its station", required: true },
            { id: "large-sample", description: "Explains that both sample sizes are greater than 30, so the sampling distribution is approximately normal by the Central Limit Theorem", required: true },
            { id: "interval-interpretation", description: "Interprets the interval in context as plausible values for the true difference northern minus southern in mean response times, between about -2.37 and 0.37 minutes", required: true },
            { id: "zero-plausible", description: "Explains that because 0 is in the interval, no difference is plausible", required: true },
            { id: "claim-conclusion", description: "Concludes that the interval does not support the council member's belief that the stations have different mean response times", required: true },
            { id: "confidence-level", description: "Interprets the 95% confidence level in repeated sampling language, saying about 95% of such intervals would capture the true parameter", required: true },
            { id: "do-not-say-wrong", description: "May note that you should not say the council member is wrong or that the stations are definitely the same", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states the parameter and procedure, justifies all conditions, interprets the interval in context, gives the correct conclusion about the claim, and explains the confidence level",
            P: "Response gets most of the setup and conclusion right but misses one major condition, a clear interval interpretation, or the confidence-level explanation",
            I: "Response gives the wrong parameter or procedure, does not justify the conditions, or misinterprets the interval or the role of 0"
        },
        commonMistakes: [
            "Defining the parameter as a single mean instead of mu_N - mu_S",
            "Using a 1-sample interval instead of a 2-sample t-interval",
            "Forgetting to justify the 10% condition for each station",
            "Saying the interval proves the stations are equal because 0 is in the interval",
            "Interpreting the confidence level as the probability that this interval contains the parameter"
        ],
        contextFromVideo: "Videos 3 and 4 walk through the entire fire-station procedure, the conclusion based on 0 being in the interval, and the meaning of the 95% confidence level."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L7 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L7[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Justifying a Claim About the Difference of Two Means Based on a Confidence Interval.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L7}

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
window.getRubricU7L7 = function(questionId) {
    return window.RUBRICS_U7L7[questionId];
};
