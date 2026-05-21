/**
 * AI Grading Prompts for Unit 6 Lesson 7: Potential Errors When Performing Tests
 * Topic 6.7: Type I Error, Type II Error, and Power
 *
 * Learning Objectives:
 *   DAT-3.B - Identify and interpret Type I and Type II errors in context
 *   DAT-3.C - Explain power and factors that affect error probabilities in significance testing
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L7 = `
VIDEO 1 - Type I and Type II Errors (~6 min):
- Presenter: Josh Tabor
- MAIN IDEAS:
  - There are two possible conclusions in a significance test:
    - If p-value <= alpha: reject H0, there IS convincing statistical evidence for Ha
    - If p-value > alpha: fail to reject H0, there is NOT convincing statistical evidence for Ha
  - A Type I error occurs when the null hypothesis is true and is rejected
  - Type I error is also called a false positive
  - A Type II error occurs when the null hypothesis is false and is not rejected
  - Type II error is also called a false negative
- DECISION TABLE:
  - Reject H0 when H0 is true -> Type I error
  - Reject H0 when Ha is true -> correct decision
  - Fail to reject H0 when H0 is true -> correct decision
  - Fail to reject H0 when Ha is true -> Type II error
- GREEN CUP / LEMONADE EXAMPLE:
  - H0: p = 0.50, Ha: p > 0.50
  - p = proportion of all students at the school who would choose the green cup
  - Type I error in context: conclude that more than 50% of students would choose the green cup when the actual percentage is 50%
  - Type II error in context: fail to find convincing evidence that more than 50% would choose the green cup when the actual percentage is actually more than 50%
  - In this marketing context, Type II was more consequential because it could lead to not using green when it actually helps, causing lost sales or reduced income
- INTERPRETATION RULE:
  - You must fill in the alternative in context; don't just say "the alternative"

VIDEO 2 - Power and Error Probabilities (~8 min):
- Same presenter
- TYPE I ERROR PROBABILITY:
  - When H0 is true, the probability of a Type I error equals the significance level
  - P(Type I error) = alpha
  - Because alpha is the probability of a Type I error, the consequences of a Type I error should influence the choice of alpha
  - All other things being equal, decreasing the probability of a Type I error increases the probability of a Type II error
- POWER:
  - Power is the probability that a test will correctly reject a false null hypothesis
  - Power is the probability of finding convincing evidence for Ha when Ha is actually true
  - P(Type II error) = 1 - power
- GREEN CUP POWER EXAMPLE:
  - Suppose alpha = 0.05 and power against the alternative p = 0.64 is 0.45
  - Interpretation: If the true proportion who would choose the green cup is 0.64, then there is a 0.45 probability of finding convincing evidence that more than 50% of students would choose the green cup
  - P(Type I error) = 0.05
  - P(Type II error) = 1 - 0.45 = 0.55
- FACTORS THAT INCREASE POWER:
  - Larger sample size
  - Larger significance level alpha
  - Smaller standard error
  - True parameter value farther from the null
`;

// Rubrics for each reflection question
window.RUBRICS_U6L7 = {
    reflect1: {
        questionText: "A school cafeteria manager tests H0: p = 0.50 versus Ha: p > 0.50, where p is the proportion of students who would prefer a new lunch option. Describe a Type I error and a Type II error in context. Then explain which error would be more consequential and why.",
        expectedElements: [
            { id: "type1-context", description: "Describes a Type I error in context: concluding that more than 50% of students prefer the new lunch option when the true proportion is actually 0.50", required: true },
            { id: "type2-context", description: "Describes a Type II error in context: failing to find convincing evidence that more than 50% prefer the new lunch option when the true proportion really is greater than 0.50", required: true },
            { id: "uses-context", description: "States the errors in the actual lunch-option context rather than only giving abstract definitions", required: true },
            { id: "consequential-choice", description: "Identifies which error is more consequential in this context and gives a reasonable justification tied to real consequences", required: true },
            { id: "ha-language", description: "Frames the conclusion around the alternative hypothesis being true or not supported, not around 'proving' hypotheses", required: false }
        ],
        scoringGuide: {
            E: "Response correctly describes both Type I and Type II errors in the lunch context and gives a clear, context-based explanation of which error is more consequential",
            P: "Response correctly describes only one error, or describes both errors but one is vague or not fully in context, or the consequentiality explanation is weak",
            I: "Response confuses Type I and Type II errors, gives only abstract definitions with no context, or does not explain the consequence question meaningfully"
        },
        commonMistakes: [
            "Swapping the two errors so Type I is described as failing to reject H0 or Type II is described as rejecting a true H0",
            "Forgetting that the null value here is p = 0.50, so a Type I error means the true proportion is exactly 0.50",
            "Writing generic definitions without describing the lunch preference scenario",
            "Saying an error is more consequential without explaining the practical impact",
            "Claiming one error is always more consequential in every context"
        ],
        contextFromVideo: "Josh Tabor emphasizes that Type I means finding convincing evidence for Ha when H0 is actually true, while Type II means failing to find convincing evidence for Ha when Ha is actually true. In the green-cup marketing example, the more consequential error depended on the real-world consequences, not on a fixed rule."
    },

    reflect2: {
        questionText: "A significance test uses alpha = 0.05 and has power = 0.80 against the alternative that p = 0.64 in the green-cup study. Explain what this power means in context, find the probability of a Type II error, and name one change that would increase the power of the test.",
        expectedElements: [
            { id: "power-meaning", description: "Explains in context that if the true proportion who would choose the green cup is 0.64, there is an 0.80 probability of finding convincing evidence that more than 50% of students would choose the green cup", required: true },
            { id: "beta-value", description: "Finds the probability of a Type II error as 1 - 0.80 = 0.20", required: true },
            { id: "increase-power", description: "Names at least one valid way to increase power, such as increasing sample size, increasing alpha, or decreasing standard error", required: true },
            { id: "not-h0-probability", description: "Does not confuse power with the probability that H0 is false or the probability that the study is correct", required: true },
            { id: "factor-explanation", description: "Briefly explains why the named change increases the chance of rejecting a false H0", required: false }
        ],
        scoringGuide: {
            E: "Response correctly interprets power in context, computes the Type II error probability as 0.20, and gives at least one valid way to increase power",
            P: "Response gets most of the idea but misses one part, such as giving the right context for power but not finding beta correctly, or finding beta but naming an invalid factor",
            I: "Response confuses the meaning of power, gives the wrong Type II error probability, or does not identify a valid way to increase power"
        },
        commonMistakes: [
            "Saying power is the probability that H0 is false",
            "Saying the Type II error probability is the same as power instead of 1 minus power",
            "Interpreting power without mentioning the specific true value p = 0.64",
            "Listing a factor that does not increase power",
            "Forgetting to connect the interpretation to finding convincing evidence for more than 50%"
        ],
        contextFromVideo: "The video states that power is the probability that a test will correctly reject a false null hypothesis, and in the green-cup example the interpretation must mention the specific true proportion and the chance of finding convincing evidence for Ha. Josh Tabor also lists larger sample size, larger alpha, smaller standard error, and a true value farther from the null as ways power can increase."
    },

    exitTicket: {
        questionText: "A fitness app claims that 40% of high school students exercise at least 5 days per week. A researcher suspects the true proportion is higher. Let p be the proportion of all high school students who exercise at least 5 days per week. A significance test is performed with alpha = 0.01, and the power against a true value of p = 0.55 is 0.70. (a) State H0 and Ha. Then describe a Type I error and a Type II error in context. (b) Interpret the power in context, and find the probability of a Type I error and the probability of a Type II error. (c) Give two changes that would increase the power of this test, and briefly explain why each change helps.",
        expectedElements: [
            { id: "correct-hypotheses", description: "States H0: p = 0.40 and Ha: p > 0.40", required: true },
            { id: "type1-context", description: "Describes a Type I error in context: concluding that more than 40% of high school students exercise at least 5 days per week when the true proportion is actually 0.40", required: true },
            { id: "type2-context", description: "Describes a Type II error in context: failing to find convincing evidence that more than 40% exercise at least 5 days per week when the true proportion really is greater than 0.40", required: true },
            { id: "power-interpretation", description: "Interprets the power in context: if the true proportion is 0.55, there is a 0.70 probability of finding convincing evidence that more than 40% exercise at least 5 days per week", required: true },
            { id: "type1-probability", description: "Finds the probability of a Type I error as alpha = 0.01", required: true },
            { id: "type2-probability", description: "Finds the probability of a Type II error as 1 - 0.70 = 0.30", required: true },
            { id: "two-power-factors", description: "Gives two valid changes that would increase power, such as increasing sample size, increasing alpha, decreasing standard error, or having the true parameter farther from the null, with brief explanation", required: true }
        ],
        scoringGuide: {
            E: "Response correctly states the hypotheses, describes both errors in context, interprets the given power, finds both error probabilities, and gives two valid ways to increase power with explanation",
            P: "Response has most core ideas correct but misses one meaningful component, such as one error description, one probability, or one of the power-increasing changes",
            I: "Response has multiple conceptual errors, such as wrong hypotheses, confused Type I/Type II descriptions, incorrect power interpretation, or missing the error probabilities"
        },
        commonMistakes: [
            "Writing Ha: p != 0.40 instead of Ha: p > 0.40",
            "Describing Type I and Type II errors without using the exercise context",
            "Saying the probability of a Type II error is 0.70 instead of 0.30",
            "Interpreting power without mentioning the specific true proportion p = 0.55",
            "Giving only one factor that increases power when the question asks for two",
            "Naming a change without explaining how it makes rejecting a false H0 more likely"
        ],
        contextFromVideo: "The lesson explains that P(Type I error) = alpha, P(Type II error) = 1 minus power, and power must be interpreted for a specific true parameter value. The same video also lists four factors that increase power: larger sample size, larger alpha, smaller standard error, and a true parameter value farther from the null."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L7 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L7[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Potential Errors When Performing Tests.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L7}

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
window.getRubricU6L7 = function(questionId) {
    return window.RUBRICS_U6L7[questionId];
};
