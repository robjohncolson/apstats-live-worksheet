/**
 * AI Grading Prompts for Unit 7 Lesson 2: Constructing a Confidence Interval for a Population Mean
 * Topic 7.2: Constructing a Confidence Interval for a Population Mean
 *
 * Learning Objectives:
 *   Identify the correct one-sample t-interval procedure for a population mean
 *   Verify the conditions for constructing a confidence interval for a population mean
 *   Calculate a confidence interval using t* and s/sqrt(n)
 *   Interpret a confidence interval for a population mean in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L2 = `
VIDEO 1 - Identifying Procedure and Checking Conditions (~7.5 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - There are two major types of statistical inference in Units 6-9: confidence intervals and significance tests
  - Confidence intervals estimate a population parameter with an interval to account for sampling variability
  - Significance tests test claims about population parameters
  - Unit 7 focuses on quantitative data summarized by means
  - When estimating the mean in a single population, use a one-sample t-interval for a population mean
  - Conditions for a one-sample t-interval:
    - data come from a random sample from the population or a randomized experiment
    - if sampling without replacement, sample size is less than or equal to 10% of the population
    - if n >= 30, sample is large enough; if n < 30, sample data must be free of strong skewness and outliers
  - If a graph is not provided, the student must create one to justify the shape condition
- SWEET SUGARY GOODNESS EXAMPLE:
  - Data: 910, 919, 900, 913, 904, 913, 903, 914, 893, 899
  - 10 bags were randomly selected
  - It is reasonable that 10 bags is at most 10% of all bags from a food wholesaler
  - A boxplot shows no strong skewness or outliers
  - Conditions are met
- AVRIL SHOWERS PRACTICE:
  - Data: 82, 80, 81, 82, 75, 82
  - Houses were not randomly selected
  - 10% condition is reasonable
  - Dotplot shows strong skewness and a potential outlier
  - Conditions are not met

VIDEO 2 - Calculating the Confidence Interval (~9 min):
- MAIN IDEAS:
  - margin of error = (critical value)(standard error)
  - standard error of x-bar uses s/sqrt(n) because sigma is usually unknown
  - for a population mean, the critical value comes from a t distribution
  - for a one-sample t-interval, degrees of freedom are n - 1
  - a t distribution has mean 0, fatter tails, and a slightly lower peak than the standard normal distribution
  - as degrees of freedom increase, the t distribution gets closer to the standard normal distribution
  - the critical value t* captures the middle C% of the t distribution with n - 1 degrees of freedom
  - use technology or Table B to find t*
  - if the exact degrees of freedom are not in Table B, use the highest degrees of freedom that are less than the desired value
  - if table and technology disagree, use the technology value when possible
- SWEET SUGARY GOODNESS CALCULATIONS:
  - sample mean x-bar = 906.8
  - sample standard deviation s = 8.22
  - sample size n = 10, so df = 9
  - for a 95% confidence interval, t* = 2.262
  - margin of error = 5.88
  - confidence interval = 900.92 to 912.68 grams
- FIDDLER CRABS PRACTICE:
  - sample size n = 40
  - sample mean x-bar = 67.65 scoops per 30 seconds
  - sample standard deviation s = 6.61 scoops per 30 seconds
  - df = 39
  - technology critical value for 90% confidence: t* = 1.685
  - Table B fallback uses df = 30 and t* = 1.697
  - confidence interval = 65.89 to 69.41 scoops per 30 seconds

VIDEO 3 - Confidence Level and Margin of Error (partial transcript provided):
- MAIN IDEAS:
  - confidence level is interpreted through repeated random sampling
  - approximately C% of C% confidence intervals from repeated samples capture the population mean
  - do not interpret confidence level as the probability that one completed interval captures mu
  - the width of an interval is twice the margin of error
  - increasing sample size decreases margin of error
  - for a mean, margin of error is proportional to 1/sqrt(n), so quadrupling n cuts margin of error in half
  - decreasing the confidence level decreases the margin of error
`;

// Rubrics for each reflection question
window.RUBRICS_U7L2 = {
    reflect1: {
        questionText: "Using the powdered sugar example, explain why a one-sample t-interval is the correct procedure and describe how the conditions are checked.",
        expectedElements: [
            { id: "procedure", description: "Identifies a one-sample t-interval for a population mean", required: true },
            { id: "single-mean", description: "Explains that the goal is to estimate the mean of one population", required: true },
            { id: "random-condition", description: "States that the 10 bags were randomly selected", required: true },
            { id: "ten-percent", description: "States that it is reasonable that 10 bags is less than or equal to 10% of all bags from the wholesaler", required: true },
            { id: "small-sample-shape", description: "Notes that n = 10 is less than 30, so a graph must be checked for shape", required: true },
            { id: "shape-evidence", description: "Uses the boxplot evidence that there is no strong skewness or outliers", required: true },
            { id: "conditions-met", description: "Concludes that the conditions are met", required: true }
        ],
        scoringGuide: {
            E: "Response correctly identifies the one-sample t-interval and clearly explains all three conditions with correct sugar-example evidence",
            P: "Response identifies the right procedure and some correct condition checks but omits or weakly explains one or more required details",
            I: "Response uses the wrong procedure, misses major condition checks, or gives incorrect justification for why the interval is appropriate"
        },
        commonMistakes: [
            "Calling the procedure a z interval instead of a t interval",
            "Failing to mention that the sample is random",
            "Skipping the 10% condition",
            "Saying n = 10 is automatically large enough without checking shape",
            "Not using graph-based evidence for no strong skewness or outliers"
        ],
        contextFromVideo: "Video 1 explicitly applies the three conditions to the powdered sugar data and concludes that all conditions are met."
    },

    reflect2: {
        questionText: "For the powdered sugar bags, explain how to calculate the 95% confidence interval for mu. Include the degrees of freedom, the critical value, the margin of error, and an interpretation in context.",
        expectedElements: [
            { id: "sample-stats", description: "States the sample statistics x-bar = 906.8, s = 8.22, and n = 10", required: true },
            { id: "degrees-freedom", description: "Computes or states df = 9", required: true },
            { id: "critical-value", description: "States the 95% critical value t* = 2.262", required: true },
            { id: "formula", description: "Uses the confidence interval form x-bar plus or minus t* times s over square root of n", required: true },
            { id: "margin-error", description: "States or supports that the margin of error is 5.88", required: true },
            { id: "interval", description: "Gives the interval 900.92 to 912.68", required: true },
            { id: "context-interpretation", description: "Interprets the interval in context for the mean weight of all bags from the wholesaler", required: true },
            { id: "confidence-language", description: "May explicitly say we are 95% confident the true mean lies between the bounds", required: false }
        ],
        scoringGuide: {
            E: "Response correctly describes the full t-interval calculation, gives the correct interval, and interprets it in context",
            P: "Response shows the main calculation idea but is incomplete in the setup, arithmetic, or contextual interpretation",
            I: "Response gives an incorrect setup or interval, or fails to connect the result to the population mean in context"
        },
        commonMistakes: [
            "Using a z critical value instead of a t critical value",
            "Using the wrong degrees of freedom",
            "Leaving out the margin of error step",
            "Giving the bounds without interpreting the interval in context",
            "Interpreting the interval as applying to individual bags rather than the population mean"
        ],
        contextFromVideo: "Video 2 computes df = 9, t* = 2.262, margin of error 5.88, and the final interval 900.92 to 912.68 grams."
    },

    exitTicket: {
        questionText: "Wildlife biologists studied a random sample of 40 fiddler crabs of one species. The sample mean feeding rate was 67.65 scoops per 30 seconds, and the sample standard deviation was 6.61 scoops per 30 seconds. (a) Identify the correct confidence interval procedure and explain why the conditions are met. (b) Find the degrees of freedom and the critical value for a 90% confidence interval. (c) Calculate the interval and interpret it in context for the population mean feeding rate.",
        expectedElements: [
            { id: "procedure", description: "Identifies the procedure as a one-sample t-interval for a population mean", required: true },
            { id: "random-sample", description: "States that the crabs came from a random sample", required: true },
            { id: "ten-percent", description: "States that it is reasonable that 40 crabs is no more than 10% of all fiddler crabs of this species", required: true },
            { id: "large-sample", description: "Uses n = 40 to justify the large-sample shape condition", required: true },
            { id: "degrees-freedom", description: "Computes or states df = 39", required: true },
            { id: "critical-value", description: "States the 90% technology critical value t* = 1.685", required: true },
            { id: "formula", description: "Uses x-bar plus or minus t* times s over square root of n", required: true },
            { id: "margin-error", description: "Finds a margin of error of about 1.76", required: true },
            { id: "interval", description: "Gives an interval of about 65.89 to 69.41 scoops per 30 seconds", required: true },
            { id: "context-interpretation", description: "Interprets the interval as a confidence interval for the mean feeding rate of all fiddler crabs of this species", required: true },
            { id: "table-note", description: "May note that Table B would use df = 30 and t* = 1.697 if technology were unavailable", required: false }
        ],
        scoringGuide: {
            E: "Response correctly completes the full confidence-interval process for the crab data and gives a proper contextual interpretation",
            P: "Response includes most of the correct setup and interval work but misses one or two important details or has a weak interpretation",
            I: "Response omits major steps, uses the wrong procedure, or gives an incorrect interval or contextual conclusion"
        },
        commonMistakes: [
            "Using a z interval instead of a t interval",
            "Not using n = 40 to justify the shape condition",
            "Using the wrong degrees of freedom",
            "Forgetting to calculate or report the interval bounds",
            "Not interpreting the interval as the population mean feeding rate"
        ],
        contextFromVideo: "Video 2 uses the fiddler crab example with n = 40, df = 39, t* = 1.685, and the final interval 65.89 to 69.41 scoops per 30 seconds."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L2[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Constructing a Confidence Interval for a Population Mean.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L2}

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
window.getRubricU7L2 = function(questionId) {
    return window.RUBRICS_U7L2[questionId];
};
