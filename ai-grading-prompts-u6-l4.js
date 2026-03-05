/**
 * AI Grading Prompts for Unit 6 Lesson 4: Setting Up a Test for a Population Proportion
 * Topic 6.4: Hypotheses, Procedure, and Conditions for a One-Sample z-Test
 *
 * Learning Objectives:
 *   VAR-6.D - Identify null and alternative hypotheses for a population proportion [Skill 1.F]
 *   VAR-6.E - Identify an appropriate testing method for a population proportion [Skill 1.E]
 *   VAR-6.F - Verify the conditions for making statistical inferences when testing a population proportion [Skill 4.C]
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L4 = `
VIDEO 1 - Setting Up a Test for a Population Proportion: Stating Hypotheses (~8.5 min):
- Presenter: Josh Tabor
- Context: "Does Green = More Natural?" study
  - 30 students randomly selected, each tasted lemonade from a green cup and a white cup
  - Both cups contained the same lemonade; 18 of 30 chose the green cup as "more natural"
- NULL HYPOTHESIS (H0):
  - Claim of "no difference" or "no change"
  - Written symbolically: H0: p = 0.50
  - Always contains an equality (=)
  - Assumed correct until convincing evidence otherwise
- ALTERNATIVE HYPOTHESIS (Ha):
  - Claim researchers hope to support with data
  - For lemonade study: Ha: p > 0.50 (one-sided, because researchers expect MORE than 50%)
  - Three forms: p > p0, p < p0, or p ≠ p0
  - One-sided: < or > (evidence on one side only)
  - Two-sided: ≠ (evidence on either side)
- IMPORTANT RULES:
  - Alternative should be stated BEFORE data collection
  - Never use p-hat in hypotheses — hypotheses are about the POPULATION, not the sample
  - Always define the parameter in context (e.g., "p = proportion of ALL students at the school who would choose the green cup")
  - Use "would" language for parameters (not "said" which refers to the sample)
- PRACTICE: Mayor investigating if proportion of adults whose favorite sport is football differs from 40%
  - H0: p = 0.40, Ha: p ≠ 0.40 (two-sided because "differs from")
  - p = proportion of all adults in the town who would say football is their favorite sport

VIDEO 2 - Setting Up a Test: Identifying Procedure & Checking Conditions (~7.5 min):
- Same presenter and context
- IDENTIFYING THE PROCEDURE:
  - When testing a claim about proportion of successes in a single population → one-sample z-test for a population proportion
  - Similar name to confidence interval procedure (one-sample z-interval) but different purpose
- CONDITIONS FOR ONE-SAMPLE Z-TEST:
  1. Random: Data collected from a random sample from the population of interest
  2. 10% Rule: When sampling without replacement, n ≤ 10% of N (population size)
     - Often must assume this is reasonable when population size isn't given
  3. Large Counts: np0 ≥ 10 AND n(1-p0) ≥ 10
     - Uses the NULL HYPOTHESIS value p0 (NOT p-hat like confidence intervals)
     - This is because in a significance test, we assume H0 is true
     - These are EXPECTED counts under H0, not observed counts
- LEMONADE EXAMPLE CONDITIONS CHECK:
  1. Random: Students were randomly selected ✓
  2. 10% Rule: 30 ≤ 10% of all students (assume school has > 300 students) ✓
  3. Large Counts: 30(0.5) = 15 ≥ 10 ✓ and 30(1-0.5) = 15 ≥ 10 ✓
- PRACTICE CONDITIONS CHECK (football/mayor):
  1. Random: Mayor selects a random sample ✓
  2. 10% Rule: 100 ≤ 10% of adults in town (assume > 1000) ✓
  3. Large Counts: 100(0.4) = 40 ≥ 10 ✓ and 100(0.6) = 60 ≥ 10 ✓
`;

// Rubrics for each reflection question
window.RUBRICS_U6L4 = {
    reflect1: {
        questionText: "A student writes: 'H0: p-hat = 0.50' and 'Ha: p-hat > 0.50'. Identify TWO errors in these hypotheses and explain why each matters. Then write the corrected hypotheses with a proper parameter definition.",
        expectedElements: [
            { id: "error-phat-not-p", description: "Identifies that hypotheses should use the population parameter p, not the sample statistic p-hat", required: true },
            { id: "why-parameter-matters", description: "Explains that hypotheses are claims about the population, not the sample — using p-hat would make it about one specific sample", required: true },
            { id: "corrected-hypotheses", description: "Writes corrected hypotheses: H0: p = 0.50 and Ha: p > 0.50", required: true },
            { id: "defines-parameter", description: "Defines p in context (e.g., 'p = proportion of all students at the school who would choose the green cup')", required: true },
            { id: "would-vs-said", description: "Uses 'would' language in the parameter definition to indicate the population, not 'said' or 'did' which refer to the sample", required: false }
        ],
        scoringGuide: {
            E: "Response identifies both the p-hat error (should be p) and explains why parameters matter, writes corrected hypotheses, and defines the parameter in context",
            P: "Response identifies the p-hat error but explanation is incomplete, or corrects hypotheses without defining the parameter, or misses one key element",
            I: "Response does not identify the p-hat error, or shows fundamental misunderstanding of the difference between parameters and statistics in hypotheses"
        },
        commonMistakes: [
            "Only identifying one error instead of two",
            "Saying p-hat is wrong without explaining WHY hypotheses use parameters",
            "Correcting the notation but forgetting to define the parameter",
            "Using 'said' or 'chose' instead of 'would say' or 'would choose' when defining the parameter"
        ],
        contextFromVideo: "Josh Tabor explicitly warns: 'Never include a statistic, such as p-hat, in the hypotheses. This is a really common error. Make sure your hypotheses are claims about the population, not about the sample.' He also stresses: 'make sure you always define the parameter' and use 'would' language to refer to the population."
    },

    reflect2: {
        questionText: "When checking the Large Counts condition for a significance test, we use np0 and n(1-p0) instead of n*p-hat and n*(1-p-hat) like we did for confidence intervals. Explain WHY we use p0 (the null hypothesis value) for significance tests. What assumption makes this the right choice?",
        expectedElements: [
            { id: "assume-h0-true", description: "States that in a significance test, we START by assuming the null hypothesis is true", required: true },
            { id: "p0-is-assumed-value", description: "Explains that p0 is the value we assume to be true under H0, so we use it to check if the sampling distribution is approximately normal", required: true },
            { id: "expected-not-observed", description: "Distinguishes between expected counts under H0 (np0) and observed counts from the sample (n*p-hat)", required: true },
            { id: "ci-comparison", description: "Notes that confidence intervals use p-hat because there is no hypothesized value — we're estimating the parameter, not testing a claim about it", required: false },
            { id: "se-connection", description: "Connects to the fact that the standard error in the test also uses p0, not p-hat", required: false }
        ],
        scoringGuide: {
            E: "Response clearly explains that significance tests assume H0 is true, that p0 is therefore the appropriate value for checking conditions, and distinguishes expected counts from observed counts",
            P: "Response mentions assuming H0 is true but doesn't clearly explain why that leads to using p0, or doesn't distinguish expected from observed counts",
            I: "Response shows fundamental misunderstanding — thinks p-hat and p0 are interchangeable, or doesn't connect the condition check to the assumption of H0"
        },
        commonMistakes: [
            "Thinking p0 and p-hat are the same thing",
            "Not understanding that significance tests assume H0 is true from the start",
            "Confusing when to use p0 vs p-hat (tests vs intervals)",
            "Thinking the conditions are the same for both procedures"
        ],
        contextFromVideo: "Josh Tabor says: 'Remember, when we're doing a significance test, we always start by assuming the null hypothesis is true. So we use that null hypothesis value p0 in our check of the conditions.' He notes: 'condition three differs for confidence intervals and significance tests' and that 'we're not using the observed successes and failures from the sample. We're using the expected number of successes and failures if the null hypothesis were true.'"
    },

    exitTicket: {
        questionText: "A company claims that 80% of customers are satisfied with their product. A consumer group suspects the true proportion is lower. They survey a random sample of 60 customers and find that 42 are satisfied. (a) State the null and alternative hypotheses, defining the parameter. (b) Name the appropriate procedure. (c) Check all three conditions for performing this test.",
        expectedElements: [
            { id: "correct-h0", description: "States H0: p = 0.80", required: true },
            { id: "correct-ha", description: "States Ha: p < 0.80 (one-sided, lower, because they suspect it's LOWER)", required: true },
            { id: "defines-p", description: "Defines p as the proportion of all customers who are satisfied (population parameter with 'would' language or equivalent)", required: true },
            { id: "names-procedure", description: "Names the procedure as a one-sample z-test for a population proportion", required: true },
            { id: "checks-random", description: "Checks Random: data collected from a random sample", required: true },
            { id: "checks-10pct", description: "Checks 10% Rule: 60 ≤ 10% of all customers (assumes company has > 600 customers)", required: true },
            { id: "checks-large-counts", description: "Checks Large Counts using p0 = 0.80: np0 = 60(0.80) = 48 ≥ 10 and n(1-p0) = 60(0.20) = 12 ≥ 10", required: true },
            { id: "uses-p0-not-phat", description: "Uses p0 = 0.80 (not p-hat = 42/60 = 0.70) for the Large Counts check", required: true }
        ],
        scoringGuide: {
            E: "Response correctly states hypotheses (with Ha: p < 0.80), defines p, names the one-sample z-test, and checks all three conditions using p0 = 0.80 for Large Counts",
            P: "Response has most elements correct but makes one error (e.g., uses p-hat instead of p0 for Large Counts, writes two-sided instead of one-sided, or skips defining the parameter)",
            I: "Response has multiple errors — wrong hypotheses direction, missing condition checks, uses p-hat instead of p0, or doesn't name the procedure"
        },
        commonMistakes: [
            "Writing Ha: p > 0.80 instead of Ha: p < 0.80 (misreading 'suspects it's lower')",
            "Writing Ha: p ≠ 0.80 (two-sided when the question clearly indicates one-sided)",
            "Using p-hat = 42/60 = 0.70 instead of p0 = 0.80 for the Large Counts condition",
            "Forgetting to define the parameter p",
            "Not naming the specific procedure (one-sample z-test for a population proportion)",
            "Using p-hat in the hypotheses instead of p"
        ],
        contextFromVideo: "Both videos demonstrate the full setup process: Video 1 shows how to write hypotheses (one-sided vs two-sided based on the research question, always using p not p-hat, always defining the parameter). Video 2 shows the three conditions and emphasizes using p0 (not p-hat) for the Large Counts condition because 'we always start by assuming the null hypothesis is true.'"
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L4[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Test for a Population Proportion.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L4}

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
window.getRubricU6L4 = function(questionId) {
    return window.RUBRICS_U6L4[questionId];
};
