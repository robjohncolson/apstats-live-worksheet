/**
 * AI Grading Prompts for Unit 6 Lesson 5: Interpreting p-Values
 * Topic 6.5: Calculating Test Statistics, Calculating & Interpreting p-Values
 *
 * Learning Objectives:
 *   VAR-6.G - Calculate a test statistic for a test about a population proportion [Skill 4.D]
 *   VAR-6.H - Calculate a p-value for a test about a population proportion [Skill 4.D]
 *   VAR-6.I - Interpret the p-value of a significance test for a population proportion [Skill 4.E]
 */

// Lesson context from video transcript for AI grading
window.LESSON_CONTEXT_U6L5 = `
VIDEO 1 - Calculating a Test Statistic & p-Value (~9.5 min):
- Presenter: Josh Tabor
- Context: Same "Does Green = More Natural?" lemonade study from 6.4
  - 30 students randomly selected; 18 of 30 chose the green cup
  - H0: p = 0.50, Ha: p > 0.50 (one-sided)
  - Conditions were verified in previous lesson
- STANDARDIZED TEST STATISTIC:
  - General form: (statistic - null value) / standard deviation of statistic
  - For a proportion: z = (p-hat - p0) / sqrt(p0(1-p0)/n)
  - Uses p0 (not p-hat) in the denominator because we assume H0 is true
  - Lemonade example: z = (0.60 - 0.50) / sqrt(0.50*0.50/30) = 1.10
  - "A proportion of 0.6 is only about 1.1 standard deviations greater than the mean. Not that unusual."
- FORMULA SHEET:
  - Standardized test statistic = (statistic - parameter) / standard error of the statistic
  - For p-hat: standard deviation uses p(1-p)/n; standard error uses p-hat(1-p-hat)/n
  - For a significance test, use the standard deviation formula with p0 as the true value
- P-VALUE CALCULATION:
  - The p-value is the proportion of values in the null distribution that are as extreme or more extreme than the observed test statistic in the direction of the alternative
  - One-sided (Ha: p > p0): P(z >= observed z) — area in the right tail
  - One-sided (Ha: p < p0): P(z <= observed z) — area in the left tail
  - Two-sided (Ha: p != p0): 2 * P(z >= |observed z|) — area in both tails
  - Lemonade: P(z >= 1.10) = 0.1357
- PRACTICE — Football study:
  - H0: p = 0.40, Ha: p != 0.40 (two-sided)
  - p-hat = 29/100 = 0.29
  - z = (0.29 - 0.40) / sqrt(0.40*0.60/100) = -2.25
  - Two-sided p-value: P(z <= -2.25) + P(z >= 2.25) = 0.0122 + 0.0122 = 0.0244
  - "When Ha is not-equal-to, we need to find area in both tails"

VIDEO 2 - Interpreting p-Values (~5.5 min):
- Same presenter and contexts
- P-VALUE INTERPRETATION:
  - A p-value measures how likely it is to get evidence for Ha as strong as or stronger than the observed evidence by chance alone when H0 is true
  - Think of a p-value as a conditional probability, where the condition is that H0 is true
  - Three required elements in interpretation:
    1. Statement that H0 is true (the "assuming" clause)
    2. Probability of getting a result as extreme as or more extreme than observed
    3. "By chance alone"
- LEMONADE INTERPRETATION:
  "Assuming that 50% of all students at this school would choose the green cup, there is a 0.1357 probability of getting a sample proportion of 0.60 or greater by chance alone in a random sample of 30 students from this school."
- FOOTBALL INTERPRETATION:
  "Assuming that 40% of all adults in the town would say that football is their favorite sport, there is a 0.0244 probability of getting a sample proportion as extreme as or more extreme than 0.29 in either direction by chance alone in a random sample of 100 adults in this town."
  - For two-sided tests: say "in either direction" because evidence on either side supports Ha
- COMMON MISINTERPRETATION:
  - WRONG: "There is a 13.57% probability that H0 is true"
  - The p-value is NOT the probability that H0 is true — it assumes H0 IS true and measures how surprising the data would be under that assumption
`;

