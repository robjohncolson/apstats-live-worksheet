/**
 * AI Grading Prompts for Unit 7 Lesson 4: Setting Up a Test for a Population Mean
 * Topic 7.4: Setting Up a Test for a Population Mean
 *
 * Learning Objectives:
 *   State the null hypothesis for a significance test about a population mean
 *   State the alternative hypothesis that matches the question of interest
 *   Distinguish between one-sided and two-sided alternatives for tests about mu
 *   Identify a one-sample t-test as the correct procedure for testing a single population mean
 *   Check the randomization, 10%, and Nearly Normal conditions for a significance test for a population mean
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U7L4 = `
VIDEO 1 - Stating the Null and Alternative Hypotheses (~7 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - Significance tests are used to test a claim about the value of a population parameter
  - They assess whether evidence supporting a claim is likely or unlikely to happen by chance alone
  - In Unit 7, Topics 7.4 and 7.5 focus on significance tests for a population mean
  - The null hypothesis is typically a statement of no difference or no change
  - For a population mean, the null hypothesis is written with equality: H0: mu = hypothesized value
  - In a significance test, we proceed assuming the null hypothesis is true until the data provide convincing evidence otherwise
  - The alternative hypothesis is the claim we hope to support with evidence from the data
  - The alternative uses a strict inequality: mu < value, mu > value, or mu != value
  - A less-than or greater-than alternative is one-sided; a not-equal alternative is two-sided
  - The form of the alternative is determined by the research question and should be stated before data are collected
  - Hypotheses should use the population parameter mu, not sample statistics like x-bar
- GOT HOPS EXAMPLE:
  - Claim from the internet: average vertical jump for teens is 15 inches
  - Sample: 20 students from one large high school, x-bar = 15.8 inches, s = 2.33 inches
  - Question: does the average vertical jump for all students at this school differ from 15 inches?
  - Parameter: mu = mean vertical jump for all students at this high school
  - Null hypothesis: H0: mu = 15 inches
  - Alternative hypothesis: Ha: mu != 15 inches
  - This is a two-sided alternative because the question asks whether the mean differs from 15
- TREAD40 TIRES EXAMPLE:
  - A tire manufacturer wants to know whether Tread40 tires last more than 40,000 miles on average
  - Sample: 35 tires, x-bar = 42,348 miles, s = 2,140 miles
  - Parameter: mu = mean mileage for all Tread40 tires
  - Null hypothesis: H0: mu = 40,000 miles
  - Alternative hypothesis: Ha: mu > 40,000 miles
  - This is a one-sided alternative because the question asks whether the mean is greater than 40,000 miles

VIDEO 2 - Identifying the Procedure and Checking Conditions (~5 min):
- MAIN IDEAS:
  - When testing a claim about a population mean, the correct procedure is a one-sample t-test for a population mean
  - The conditions for a one-sample t-test match the conditions used for a one-sample t-interval for a population mean
  - Check independence by confirming the data come from a random sample or randomized experiment
  - If sampling without replacement, verify that the sample size is less than 10% of the population size
  - For shape, either the sample size is at least 30 or, if n < 30, the sample data show no strong skewness or outliers
  - If n < 30, you should actually display a graph of the sample data as evidence
- GOT HOPS CONDITIONS:
  - The 20 students were randomly selected
  - In a large high school, 20 is reasonably less than 10% of all students
  - Because n = 20 is less than 30, a graph of the sample data is needed
  - The graph showed no outliers or strong skewness
  - Therefore the conditions for the one-sample t-test were met
- LONG LIVE THE TABLET COUNTEREXAMPLE:
  - CB Tablets claims average battery life is 14 hours
  - A consumer group wonders whether average battery life is shorter than 14 hours
  - In the sample of 10 tablets, there was no indication the tablets were randomly selected
  - A dotplot showed strong skewness and a potential outlier
  - Therefore the conditions for inference were not met in that example
`;

// Rubrics for each reflection question
window.RUBRICS_U7L4 = {
    reflect1: {
        questionText: "Using the Got Hops and Tread40 tire examples, explain how to state the null and alternative hypotheses for a test about a population mean. Include why the null uses equality, why the alternative uses an inequality, how the question determines whether the test is one-sided or two-sided, and what mu means in each context.",
        expectedElements: [
            { id: "got-hops-parameter", description: "Defines mu for Got Hops as the mean vertical jump for all students at the high school", required: true },
            { id: "got-hops-null", description: "States the Got Hops null hypothesis as H0: mu = 15 inches", required: true },
            { id: "got-hops-alt", description: "States the Got Hops alternative hypothesis as Ha: mu != 15 inches because the question asks whether the mean differs from 15", required: true },
            { id: "null-equality", description: "Explains that the null hypothesis uses equality and represents no difference or no change", required: true },
            { id: "alt-inequality", description: "Explains that the alternative hypothesis uses a strict inequality and represents the claim the data are meant to support", required: true },
            { id: "two-sided", description: "Identifies the Got Hops test as two-sided because the question asks whether the mean differs", required: true },
            { id: "tread40-parameter", description: "Defines mu for Tread40 as the mean mileage for all Tread40 tires", required: true },
            { id: "tread40-hypotheses", description: "States H0: mu = 40000 and Ha: mu > 40000 for the tire example", required: true },
            { id: "one-sided", description: "Explains that the tire test is one-sided because the question asks whether the mean is more than 40000 miles", required: true },
            { id: "no-xbar", description: "May note that hypotheses should use mu rather than x-bar", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states and explains the null and alternative hypotheses for both examples, including parameter definitions and one-sided versus two-sided logic",
            P: "Response shows the main hypothesis structure but omits part of one example, weakly explains the sidedness, or leaves out parameter context",
            I: "Response misstates the hypotheses, uses sample statistics in place of mu, or confuses when to use one-sided versus two-sided alternatives"
        },
        commonMistakes: [
            "Writing x-bar instead of mu in the hypotheses",
            "Using an equals sign in the alternative hypothesis",
            "Calling the Got Hops test one-sided even though the question asks whether the mean differs",
            "Using Ha: mu != 40000 for the tire example instead of Ha: mu > 40000",
            "Failing to define the population mean in context"
        ],
        contextFromVideo: "Video 1 uses Got Hops to model a two-sided test and the Tread40 example to model a one-sided greater-than test."
    },

    reflect2: {
        questionText: "Explain how to identify the correct procedure and check the conditions for a significance test for a population mean. Use the vertical jump example and the tablet example to show the difference between a situation where the conditions are met and one where they are not.",
        expectedElements: [
            { id: "procedure", description: "Identifies the correct procedure as a one-sample t-test for a population mean", required: true },
            { id: "why-procedure", description: "Explains that this procedure is used when testing a claim about one population mean from one sample of quantitative data", required: true },
            { id: "random-condition", description: "States that the data should come from a random sample or randomized experiment", required: true },
            { id: "ten-percent", description: "States that if sampling without replacement, the sample size should be less than 10% of the population", required: true },
            { id: "shape-condition", description: "States that either n is at least 30 or, if n is smaller, the sample data should show no strong skewness or outliers", required: true },
            { id: "graph-needed", description: "Explains that when n is less than 30, a graph of the sample data should be shown as evidence", required: true },
            { id: "jump-example", description: "Uses the vertical jump example to say the conditions were met because the sample was random, 20 is less than 10% of the school, and the graph showed no strong skewness or outliers", required: true },
            { id: "tablet-example", description: "Uses the tablet example to say the conditions were not met because there was no random sample and the dotplot showed strong skewness with a potential outlier", required: true }
        ],
        scoringGuide: {
            E: "Response correctly identifies the one-sample t-test and clearly explains the conditions, using both examples accurately to contrast met versus unmet conditions",
            P: "Response gets the basic procedure and most conditions right but leaves out an important condition or does not fully explain one of the examples",
            I: "Response names the wrong procedure, gives incorrect conditions, or fails to distinguish the valid and invalid examples"
        },
        commonMistakes: [
            "Naming a z-test instead of a one-sample t-test",
            "Forgetting the 10% condition when sampling without replacement",
            "Saying a graph is optional for small samples",
            "Claiming the tablet example meets the conditions",
            "Ignoring the role of strong skewness or outliers"
        ],
        contextFromVideo: "Video 2 first states the one-sample t-test procedure, then checks conditions with the vertical jump data and contrasts that with the tablet counterexample."
    },

    exitTicket: {
        questionText: "A tire manufacturer wants to test whether Tread40 tires last more than 40,000 miles on average. A random sample of 35 tires had a sample mean of 42,348 miles and a sample standard deviation of 2,140 miles. (a) Define the parameter and state the null and alternative hypotheses in symbols and words. (b) Identify the correct significance test procedure and explain why the conditions are reasonable. (c) Explain why this is a one-sided test and why x-bar should not appear in the hypotheses.",
        expectedElements: [
            { id: "parameter", description: "Defines mu as the mean mileage for all Tread40 tires", required: true },
            { id: "null", description: "States the null hypothesis as H0: mu = 40000 miles", required: true },
            { id: "alternative", description: "States the alternative hypothesis as Ha: mu > 40000 miles", required: true },
            { id: "procedure", description: "Identifies the procedure as a one-sample t-test for a population mean", required: true },
            { id: "random", description: "Uses the fact that the data came from a random sample of 35 tires", required: true },
            { id: "ten-percent", description: "States that 35 is reasonably less than 10% of all Tread40 tires", required: true },
            { id: "large-sample", description: "Explains that n = 35 is at least 30, so the large-sample condition for shape is satisfied", required: true },
            { id: "one-sided", description: "Explains that the test is one-sided because the question asks whether the mean is more than 40000 miles", required: true },
            { id: "no-xbar", description: "Explains that x-bar should not appear because hypotheses are about the population parameter mu, not the sample statistic", required: true }
        ],
        scoringGuide: {
            E: "Response correctly sets up the full test for the tire example, including hypotheses, procedure, conditions, sidedness, and the parameter-versus-statistic distinction",
            P: "Response includes most of the correct setup but misses one important detail or gives only a partial explanation of the conditions or sidedness",
            I: "Response gives incorrect hypotheses, names the wrong procedure, or misunderstands why the test is one-sided and why mu should be used"
        },
        commonMistakes: [
            "Using Ha: mu != 40000 instead of Ha: mu > 40000",
            "Writing x-bar = 40000 in the null hypothesis",
            "Omitting the large-sample condition from n = 35",
            "Forgetting to justify the 10% condition",
            "Calling the test two-sided even though the question asks whether the mean is greater than 40000"
        ],
        contextFromVideo: "Video 1 introduces the Tread40 hypotheses and Video 2 provides the general condition checks needed to justify using the one-sample t-test."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU7L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U7L4[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Test for a Population Mean.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U7L4}

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
window.getRubricU7L4 = function(questionId) {
    return window.RUBRICS_U7L4[questionId];
};
