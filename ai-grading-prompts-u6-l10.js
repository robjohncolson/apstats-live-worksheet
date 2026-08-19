/**
 * AI Grading Prompts for Unit 6 Lesson 10: Setting Up a Test for the Difference of Two Population Proportion
 * Topic 6.10: Setting Up a Test for the Difference of Two Population Proportion
 *
 * Learning Objectives:
 *   VAR-6.H - Identify null and alternative hypotheses for a difference in population proportions
 *   VAR-6.I - Identify an appropriate significance test method for a difference in population proportions
 *   VAR-6.J - Verify conditions for a two-sample z-test for a difference in population proportions
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L10 = `
VIDEO 1 - Stating Null and Alternative Hypotheses (~9 min):
- Presenter: Doug Tyson
- MAIN IDEAS:
  - The lesson focuses on setting up a significance test for a difference in two population proportions
  - The null hypothesis for a difference in proportions is a statement of no difference: H0: p1 = p2 or H0: p1 - p2 = 0
  - The alternative hypothesis always uses a strict inequality: >, <, or !=
  - One-sided alternatives use > or <, while two-sided alternatives use !=
  - The choice of alternative should be based on the research question and stated before data collection
  - Hypotheses must use population parameters, not sample statistics such as p-hat
  - Parameters should always be clearly defined in context
- EYE-DROP EXAMPLE:
  - Clinical trial with pink-eye patients compared azithromycin drops to placebo
  - Data: 82/130 cured with azithromycin and 74/149 cured with placebo
  - Parameter definitions: p1 = true proportion of similar patients cured by azithromycin, p2 = true proportion cured by placebo
  - Null: H0: p1 = p2 (or p1 - p2 = 0)
  - Alternative for the claim "more effective": Ha: p1 > p2 (or p1 - p2 > 0)
- BRIGHT IDEA EXAMPLE:
  - Soltown vs Brightville sunglasses purchasing proportions
  - Prompt asks whether there is a difference, so the alternative is two-sided
  - Null: H0: pS = pB (or pS - pB = 0)
  - Alternative: Ha: pS != pB (or pS - pB != 0)
  - Parameter definitions: pS and pB are true population proportions for residents in each city

VIDEO 2 - Identifying the Procedure and Checking Conditions (~10 min):
- Same presenter
- PROCEDURE:
  - The correct method is a two-sample z-test for a difference in population proportions
  - This applies to two independent random samples or two groups in a randomized experiment
- POOLED PROPORTION:
  - Before expected-count checks, compute the combined (pooled) proportion of successes
  - Formula: p-hat-c = (X1 + X2) / (n1 + n2)
  - Eye-drop example: p-hat-c = (82 + 74) / (130 + 149) = 156/279 = 0.559
- CONDITIONS FOR RANDOM SAMPLES:
  - Two independent random samples
  - If sampling without replacement, each sample must satisfy the 10% condition
  - Expected counts of successes and failures in both groups must be at least 10
  - Use pooled proportion in expected-count calculations: n1*p-hat-c, n1*(1-p-hat-c), n2*p-hat-c, n2*(1-p-hat-c)
- CONDITIONS FOR EXPERIMENTS:
  - Random assignment to two groups
  - Expected successes and failures in both groups must be at least 10 using pooled proportion
- TAKEAWAYS:
  - State hypotheses in parameter form with clear definitions
  - Match one-sided or two-sided alternative to the question
  - Use a two-sample z-test for differences in population proportions
  - Check independence and large counts before inference
`;

// Rubrics for each reflection question
window.RUBRICS_U6L10 = {
    reflect1: {
        questionText: "In the pink-eye eye-drop study, define p1 and p2, then state appropriate null and alternative hypotheses for testing whether azithromycin is more effective than placebo. Explain why the alternative is one-sided.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines p1 and p2 as true population cure proportions for similar patients (azithromycin and placebo groups)", required: true },
            { id: "null-equality", description: "States the null hypothesis as p1 = p2 or p1 - p2 = 0", required: true },
            { id: "alternative-direction", description: "States the alternative as p1 > p2 or p1 - p2 > 0", required: true },
            { id: "one-sided-justification", description: "Explains that one-sided is used because the question asks whether azithromycin is more effective", required: true },
            { id: "parameter-language", description: "Uses population-parameter language rather than just sample outcomes", required: true },
            { id: "no-sample-statistics", description: "Avoids writing hypotheses with sample statistics such as p-hat", required: false }
        ],
        scoringGuide: {
            E: "Response correctly defines parameters, states correct null and one-sided alternative hypotheses, and explains why the direction is greater than",
            P: "Response has the main structure but is incomplete or vague about parameter definitions, direction, or one-sided reasoning",
            I: "Response gives incorrect hypotheses, reverses the direction, or fails to connect hypotheses to the study question"
        },
        commonMistakes: [
            "Using p-hat symbols instead of population parameters",
            "Writing a two-sided alternative when the claim is more effective",
            "Reversing the inequality direction",
            "Leaving parameters undefined",
            "Stating hypotheses about sample counts instead of population proportions"
        ],
        contextFromVideo: "Doug Tyson emphasizes that null hypotheses use equality, alternatives use strict inequalities, and the eye-drop claim 'more effective' leads to a one-sided alternative p1 > p2."
    },

    reflect2: {
        questionText: "For the Soltown vs Brightville sunglasses question, state null and alternative hypotheses in symbols and context. Explain why the alternative should be two-sided and why hypotheses should use parameters, not sample statistics.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines pS and pB as true population proportions of residents in Soltown and Brightville who purchased sunglasses", required: true },
            { id: "null-equality", description: "States the null hypothesis as pS = pB or pS - pB = 0", required: true },
            { id: "two-sided-alternative", description: "States the alternative as pS != pB or pS - pB != 0", required: true },
            { id: "difference-rationale", description: "Explains that two-sided is used because the question asks whether there is a difference without direction", required: true },
            { id: "parameter-not-statistic", description: "Explains that hypotheses should be written using population parameters, not sample statistics", required: true },
            { id: "equivalent-forms", description: "May show both equivalent forms (comparison form and difference-equals-zero form)", required: false }
        ],
        scoringGuide: {
            E: "Response correctly gives two-sided hypotheses with clear parameter definitions and explains why parameter form is required",
            P: "Response gets most components correct but misses context, direction explanation, or parameter-versus-statistic distinction",
            I: "Response uses incorrect hypothesis structure, wrong direction, or does not justify why a two-sided alternative is appropriate"
        },
        commonMistakes: [
            "Using a one-sided alternative even though the question asks for a difference",
            "Failing to define pS and pB",
            "Using sample proportions in hypotheses",
            "Confusing null and alternative roles",
            "Not connecting hypotheses to population context"
        ],
        contextFromVideo: "In the Bright Idea example, the lesson uses Ha: pS != pB because the prompt asks about a difference, not whether one city is specifically higher."
    },

    exitTicket: {
        questionText: "A district compares two reading apps. In random samples, 78 of 120 students using App A met a benchmark, and 66 of 120 students using App B met a benchmark. Assume each sample is less than 10% of its population. The district wants to test whether App A has a higher true success proportion than App B. (a) Define pA and pB, and state H0 and Ha in symbols. (b) Name the appropriate significance test procedure. (c) Compute the pooled proportion and verify the expected-count condition. State whether conditions for this test are met.",
        expectedElements: [
            { id: "parameter-definitions", description: "Defines pA and pB as the true population benchmark-success proportions for students using App A and App B", required: true },
            { id: "null-hypothesis", description: "States H0 as pA = pB or pA - pB = 0", required: true },
            { id: "alternative-hypothesis", description: "States Ha as pA > pB or pA - pB > 0", required: true },
            { id: "procedure-name", description: "Identifies the method as a two-sample z-test for a difference in population proportions", required: true },
            { id: "pooled-proportion", description: "Computes pooled proportion as p-hat-c = (78 + 66)/(120 + 120) = 144/240 = 0.60", required: true },
            { id: "expected-counts", description: "Checks expected counts using pooled proportion: 120(0.60)=72, 120(0.40)=48 for each group, all at least 10", required: true },
            { id: "conditions-conclusion", description: "Concludes conditions are met by noting that the two random samples are from separate app groups and are treated as independent, citing the given 10% condition, and verifying the pooled expected counts", required: true },
            { id: "parameter-focus", description: "Keeps hypotheses in terms of parameters rather than sample statistics", required: false }
        ],
        scoringGuide: {
            E: "Response correctly states hypotheses and procedure, computes pooled proportion and expected counts accurately, and clearly concludes that conditions are met",
            P: "Response includes most major parts but has minor errors or omissions in calculations, condition checks, or hypothesis detail",
            I: "Response has major errors in hypotheses, procedure identification, or condition verification, or omits required components"
        },
        commonMistakes: [
            "Using a two-sided alternative when the claim is that App A is higher",
            "Forgetting to pool successes for expected-count checks",
            "Using incorrect pooled-proportion arithmetic",
            "Checking large counts with separate sample proportions instead of pooled proportion",
            "Not explicitly concluding whether conditions are met"
        ],
        contextFromVideo: "Video 2 stresses using pooled proportion for expected-count checks and verifying independence plus large counts before running a two-sample z-test for a difference in proportions."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L10 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L10[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Setting Up a Test for the Difference of Two Population Proportion.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L10}

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
window.getRubricU6L10 = function(questionId) {
    return window.RUBRICS_U6L10[questionId];
};
