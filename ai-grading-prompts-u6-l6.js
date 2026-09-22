/**
 * AI Grading Prompts for Unit 6 Lesson 6: Concluding a Test for a Population Proportion
 * Topic 6.6: Making Conclusions Using Significance Level & p-Values
 *
 * Learning Objectives:
 *   DAT-3.A - Make an appropriate conclusion for a significance test for a population proportion [Skill 4.E]
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L6 = `
VIDEO 1 - Making a Conclusion (~8.5 min):
- Presenter: Josh Tabor
- SIGNIFICANCE LEVEL:
  - The significance level (alpha) is a predetermined boundary value used to determine if a p-value is small or not
  - Common significance levels: alpha = 0.05, alpha = 0.01, alpha = 0.10
- TWO POSSIBLE CONCLUSIONS:
  - If p-value <= alpha: reject H0, there IS convincing statistical evidence for Ha
  - If p-value > alpha: fail to reject H0, there is NOT convincing statistical evidence for Ha
- LEMONADE STUDY CONCLUSION:
  - H0: p = 0.50, Ha: p > 0.50, z = 1.10, p-value = 0.1357, alpha = 0.05
  - "Because the p-value of 0.1357 is greater than alpha = 0.05, we fail to reject H0."
  - "There is not convincing statistical evidence that more than half of all students at this school would choose the green cup."
- CAUTIONS ABOUT CONCLUSIONS:
  - Must explicitly compare p-value to alpha (say "greater than" or "less than")
  - If no alpha is stated, use alpha = 0.05
  - Conclusions must be about the alternative hypothesis
  - Conclusions must be in context
  - "When you fail to reject H0, don't conclude that H0 is true! This is called 'accepting the null hypothesis.' Don't do it!"
  - "When you reject H0, don't say that you have 'proven' that Ha is true."
  - "In AP Statistics, we never prove anything. It's always based on probabilities and there's always a chance of error."
- FOOTBALL STUDY CONCLUSION:
  - H0: p = 0.40, Ha: p != 0.40, p-value = 0.0244, alpha = 0.10
  - "Because the p-value of 0.0244 is less than or equal to alpha = 0.10, we reject H0."
  - "There is convincing statistical evidence that the proportion of all adults in this town who would say that football is their favorite sport differs from 0.40."

VIDEO 2 - Complete Significance Test (~6.5 min):
- Same presenter
- Context: 2005 AP Exam — Breakfast Cereal Vouchers
  - Company claims 20% of boxes have voucher; students think it's less than 0.20
  - 65 boxes purchased, 11 vouchers found
- COMPLETE TEST STEPS:
  1. State hypotheses: H0: p = 0.20, Ha: p < 0.20
  2. Define parameter: p = proportion of all boxes with a voucher
  3. Significance level: alpha = 0.05 (none stated, use most common)
  4. Procedure: one-sample z-test for a proportion
  5. Conditions: Random (reasonable assumption), 10% (assume > 650 boxes), Large Counts (65*0.2=13>=10, 65*0.8=52>=10)
  6. Calculations: p-hat = 11/65 = 0.169, z = -0.62, p-value = P(z <= -0.62) = 0.2676
  7. Conclusion: "Because the p-value of 0.2676 is greater than alpha = 0.05, we fail to reject H0. There is not convincing statistical evidence that the proportion of all boxes of this cereal with vouchers is less than 0.2."
- Common mistake: using p-hat instead of p0 when checking Large Counts condition
- "You do not need to interpret the p-value unless you're specifically asked."
`;

// Rubrics for each reflection question
window.RUBRICS_U6L6 = {
    reflect1: {
        questionText: "A student conducts a significance test and gets a p-value of 0.23 with alpha = 0.05. The student concludes: 'Because the p-value is large, we accept H0 and conclude that the null hypothesis is true.' Identify TWO errors in this conclusion and write a corrected version.",
        expectedElements: [
            { id: "error-accept-h0", description: "Identifies that saying 'accept H0' is wrong — we should say 'fail to reject H0' because failing to find convincing evidence against H0 is not the same as proving it true", required: true },
            { id: "error-h0-true", description: "Identifies that concluding 'H0 is true' is wrong — a large p-value means the data are consistent with H0, but it does not prove H0 is true", required: true },
            { id: "explicit-comparison", description: "Corrected conclusion explicitly compares p-value to alpha (e.g., 'Because the p-value of 0.23 is greater than alpha = 0.05')", required: true },
            { id: "correct-decision", description: "Corrected conclusion says 'we fail to reject H0' (not 'we accept H0')", required: true },
            { id: "ha-in-context", description: "Corrected conclusion states there is NOT convincing statistical evidence for Ha (though context is generic here, the structure should reference Ha)", required: false }
        ],
        scoringGuide: {
            E: "All 4 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Only identifying one of the two errors (accepting H0 vs. concluding H0 is true) — these are related but distinct mistakes",
            "Writing a corrected conclusion that still says 'we accept H0' instead of 'we fail to reject H0'",
            "Forgetting to explicitly compare the p-value to alpha in the corrected conclusion",
            "Saying the conclusion should be about rejecting Ha instead of failing to reject H0",
            "Confusing 'fail to reject H0' with 'reject Ha' — the correct phrasing is always about H0"
        ],
        contextFromVideo: "Josh Tabor emphasizes: 'When you fail to reject H0, don't conclude that H0 is true! This is called accepting the null hypothesis. Don't do it!' He also stresses that 'Conclusions must be justified by explicitly comparing the p-value to the significance level.' A lack of convincing evidence for Ha doesn't prove that H0 is true."
    },

    reflect2: {
        questionText: "Explain why 'failing to reject H0' is different from 'proving H0 is true.' Use the cereal voucher example (where p-hat = 0.169, p-value = 0.2676) to illustrate your explanation.",
        expectedElements: [
            { id: "fail-to-reject-meaning", description: "Explains that failing to reject H0 means the data do not provide convincing evidence AGAINST H0 — the observed result could plausibly have happened by chance if H0 were true", required: true },
            { id: "not-proof", description: "Explains that this does not prove H0 is true — there could still be a real difference, but the sample evidence was not strong enough to detect it", required: true },
            { id: "cereal-example", description: "Uses the cereal example to illustrate: p-hat = 0.169 IS less than 0.20, so there is some evidence the proportion is less, but the difference could be due to random chance (p-value = 0.2676 is too large)", required: false },
            { id: "evidence-vs-proof", description: "Distinguishes between 'lack of convincing evidence' and 'proof' — statistics deals in probabilities, not absolute proof", required: false },
            { id: "plausible-explanation", description: "Notes that a 26.76% chance of getting this result under H0 means it's quite plausible the data happened by random chance alone", required: false }
        ],
        scoringGuide: {
            E: "All 2 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Saying that failing to reject H0 means there is no evidence at all against H0 — there was some evidence (p-hat = 0.169 < 0.20), it just wasn't convincing enough",
            "Saying p-hat = 0.169 proves the proportion is less than 0.20",
            "Not connecting the p-value of 0.2676 to the idea that the result could plausibly have happened by chance",
            "Saying 'we can never prove anything in statistics' without explaining what we CAN conclude (we can have convincing evidence)",
            "Confusing the p-value with the probability that H0 is true"
        ],
        contextFromVideo: "Josh Tabor says: 'We had evidence that it was more than 50%. It was just that the evidence wasn't convincing. A lack of convincing evidence for the alternative doesn't prove that the null is true.' In the cereal example, p-hat = 0.169 is less than 0.2, providing some evidence for Ha, but the p-value of 0.2676 shows this difference could easily be due to random chance."
    },

    exitTicket: {
        questionText: "A local news station claims that 60% of residents support a new park. A city council member suspects the true proportion is less than 0.60. She surveys a random sample of 80 residents and finds that 42 support the new park. (a) State the hypotheses and define the parameter. (b) The conditions have been verified. The test statistic is z = -1.10 and the p-value is 0.1357. Using alpha = 0.05, write a complete conclusion. (c) Would your conclusion change if alpha = 0.20? Explain.",
        expectedElements: [
            { id: "correct-hypotheses", description: "States H0: p = 0.60 and Ha: p < 0.60", required: true },
            { id: "defines-parameter", description: "Defines p as the proportion of all residents who support the new park (or equivalent)", required: true },
            { id: "explicit-comparison-05", description: "Part (b): Explicitly compares p-value of 0.1357 to alpha = 0.05 (e.g., 'Because the p-value of 0.1357 is greater than alpha = 0.05')", required: true },
            { id: "fail-to-reject-05", description: "Part (b): Concludes we fail to reject H0", required: false },
            { id: "conclusion-in-context", description: "Part (b): States there is not convincing statistical evidence that the proportion of all residents who support the new park is less than 0.60", required: true },
            { id: "alpha-20-changes", description: "Part (c): Recognizes that with alpha = 0.20, the conclusion changes because 0.1357 < 0.20, so we would reject H0", required: true },
            { id: "alpha-20-conclusion", description: "Part (c): With alpha = 0.20, states there IS convincing statistical evidence that the proportion is less than 0.60", required: false }
        ],
        scoringGuide: {
            E: "All 5 key elements are present and correct. Any correct wording counts; exact decimals, lesson-specific numbers, and a particular example are not required where the element allows an equivalent.",
            P: "Exactly one key element is missing or wrong; the rest are correct.",
            I: "Two or more key elements are missing or wrong."
        },
        commonMistakes: [
            "Writing Ha: p != 0.60 instead of Ha: p < 0.60 (the council member suspects it is LESS than 0.60)",
            "Forgetting to define the parameter p",
            "Not explicitly comparing the p-value to alpha — just jumping to 'fail to reject'",
            "Saying 'accept H0' instead of 'fail to reject H0'",
            "Thinking the conclusion stays the same for alpha = 0.20 — it changes because 0.1357 < 0.20",
            "Forgetting to state the conclusion about Ha in context (must mention the park and residents)"
        ],
        contextFromVideo: "The video demonstrates two conclusion templates: 'Because the p-value of ___ <= alpha = ___, we reject H0. There is convincing statistical evidence that [Ha in context].' and 'Because the p-value of ___ > alpha = ___, we fail to reject H0. There is not convincing statistical evidence that [Ha in context].' Josh Tabor emphasizes the importance of explicitly comparing the p-value to alpha and making the conclusion about Ha in context."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L6[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Concluding a Test for a Population Proportion.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L6}

KEY ELEMENTS (what a complete answer usually covers):
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

GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

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
window.getRubricU6L6 = function(questionId) {
    return window.RUBRICS_U6L6[questionId];
};
