/**
 * AI Grading Prompts for Unit 7 Lesson 3: Justifying a Claim About a Population Mean Based on a Confidence Interval
 * Topic 7.3: Justifying a Claim About a Population Mean Based on a Confidence Interval
 *
 * Learning Objectives:
 *   Interpret a confidence interval for a population mean in context
 *   Use a confidence interval to justify a claim about a population mean
 *   Interpret the confidence level of a confidence interval
 *   Describe how sample size and confidence level affect margin of error
 *   Carry out the full process for a one-sample t-interval for mu
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L3 = `
VIDEO 1 - Interpreting an Interval and Using It to Justify a Claim (~4.5 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - Interpret a confidence interval for a population mean in context
  - Use a confidence interval to justify whether a claim about a population mean is plausible
  - General interpretation template: "We are C% confident that the interval from ___ to ___ captures the population parameter in context"
  - If a claimed value is inside the interval, that value is plausible for the population mean
  - If the claimed value is plausible, there is not convincing evidence against that claim
  - If every value in the interval is above a comparison value, the interval supports a greater-than claim
- SWEET SUGARY GOODNESS EXAMPLE:
  - 95% confidence interval for the mean bag weight: 900.92 to 912.68 grams
  - Interpretation: we are 95% confident this interval captures the mean weight of all bags filled by the wholesaler
  - Manufacturer claim: mean weight is 907 grams
  - Concern: bags may be underfilled, meaning the true mean is less than 907 grams
  - Since 907 grams is inside the interval, 907 is a plausible value for mu
  - Therefore there is not convincing evidence that the bags are being underfilled
- FIDDLER FEEDING FRENZY EXAMPLE:
  - Given interval: 67.65 plus or minus 1.76 scoops per 30 seconds
  - Rewritten interval: 65.89 to 69.41 scoops per 30 seconds
  - Claim to assess: average feeding rate is faster than 2 scoops per second
  - Convert 2 scoops per second to 60 scoops per 30 seconds
  - Because the entire interval 65.89 to 69.41 is above 60, there is convincing evidence that the population mean feeding rate is greater than 2 scoops per second

VIDEO 2 - Interpreting Confidence Level and Factors that Affect Margin of Error (~7.5 min):
- MAIN IDEAS:
  - This video interprets the confidence level, not the confidence interval itself
  - Confidence level is understood through repeated random sampling with the same sample size
  - Approximately C% of C% confidence intervals from repeated random samples will capture the population mean
  - Do not interpret confidence level as the probability that one completed interval captures mu
  - For a single finished interval, it either captures mu or it does not
  - Confidence intervals have structure: point estimate plus or minus margin of error
  - Interval width is twice the margin of error
  - To make intervals more precise, reduce the margin of error
  - Increasing sample size decreases the margin of error
  - For a population mean, margin of error is proportional to 1/sqrt(n), so quadrupling n cuts the margin of error in half
  - Decreasing the confidence level decreases the critical value t* and therefore decreases the margin of error
- HUMAN BODY TEMPERATURE EXAMPLE:
  - Population model: approximately normal with mean 98.6 degrees Fahrenheit and standard deviation 0.8 degrees Fahrenheit
  - Imagine many random samples of n = 10 people
  - A simulation of 1000 different 95% confidence intervals showed about 95.6% capturing the true population mean
  - Correct contextual interpretation: if many random samples of 10 people were taken and a 95% confidence interval were built from each sample, about 95% of those intervals would capture the mean human body temperature of all people

VIDEO 3 - Full Process for Constructing and Interpreting a Confidence Interval for a Population Mean (~4.5 min):
- MAIN IDEAS:
  - Full process: define the parameter, identify the procedure, verify conditions, calculate the interval, and interpret it in context
  - You do not need to interpret the confidence level unless specifically asked
- 2013 AP EXAM CROWS EXAMPLE:
  - A random sample of 23 crows from a region had lead levels measured
  - A biologist classified lead levels greater than 6.0 ppm as unhealthy
  - Part (a): 4 of 23 crows were above 6.0 ppm, so the sample proportion unhealthy was about 0.174
  - Part (b) focuses on the mean lead level, not the proportion
  - Parameter: mu = mean lead level of all crows in the region
  - Procedure: one-sample t-interval for mu
  - Conditions:
    - random sample of 23 crows
    - 23 is reasonably less than 10% of all crows in the region
    - stemplot shows no strong skewness or outliers, so a normal population model is reasonable
  - Sample statistics: x-bar = 4.90 ppm, s = 1.12 ppm, n = 23
  - Degrees of freedom: 22
  - 95% critical value: t* = 2.074
  - Margin of error: 0.484
  - Confidence interval: 4.416 to 5.384 ppm
  - Interpretation: we are 95% confident this interval captures the mean lead level of all crows in the region
  - Because the whole interval lies below 6.0 ppm, 6.0 is not a plausible value for the population mean and there is convincing evidence the population mean lead level is less than 6.0 ppm
`;

// Rubrics for each reflection question
window.RUBRICS_U7L3 = {
    reflect1: {
        questionText: "Using the powdered sugar and fiddler crab examples, explain how a confidence interval can be used to justify a claim about a population mean. Include what it means when a claimed value is inside the interval and what it means when the entire interval is above the comparison value.",
        expectedElements: [
            { id: "inside-plausible", description: "Explains that a claimed mean inside the interval is a plausible value for the population mean", required: true },
            { id: "no-evidence-against", description: "States that if the claimed value is inside the interval, there is not convincing evidence against that claim", required: true },
            { id: "sugar-interval", description: "Uses the powdered sugar example with 907 inside the interval 900.92 to 912.68", required: true },
            { id: "sugar-conclusion", description: "Concludes there is not convincing evidence that the powdered sugar bags are underfilled", required: true },
            { id: "all-above-logic", description: "Explains that if the entire interval is above the comparison value, the data support a greater-than claim", required: true },
            { id: "unit-conversion", description: "Notes that 2 scoops per second must be converted to 60 scoops per 30 seconds", required: true },
            { id: "crab-example", description: "Uses the fiddler crab interval 65.89 to 69.41 and notes it is entirely above 60", required: true },
            { id: "crab-conclusion", description: "Concludes there is convincing evidence the mean feeding rate is greater than 2 scoops per second", required: true }
        ],
        scoringGuide: {
            E: "Response clearly explains both interval-to-claim decision rules and correctly applies them to the powdered sugar and fiddler crab examples",
            P: "Response shows the main inside-versus-all-above logic but omits or weakly explains one or more contextual details from the examples",
            I: "Response misunderstands how interval location relates to a claim or gives incorrect conclusions for the examples"
        },
        commonMistakes: [
            "Saying a value inside the interval proves the claim is true instead of saying it is plausible",
            "Claiming there is convincing evidence against the powdered sugar claim even though 907 is inside the interval",
            "Forgetting to convert 2 scoops per second to 60 scoops per 30 seconds",
            "Using only one example instead of explaining both interval situations",
            "Failing to connect the conclusion to the population mean in context"
        ],
        contextFromVideo: "Video 1 uses the powdered sugar interval to show an inside value is plausible and the fiddler crab interval to show an all-above interval supports a greater-than claim."
    },

    reflect2: {
        questionText: "Explain how to interpret a 95% confidence level for the body temperature example and describe how increasing sample size or decreasing confidence level affects the margin of error for a confidence interval for a population mean.",
        expectedElements: [
            { id: "repeated-sampling", description: "Interprets confidence level using repeated random sampling with the same sample size", required: true },
            { id: "context", description: "States that many random samples of 10 people would be used to build 95% confidence intervals for the mean human body temperature of all people", required: true },
            { id: "capture-rate", description: "States that about 95% of those intervals would capture the population mean", required: true },
            { id: "not-probability", description: "Explains that 95% is not the probability that one completed interval contains mu", required: true },
            { id: "sample-size-effect", description: "States that increasing sample size decreases the margin of error", required: true },
            { id: "confidence-effect", description: "States that decreasing the confidence level decreases the critical value and the margin of error", required: true },
            { id: "precision", description: "May note that a smaller margin of error makes the interval narrower or more precise", required: false },
            { id: "quadruple-rule", description: "May note that quadrupling the sample size cuts the margin of error in half", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the 95% confidence level in context and accurately explains both margin-of-error effects",
            P: "Response gives a mostly correct confidence-level interpretation or margin-of-error discussion but leaves out an important piece or context",
            I: "Response treats confidence level as the probability for one interval or gives incorrect claims about how sample size or confidence level affects margin of error"
        },
        commonMistakes: [
            "Saying there is a 95% chance that the one computed interval contains mu",
            "Leaving out repeated random sampling",
            "Forgetting to mention the sample size of 10 in the body temperature context",
            "Saying increasing confidence level makes the interval narrower",
            "Saying larger sample sizes increase margin of error"
        ],
        contextFromVideo: "Video 2 uses the body-temperature simulation to define confidence level and then explains how sample size and confidence level change margin of error."
    },

    exitTicket: {
        questionText: "An environmental group measured lead levels for a random sample of 23 crows in a region. The sample mean was 4.90 ppm, the sample standard deviation was 1.12 ppm, and a biologist classifies lead levels above 6.0 ppm as unhealthy. (a) Identify the correct confidence interval procedure and explain why the conditions are met. (b) Construct and interpret a 95% confidence interval for the mean lead level of crows in the region. (c) Use your interval to decide whether there is convincing evidence that the population mean lead level is less than 6.0 ppm, and justify your conclusion.",
        expectedElements: [
            { id: "procedure", description: "Identifies the procedure as a one-sample t-interval for a population mean", required: true },
            { id: "random-condition", description: "States that the data came from a random sample of 23 crows", required: true },
            { id: "ten-percent", description: "States that 23 is reasonably less than 10% of all crows in the region", required: true },
            { id: "shape-condition", description: "Uses the stemplot evidence of no strong skewness or outliers", required: true },
            { id: "sample-stats", description: "Uses the sample statistics x-bar = 4.90, s = 1.12, and n = 23", required: true },
            { id: "degrees-freedom", description: "Computes or states df = 22", required: true },
            { id: "critical-value", description: "States the 95% critical value t* = 2.074", required: true },
            { id: "formula", description: "Uses the one-sample t-interval form x-bar plus or minus t* times s over square root of n", required: true },
            { id: "margin-error", description: "States or supports that the margin of error is 0.484", required: true },
            { id: "interval", description: "Gives the interval 4.416 to 5.384 ppm", required: true },
            { id: "interpretation", description: "Interprets the interval in context for the mean lead level of all crows in the region", required: true },
            { id: "claim-logic", description: "Explains that because the entire interval is below 6.0 ppm, there is convincing evidence the population mean lead level is less than 6.0 ppm", required: true }
        ],
        scoringGuide: {
            E: "Response correctly completes the full one-sample t-interval process for the crow data and uses the interval correctly to justify the less-than claim",
            P: "Response includes most of the correct setup and interval work but misses one or two important details or has a weak claim justification",
            I: "Response uses the wrong procedure, gives an incorrect interval, or fails to justify the claim from the interval"
        },
        commonMistakes: [
            "Using a z interval instead of a t interval",
            "Leaving out one of the required conditions",
            "Using the wrong degrees of freedom or critical value",
            "Interpreting the interval for individual crows instead of the population mean",
            "Failing to explain that 6.0 is outside the interval and therefore not plausible for the mean"
        ],
        contextFromVideo: "Video 3 walks through the full State-Plan-Do-Conclude process for the crow lead-level data and shows that the final interval is entirely below 6.0 ppm."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L3[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Justifying a Claim About a Population Mean Based on a Confidence Interval.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L3}

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
window.getRubricU7L3 = function(questionId) {
    return window.RUBRICS_U7L3[questionId];
};
