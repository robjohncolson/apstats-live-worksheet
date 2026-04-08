/**
 * AI Grading Prompts for Unit 9 Lesson 5: Carrying Out a Test for the Slope of a Regression Model
 * Topic 9.5: Carrying Out a Test for the Slope of a Regression Model
 *
 * Learning Objectives:
 *   Calculate the test statistic for a test about slope
 *   Use n - 2 degrees of freedom and the correct tail(s) to find a p-value
 *   Interpret the p-value in context for a test about slope
 *   Compare the p-value to alpha to make a decision
 *   State a conclusion in context
 *   Carry out a complete significance test about the slope of a regression model
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U9L5 = `
VIDEO 1 - Calculating the Test Statistic and p-value (~8:51):
- The lesson asks how to calculate an appropriate test statistic and p-value in a test about the slope of a population regression line.
- Texas Algebra 1 study recap: researchers collected data on percent attendance and number of questions answered correctly for a random sample of 11 students.
- The question is whether the data give convincing evidence at alpha = 0.01 of a positive linear relationship between state test score and percent attendance for all Texas Algebra 1 students.
- Previously established setup: H0: beta = 0, Ha: beta > 0, where beta is the slope of the population regression line for predicting number of questions answered correctly from percent attendance.
- The sample slope is b = 0.57, the standard error of the slope is 0.062, and the standardized test statistic is t = (0.57 - 0) / 0.062 = 9.19, which matches the T value 9.18 in computer output up to rounding.
- For tests about slope, use the formula t = (b - beta_0) / SE_b.
- P-values for tests about slope use a t-distribution with degrees of freedom n - 2.
- For the Texas study, df = 11 - 2 = 9 and because Ha: beta > 0, the p-value is the right-tail probability P(t >= 9.18).
- Table B gives p-value < 0.0005, while technology gives p-value = 3.63 x 10^-6.
- Computer output typically reports the p-value for a two-sided test, so for a one-sided test you split that output in half.
- Practice problem: "Don't Spill My Drink!" experiment with 25 trials of speed on a bumpy dirt road and amount spilled.
- For that example, H0: beta = 0, Ha: beta != 0, b = 1.520, SE = 0.179, t = 8.49, df = 23, and the two-sided p-value is extremely small.

VIDEO 2 - Interpreting the p-value and Stating a Conclusion (~7:51):
- The video focuses on how to interpret the p-value in a test about slope and how to state a conclusion.
- A p-value measures how likely it is to get evidence for the alternative hypothesis as strong as or stronger than the observed evidence by chance alone when the null hypothesis is true.
- In the Texas study, assuming no linear relationship between state test score and percent attendance, there is an approximately zero probability of getting a sample regression line with slope 0.57 or greater by chance alone in a random sample of 11 students.
- Small p-values indicate the observed test statistic is unlikely to occur by random chance alone if H0 is true.
- Decision rule: if p-value <= alpha, reject H0 and conclude there is convincing statistical evidence for Ha in context.
- If p-value > alpha, fail to reject H0 and conclude there is not convincing statistical evidence for Ha in context.
- For Texas, p-value is approximately 0, which is less than alpha = 0.01, so reject H0 and conclude there is convincing statistical evidence of a positive linear relationship.
- In the drink-spilling example, the p-value interpretation must reflect the two-sided alternative: assuming no linear relationship, there is a 1.52 x 10^-8 probability of getting a sample regression line with slope as extreme as or more extreme than 1.52 in either direction by chance alone.
- Because 1.52 x 10^-8 < 0.05, reject H0 and conclude there is convincing statistical evidence of a linear relationship between speed and amount spilled.

VIDEO 3 - A Complete Significance Test from Start to Finish (~7:46):
- The video walks through an entire significance test about the slope of a population regression line.
- A random sample of 20 entering students from the past five years was taken at a large university, and attention first focused on the 7 students who did not complete the statistics Ph.D. program.
- The question asks whether there is a significant relationship between GPA and mean number of credit hours per semester at alpha = 0.01 for the students who did not complete the program.
- Because no direction was specified, the hypotheses are H0: beta = 0 versus Ha: beta != 0.
- Beta is the slope of the population regression line for predicting mean number of credit hours per semester from GPA for students who did not complete the statistics Ph.D. program at that university.
- The procedure is a t-test for slope, and the conditions are stated to be reasonable.
- From the computer output for the 7 students who did not complete the program, t = -3.44, df = 7 - 2 = 5, and p-value = 0.018.
- Because 0.018 > 0.01, fail to reject H0. There is not convincing evidence of a linear relationship for that population.
- For the 13 students who successfully completed the program, the evidence of a significant relationship is stronger.
- The stronger evidence can be justified by the smaller p-value (approximately 0.000) or by the more extreme t-statistic compared with the part A test.
- A complete significance test about slope should include hypotheses, parameter definition, significance level, procedure, conditions, test statistic, p-value, and a conclusion in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U9L5 = {
    reflect1: {
        questionText: 'Why must a correct p-value interpretation mention both "assuming H0 is true" and "as extreme or more extreme"?',
        expectedElements: [
            { id: 'assume-null', description: 'Explains that a p-value is calculated under the assumption that the null hypothesis is true', required: true },
            { id: 'extreme-language', description: 'Explains that the p-value includes results as extreme or more extreme than the observed sample result', required: true },
            { id: 'chance-alone', description: 'Mentions that the p-value describes what could happen by chance or random sampling variation alone', required: true },
            { id: 'tail-direction', description: 'May note that the meaning of extreme depends on whether the test is one-sided or two-sided', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains both that the null hypothesis is assumed true and that the p-value counts outcomes as extreme or more extreme than the observed statistic, with a connection to chance alone.',
            P: 'Response gets part of the interpretation correct but misses one of the two required ideas or does not clearly connect the interpretation to chance alone.',
            I: 'Response does not correctly explain what a p-value interpretation must include.'
        },
        commonMistakes: [
            'Describing the p-value as the probability that the null hypothesis is true',
            'Leaving out the assumption that H0 is true',
            'Forgetting to mention outcomes as extreme or more extreme than the observed result',
            'Confusing p-value interpretation with the final conclusion'
        ],
        contextFromVideo: 'Video 2 defines the p-value as how likely it is to get evidence for Ha as strong as or stronger than the observed evidence by chance alone when H0 is true.'
    },

    reflect2: {
        questionText: 'Which pieces must appear in a complete significance test about slope, and how does the final decision depend on p-value and alpha?',
        expectedElements: [
            { id: 'full-setup', description: 'Lists the core pieces of a complete test such as hypotheses, parameter definition, significance level, procedure, conditions, test statistic, p-value, and conclusion', required: true },
            { id: 'decision-rule', description: 'Explains that the decision is based on comparing the p-value to alpha', required: true },
            { id: 'reject-vs-fail', description: 'States that p-value <= alpha leads to reject H0, while p-value > alpha leads to fail to reject H0', required: true },
            { id: 'context-conclusion', description: 'May mention that the final conclusion must be written in context of the variables', required: false }
        ],
        scoringGuide: {
            E: 'Response identifies the main components of a complete significance test and correctly explains the reject/fail-to-reject decision rule using p-value and alpha.',
            P: 'Response includes some required pieces or the decision rule, but not both clearly and completely.',
            I: 'Response does not show understanding of the structure of a full test or how the final decision is made.'
        },
        commonMistakes: [
            'Skipping major pieces such as hypotheses, conditions, or the conclusion',
            'Reversing the decision rule for p-value and alpha',
            'Saying to accept H0 instead of fail to reject H0',
            'Giving a conclusion without writing it in context'
        ],
        contextFromVideo: 'Video 3 ends with a checklist for a complete significance test: hypotheses and parameter, alpha, procedure, conditions, test statistic, p-value, and conclusion.'
    },

    exitTicket: {
        questionText: 'A sports scientist takes a random sample of 14 cyclists and records average weekly training hours and VO2 max improvement over a season. She wants to know whether more training hours are associated with greater improvement. Computer output gives slope b = 1.80, SE Coef = 0.45, T = 4.00, and P = 0.002. Assume conditions are met. State hypotheses and define beta, give the test statistic and degrees of freedom, explain the one-sided p-value, interpret the p-value, and state a conclusion at alpha = 0.05.',
        expectedElements: [
            { id: 'null-hypothesis', description: 'States H0: beta = 0', required: true },
            { id: 'alternative-hypothesis', description: 'States Ha: beta > 0 because the question asks whether more training hours are associated with greater improvement', required: true },
            { id: 'define-beta', description: 'Defines beta as the slope of the population regression line for predicting VO2 max improvement from weekly training hours for cyclists in the population of interest', required: true },
            { id: 'test-statistic', description: 'States the test statistic is t = 4.00', required: true },
            { id: 'degrees-freedom', description: 'States df = 14 - 2 = 12', required: true },
            { id: 'one-sided-pvalue', description: 'Explains that because the output p-value 0.002 is for a two-sided test, the one-sided p-value is 0.001', required: true },
            { id: 'interpret-pvalue', description: 'Interprets the p-value in context assuming H0 is true and describing a sample slope as large as or larger than the observed slope by chance alone', required: true },
            { id: 'decision-conclusion', description: 'Concludes that because 0.001 < 0.05, reject H0 and there is convincing statistical evidence that greater training hours are associated with greater VO2 max improvement', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly states the hypotheses, defines beta in context, gives t = 4.00 and df = 12, correctly halves the two-sided p-value to 0.001, interprets that p-value, and concludes by rejecting H0 at alpha = 0.05.',
            P: 'Response gets most major elements correct but misses or confuses one or two parts, such as the direction of Ha, the one-sided p-value, or the contextual conclusion.',
            I: 'Response has major errors in the hypotheses, p-value reasoning, or final conclusion, or omits several required components.'
        },
        commonMistakes: [
            'Using Ha: beta != 0 instead of beta > 0 even though the question is directional',
            'Forgetting that computer output usually gives a two-sided p-value and not halving 0.002',
            'Using the wrong degrees of freedom instead of n - 2',
            'Interpreting the p-value as the probability that H0 is true',
            'Writing the conclusion without comparing the p-value to alpha'
        ],
        contextFromVideo: 'Across Videos 1 through 3, students learn to compute t, use df = n - 2, choose one or two tails based on Ha, interpret the p-value correctly, and make a conclusion by comparing p-value to alpha.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU9L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U9L5[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about carrying out a test for the slope of a regression model (Topic 9.5).

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Required Elements (must be present for full credit)
${requiredElements}

## Optional Elements (bonus, not required)
${optionalElements || 'None'}

## Scoring Guide
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

## Common Mistakes to Watch For
${rubric.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Lesson Context
${rubric.contextFromVideo}

## Instructions
Grade the student's response. Return JSON:
{
    "score": "E" or "P" or "I",
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU9L5 = function(questionId) {
    return window.RUBRICS_U9L5[questionId] || null;
};