// Rubrics for each reflection question
window.RUBRICS_U6L5 = {
    reflect1: {
        questionText: "In the lemonade study, the p-value was 0.1357. A student says: 'There is a 13.57% probability that H0 is true.' Explain what is wrong with this interpretation and provide a correct interpretation of the p-value.",
        expectedElements: [
            { id: "identifies-error", description: "Identifies that the p-value is NOT the probability that H0 is true — this is a fundamental misinterpretation", required: true },
            { id: "assumes-h0-true", description: "Explains that the p-value assumes H0 IS true from the start (it is a conditional probability given H0 is true)", required: true },
            { id: "correct-interpretation", description: "Provides a correct interpretation: assuming 50% of all students would choose the green cup, there is a 0.1357 probability of getting a sample proportion of 0.60 or greater by chance alone in a random sample of 30 students", required: true },
            { id: "as-extreme-or-more", description: "Uses 'as extreme as or more extreme' or 'or greater' language (not just 'exactly 0.60')", required: true },
            { id: "by-chance-alone", description: "Includes the phrase 'by chance alone' in the interpretation", required: false }
        ],
        scoringGuide: {
            E: "Response clearly identifies why 'probability that H0 is true' is wrong, explains that the p-value assumes H0 is true, and provides a correct contextual interpretation with 'or greater' and 'by chance alone'",
            P: "Response identifies the error but gives an incomplete correct interpretation (missing one element such as 'or greater,' 'by chance alone,' or the assumption clause)",
            I: "Response does not identify the fundamental misinterpretation, or provides a 'corrected' interpretation that is also incorrect"
        },
        commonMistakes: [
            "Saying the p-value is the probability of the alternative hypothesis being true",
            "Giving a correct interpretation but forgetting to explain WHY the student's version is wrong",
            "Writing 'probability of getting exactly 0.60' instead of '0.60 or greater'",
            "Omitting the assumption that H0 is true from the interpretation",
            "Omitting 'by chance alone' from the interpretation"
        ],
        contextFromVideo: "Josh Tabor explains: 'A p-value measures how likely it is to get evidence for Ha as strong as or even stronger than the observed evidence by chance alone when H0 is true.' He also says: 'You can think of a p-value as a conditional probability, where the condition is that the null hypothesis is true, and you always have to include that fact when you're interpreting a p-value.'"
    },

    reflect2: {
        questionText: "Compare the p-values for the lemonade study (0.1357, one-sided) and the football study (0.0244, two-sided). Without yet learning a formal decision rule, which study provides stronger evidence against H0? Explain your reasoning using the meaning of a p-value.",
        expectedElements: [
            { id: "identifies-football-stronger", description: "Identifies the football study (p-value = 0.0244) as providing stronger evidence against H0", required: true },
            { id: "smaller-pvalue-stronger", description: "Explains that a smaller p-value means stronger evidence against H0 because the observed result would be less likely to occur by chance if H0 were true", required: true },
            { id: "lemonade-not-unusual", description: "Explains that the lemonade p-value of 0.1357 means the result (p-hat = 0.60) is not that unusual if H0 is true — about a 13.6% chance", required: true },
            { id: "football-unusual", description: "Explains that the football p-value of 0.0244 means the result is quite unusual if H0 is true — only about a 2.4% chance", required: true },
            { id: "connects-to-z-scores", description: "Optionally connects the comparison to the z-scores (1.10 vs -2.25) showing the football result is farther from the null value in standard deviation units", required: false }
        ],
        scoringGuide: {
            E: "Response correctly identifies the football study as having stronger evidence, explains that smaller p-values mean stronger evidence, and discusses what each p-value tells us about how surprising the data would be under H0",
            P: "Response correctly identifies the football study as stronger but reasoning is incomplete — e.g., says 'smaller p-value = stronger evidence' without explaining why in terms of what p-values measure",
            I: "Response incorrectly identifies the lemonade study as stronger, or shows fundamental misunderstanding of how p-values relate to evidence strength"
        },
        commonMistakes: [
            "Thinking that a larger p-value means stronger evidence",
            "Simply stating 'football is stronger' without explaining why smaller p-values indicate stronger evidence",
            "Confusing the p-value with the probability that H0 is true",
            "Not connecting the p-value comparison to what would happen by chance under H0"
        ],
        contextFromVideo: "In Video 1, Josh Tabor describes the lemonade z-score of 1.10 as 'not that unusual' and the football z-score of -2.25 as 'pretty unusual.' The lemonade p-value of 0.1357 represents a 13.57% chance of seeing results this extreme under H0, while the football p-value of 0.0244 represents only a 2.44% chance."
    },

    exitTicket: {
        questionText: "A researcher believes that the proportion of left-handed students at a large university is less than 0.10. She takes a random sample of 150 students and finds that 9 are left-handed (p-hat = 0.06). (a) The hypotheses are H0: p = 0.10 and Ha: p < 0.10. Calculate the standardized test statistic. (b) Calculate the p-value. (c) Interpret the p-value in context.",
        expectedElements: [
            { id: "correct-z-calculation", description: "Correctly calculates z = (0.06 - 0.10) / sqrt(0.10 * 0.90 / 150) = -0.04 / 0.02449 = -1.63 (approximately)", required: true },
            { id: "uses-p0-not-phat", description: "Uses p0 = 0.10 (not p-hat = 0.06) in the denominator of the test statistic", required: true },
            { id: "correct-pvalue", description: "Calculates the p-value as P(z <= -1.63) which is approximately 0.0516 (area in the LEFT tail, since Ha is p < 0.10)", required: true },
            { id: "one-sided-left", description: "Recognizes this is a one-sided test (Ha: p < 0.10) and finds area in the left tail only, not both tails", required: true },
            { id: "correct-interpretation", description: "Interprets the p-value: Assuming 10% of all students at the university are left-handed, there is approximately a 0.0516 probability of getting a sample proportion of 0.06 or less by chance alone in a random sample of 150 students", required: true },
            { id: "assumes-h0", description: "Interpretation includes the assumption that H0 is true", required: true },
            { id: "or-more-extreme", description: "Interpretation includes 'or less' / 'or more extreme' language", required: false },
            { id: "by-chance-alone", description: "Interpretation includes 'by chance alone'", required: false }
        ],
        scoringGuide: {
            E: "Response correctly calculates z approximately -1.63 using p0 = 0.10, finds the left-tail p-value approximately 0.0516, and provides a correct contextual interpretation that assumes H0 is true and includes 'or less' and 'by chance alone'",
            P: "Response has most elements correct but makes one error — e.g., correct z but wrong tail for p-value, or correct calculation but interpretation missing the assumption clause or 'or more extreme'",
            I: "Response has multiple errors — e.g., uses p-hat in the denominator, finds both-tail area for a one-sided test, or interpretation is fundamentally incorrect"
        },
        commonMistakes: [
            "Using p-hat = 0.06 instead of p0 = 0.10 in the denominator",
            "Finding the right-tail area instead of the left-tail area (Ha is <, not >)",
            "Doubling the one-tail area (treating it as two-sided when Ha is one-sided)",
            "Interpreting the p-value as the probability that H0 is true",
            "Forgetting 'or less' / 'or more extreme' in the interpretation",
            "Forgetting to assume H0 is true in the interpretation"
        ],
        contextFromVideo: "Video 1 demonstrates the formula z = (p-hat - p0) / sqrt(p0(1-p0)/n) with two examples. For one-sided Ha: p < p0, the p-value is P(z <= observed z) — area in the left tail. Video 2 shows the three required elements in a p-value interpretation: assume H0 is true, probability of result as extreme or more extreme, and by chance alone."
    }
};

/**
 * Build the grading prompt for a specific reflection question
 * @param {string} questionId - The ID of the question (reflect1, reflect2, exitTicket)
 * @param {string} studentAnswer - The student's response
 * @returns {string} The formatted prompt for the AI grader
 */
window.buildReflectionPromptU6L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U6L5[questionId];
    if (!rubric) {
        throw new Error(`Unknown question ID: ${questionId}`);
    }

    const requiredElements = rubric.expectedElements.filter(e => e.required);
    const optionalElements = rubric.expectedElements.filter(e => !e.required);

    return `You are grading an AP Statistics student response about Interpreting p-Values.

QUESTION:
${rubric.questionText}

STUDENT RESPONSE:
${studentAnswer}

LESSON CONTEXT:
${window.LESSON_CONTEXT_U6L5}

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
window.getRubricU6L5 = function(questionId) {
    return window.RUBRICS_U6L5[questionId];
};
