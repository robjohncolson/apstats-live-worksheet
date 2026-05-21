/**
 * AI Grading Prompts for Unit 7 Lesson 5: Carrying Out a Test for a Population Mean
 * Topic 7.5: Carrying Out a Test for a Population Mean
 *
 * Learning Objectives:
 *   Calculate the standardized test statistic for a significance test about a population mean
 *   Find or approximate a p-value using the t-distribution and degrees of freedom
 *   Match the alternative hypothesis to the correct tail area for the p-value
 *   Interpret a p-value in context assuming the null hypothesis is true
 *   Compare the p-value to alpha to reject or fail to reject H0 and state a conclusion
 *   Perform a complete significance test for a mean difference in a matched-pairs setting
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L5 = `
VIDEO 1 - Calculating the Test Statistic and P-Value (~9 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - After conditions are checked, calculate the standardized test statistic as (statistic - parameter) / standard error
  - For a one-sample t-test for a population mean, t = (x-bar - mu0) / (s / sqrt(n))
  - The test statistic has an approximate t-distribution with degrees of freedom df = n - 1
  - The p-value is the probability of obtaining a test statistic as extreme or more extreme when the null hypothesis and probability model are assumed to be true
  - A two-sided alternative uses probability in both tails; a one-sided alternative uses the tail named by the inequality in Ha
  - Technology or Table B can be used to find or approximate p-values
- GOT HOPS EXAMPLE:
  - H0: mu = 15 inches; Ha: mu != 15 inches
  - x-bar = 15.8, s = 2.33, n = 20
  - t = 1.535 with df = 19
  - One tail has probability 0.0706, so the two-sided p-value is 0.1412
  - Table B shows each tail is between 0.05 and 0.10, so the full p-value is between 0.10 and 0.20
- TREAD40 EXAMPLE:
  - H0: mu = 40000 miles; Ha: mu > 40000 miles
  - x-bar = 42348, s = 2140, n = 35
  - t = 6.491 with df = 34
  - Because the alternative is greater than, the p-value is a right-tail probability
  - Technology gives p-value about 9.99 x 10^-8
  - Table B uses df = 30 and shows p-value < 0.0005

VIDEO 2 - Interpreting the P-Value and Stating a Conclusion (~6 min):
- MAIN IDEAS:
  - Interpret a p-value by assuming the null hypothesis is true
  - Then describe the probability of getting a sample mean or test statistic as extreme or more extreme by chance alone
  - Small p-values mean the test statistic would be unlikely by random chance alone; large p-values mean it would be likely by random chance alone
  - If p-value <= alpha, reject H0 and say there is convincing statistical evidence for Ha in context
  - If p-value > alpha, fail to reject H0 and say there is not convincing statistical evidence for Ha in context
- GOT HOPS CONCLUSION:
  - Use alpha = 0.05 because no significance level was given
  - Because 0.1412 > 0.05, fail to reject H0
  - There is not convincing statistical evidence that the mean vertical jump for all students at the school differs from 15 inches
- TREAD40 CONCLUSION:
  - Use alpha = 0.01
  - Because 9.99 x 10^-8 < 0.01, reject H0
  - There is convincing statistical evidence that the mean mileage for Tread40 tires is greater than 40000 miles

VIDEO 3 - Performing a Complete Significance Test with Paired Data (~6.5 min):
- MAIN IDEAS:
  - Matched pairs can be treated as one sample of paired differences
  - Compute the difference for each pair and analyze the mean difference
  - Inference is performed about mu_D, the true mean difference
  - Use a one-sample t-test on the differences
  - In a randomized experiment there is no 10% condition from sampling without replacement
  - For a small sample, the graph of differences should show no strong skewness or outliers
- BAKIN' BACON EXAMPLE:
  - Differences are defined as with seasoning minus without seasoning
  - x-bar_D = 9.5 grams, s_D = 12.51 grams, n = 10 pairs
  - H0: mu_D = 0; Ha: mu_D > 0
  - Use alpha = 0.05 because no significance level was given
  - Random assignment condition is met
  - There is no 10% condition because this was not a random sample without replacement
  - The dotplot of differences showed no strong skewness or outliers
  - t = 2.401 with df = 9
  - p-value = 0.0199
  - Because 0.0199 < 0.05, reject H0
  - There is convincing statistical evidence that the seasoning causes bacon to retain more weight on average
`;

// Rubrics for each reflection question
window.RUBRICS_U7L5 = {
    reflect1: {
        questionText: "Explain how to calculate the test statistic and p-value in a significance test for a population mean. Use the Got Hops and Tread40 examples to describe the formula, the degrees of freedom, how the alternative hypothesis determines the tail area, and how technology or Table B can be used.",
        expectedElements: [
            { id: "general-formula", description: "Explains that the standardized test statistic is statistic minus parameter divided by standard error", required: true },
            { id: "t-formula", description: "States the one-sample t-test formula t = (x-bar - mu0) / (s / sqrt(n))", required: true },
            { id: "degrees-of-freedom", description: "States that the degrees of freedom are n - 1", required: true },
            { id: "got-hops-t", description: "Uses the Got Hops example to identify t = 1.535 with 19 degrees of freedom", required: true },
            { id: "got-hops-p", description: "Explains that the Got Hops p-value is two-sided, uses both tails, and equals 0.1412 or is between 0.10 and 0.20 from Table B", required: true },
            { id: "tread40-t", description: "Uses the Tread40 example to identify t = 6.491 with 34 degrees of freedom", required: true },
            { id: "tread40-p", description: "Explains that the Tread40 p-value is a right-tail probability because Ha: mu > 40000 and is about 9.99 x 10^-8 or less than 0.0005 from Table B", required: true },
            { id: "tail-direction", description: "Connects the direction of the alternative hypothesis to the tail area used for the p-value", required: true },
            { id: "technology-tableb", description: "May mention that technology or Table B can be used to find or approximate the p-value", required: false }
        ],
        scoringGuide: {
            E: "Response correctly explains the test statistic and p-value process for both examples, including the formula, degrees of freedom, and correct tail logic",
            P: "Response shows the main calculation structure but omits an important detail such as degrees of freedom, one example, or the correct tail area",
            I: "Response gives the wrong formula, wrong tail area, wrong procedure, or major errors in the example calculations"
        },
        commonMistakes: [
            "Using a z-test instead of a one-sample t-test",
            "Forgetting that the degrees of freedom are n - 1",
            "Using one tail for Got Hops even though the alternative is two-sided",
            "Doubling the Tread40 tail probability even though the alternative is one-sided",
            "Not connecting the alternative hypothesis to the p-value direction"
        ],
        contextFromVideo: "Video 1 uses Got Hops to model a two-sided p-value and Tread40 to model a one-sided right-tail p-value."
    },

    reflect2: {
        questionText: "Explain how to interpret a p-value and state a conclusion in context. Use Got Hops and Tread40 to show the difference between failing to reject the null hypothesis and rejecting the null hypothesis, and include how the significance level affects the decision.",
        expectedElements: [
            { id: "assume-null", description: "States that a p-value is interpreted assuming the null hypothesis is true", required: true },
            { id: "chance-alone", description: "Explains that the p-value is the probability of getting a sample mean or test statistic as extreme or more extreme by chance alone", required: true },
            { id: "got-hops-interpretation", description: "Interprets the Got Hops p-value of 0.1412 in context as getting a sample mean jump as extreme as 15.8 inches in either direction if mu = 15", required: true },
            { id: "got-hops-decision", description: "Compares 0.1412 to alpha = 0.05 and concludes fail to reject H0 for Got Hops", required: true },
            { id: "got-hops-conclusion", description: "States there is not convincing statistical evidence that the mean vertical jump for all students at the school differs from 15 inches", required: true },
            { id: "small-large-pvalues", description: "Explains that small p-values lead toward rejecting H0 while large p-values lead toward failing to reject H0", required: true },
            { id: "tread40-decision", description: "Compares 9.99 x 10^-8 to alpha = 0.01 and concludes reject H0 for Tread40", required: true },
            { id: "tread40-conclusion", description: "States there is convincing statistical evidence that the mean mileage for Tread40 tires is greater than 40000 miles", required: true },
            { id: "no-accept-null", description: "May note that we reject or fail to reject H0 rather than accept it", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets the p-value template and accurately gives both the fail-to-reject Got Hops conclusion and the reject Tread40 conclusion",
            P: "Response shows the general meaning of a p-value and conclusion process but leaves out part of one example or weakly explains the role of alpha",
            I: "Response misinterprets the p-value, makes the wrong decision, or gives conclusions that do not match the examples"
        },
        commonMistakes: [
            "Saying the p-value is the probability that H0 is true",
            "Writing accept H0 instead of fail to reject H0",
            "Rejecting H0 for Got Hops even though 0.1412 is greater than 0.05",
            "Failing to reject H0 for Tread40 even though the p-value is far below 0.01",
            "Leaving the conclusion out of context"
        ],
        contextFromVideo: "Video 2 gives the p-value interpretation template, then contrasts the Got Hops fail-to-reject conclusion with the Tread40 reject conclusion."
    },

    exitTicket: {
        questionText: "In the Bakin' Bacon matched-pairs experiment, the differences were defined as (with seasoning - without seasoning). The sample of 10 pairs had x-bar_D = 9.5 grams and s_D = 12.51 grams. A dotplot of the differences showed no strong skewness or outliers, and the test results were t = 2.401 with p = 0.0199. (a) Define the parameter and state the null and alternative hypotheses in symbols and words. (b) Identify the correct significance test procedure and explain why the conditions are reasonable, including why there is no 10% condition. (c) Using alpha = 0.05, make the decision and state the conclusion in context.",
        expectedElements: [
            { id: "paired-data", description: "Recognizes that this is a matched-pairs setting analyzed with one sample of differences", required: true },
            { id: "parameter", description: "Defines mu_D as the true mean difference in cooked weight (with seasoning minus without seasoning) for packages like those in the study", required: true },
            { id: "null", description: "States the null hypothesis as H0: mu_D = 0", required: true },
            { id: "alternative", description: "States the alternative hypothesis as Ha: mu_D > 0 because the claim is that seasoning helps bacon retain more weight", required: true },
            { id: "procedure", description: "Identifies the procedure as a one-sample t-test for mu_D or for the mean difference", required: true },
            { id: "random-assignment", description: "Explains that the random assignment condition is met", required: true },
            { id: "no-ten-percent", description: "Explains that there is no 10% condition because this was not a random sample without replacement", required: true },
            { id: "shape", description: "Uses the graph of differences to say there is no strong skewness or outliers", required: true },
            { id: "decision", description: "Uses p = 0.0199 and alpha = 0.05 to reject H0", required: true },
            { id: "conclusion", description: "States there is convincing statistical evidence that the seasoning causes bacon to retain more weight on average for packages like those in the study", required: true },
            { id: "alpha-default", description: "May mention that alpha = 0.05 is used because no significance level was given", required: false }
        ],
        scoringGuide: {
            E: "Response correctly carries out the full matched-pairs significance test, including parameter, hypotheses, procedure, conditions, decision, and contextual conclusion",
            P: "Response sets up most of the matched-pairs test correctly but misses one important condition, the paired-difference idea, or the final decision and conclusion detail",
            I: "Response gives the wrong hypotheses or procedure, ignores the matched-pairs structure, or makes the wrong decision from the p-value"
        },
        commonMistakes: [
            "Treating the data as two independent samples instead of matched pairs",
            "Defining the parameter as mu instead of mu_D or forgetting the direction with minus without",
            "Claiming a 10% condition is required for this randomized experiment",
            "Ignoring the graph of differences for the small sample",
            "Failing to reject H0 even though 0.0199 is less than 0.05"
        ],
        contextFromVideo: "Video 3 uses Bakin' Bacon to show a complete matched-pairs significance test by applying a one-sample t-test to the differences."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L5[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Carrying Out a Test for a Population Mean.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L5}

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
window.getRubricU7L5 = function(questionId) {
    return window.RUBRICS_U7L5[questionId];
};
