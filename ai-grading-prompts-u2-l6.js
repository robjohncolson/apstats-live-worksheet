/**
 * AI Grading Prompts for Unit 2 Lesson 6: Linear Regression Models
 * Topic 2.6: Required Course Content
 *
 * Learning Objectives:
 *   Calculate a predicted response value using a linear regression model
 *   Explain the roles of slope, intercept, x, and ŷ in prediction
 *   Explain why extrapolation can make predictions less reliable
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L6 = `
VIDEO 1 - Building and Using a Regression Model (~5:53):
- The lesson introduces three goals: construct a linear regression model, make predictions using that model, and gauge the reliability of those predictions.
- The context is grocery stores in the San Antonio metropolitan area and whether neighborhood income predicts access to healthy foods.
- Linda Salcedo collected data from 37 stores.
- The explanatory variable was average income in the store's zip code.
- The response variable was the number of organic vegetable items offered at the store.
- The video compares the algebra equation y = mx + b to the statistics equation ŷ = a + bx.
- In statistics, ŷ represents a predicted y-value rather than an exact observed value because data has variability.
- In the regression equation, b is the slope and a is the y-intercept.
- The video stresses that technology is usually used to generate the regression model.
- For the grocery store data, the regression model is ŷ = -14.7 + 0.001x.
- Substituting x = 90,000 gives a predicted response of 75.3 organic items.
- The video explains that 75.3 can be a decimal because it is a prediction, not an actual observed store count.
- The closing takeaway is that a linear regression model is composed of a slope and a y-intercept, and predictions from the model are not exact data values.

VIDEO 2 - Extrapolation and Reliability (~10:12):
- The lesson focuses on the dangers of extrapolation in linear regression.
- It revisits a widely cited study that predicted 100% of Americans would be overweight by 2048 if trends continued.
- The video defines extrapolation as making predictions outside the interval of observed x-values.
- Extrapolation is dangerous because the trend seen in the current data may not continue.
- The warning about extrapolation applies to non-time explanatory variables as well as time variables.
- The free-response example uses swine population size and atmospheric ammonia concentration.
- In that problem, x is measured in thousands, so a population of 200 must be written as x = 0.2.
- Plugging x = 0.2 into the regression equation gives a predicted ammonia concentration of 0.154.
- That prediction is not reliable because x = 0.2 is outside the interval of observed x-values, so it is extrapolation.
- The closing takeaway is that extrapolation makes predictions less reliable and that students should include context and show work when explaining predictions.

AP CLASSROOM FRAMEWORK CONNECTION:
- A simple linear regression model is an equation that uses an explanatory variable, x, to predict the response variable, y.
- The predicted response value is denoted by ŷ.
- The predicted response is calculated as ŷ = a + bx, where a is the y-intercept, b is the slope, and x is the value of the explanatory variable.
- Extrapolation is predicting a response value using an x-value beyond the interval of x-values used to determine the regression line.
- A predicted value becomes less reliable as an estimate the farther we extrapolate.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L6 = {
    reflect1: {
        questionText: 'How do slope, y-intercept, and x-value work together in ŷ = a + bx, and why is the result only a prediction?',
        expectedElements: [
            { id: 'plug-in-x', description: 'Explains that you substitute the explanatory-variable value for x in the regression equation', required: false },
            { id: 'slope-and-intercept', description: 'Explains that you multiply the slope by x and combine it with the y-intercept to get ŷ', required: true },
            { id: 'predicted-response', description: 'States that ŷ is the predicted response rather than an exact observed value', required: true },
            { id: 'decimal-possible', description: 'Explains that the result can be a decimal because it is a model prediction, not an actual count or exact data value', required: false },
            { id: 'variability-idea', description: 'May mention that data have variability, so the model is estimating rather than giving exact values', required: false }
        ],
        scoringGuide: {
            E: 'Explains that the x-value is multiplied by the slope and added to the intercept to get y-hat, and that y-hat is a predicted value, not the exact observed response.',
            P: 'Describes the arithmetic without saying the result is only a prediction, or says it is a prediction without describing how the equation produces it.',
            I: 'Neither idea is present, or y-hat is treated as the actual observed value with no arithmetic.'
        },
        commonMistakes: [
            'Mixing up the slope and y-intercept',
            'Treating ŷ as an actual observed value',
            'Forgetting to explain what x represents',
            'Saying the answer cannot be a decimal'
        ],
        contextFromVideo: 'The video uses the model ŷ = -14.7 + 0.001x and substitutes x = 90,000 to get 75.3. It then explains that 75.3 is a prediction, not an actual store count.'
    },

    reflect2: {
        questionText: 'Why is extrapolation dangerous, and how do you decide whether a regression prediction is outside the observed data range?',
        expectedElements: [
            { id: 'define-extrapolation', description: 'Defines extrapolation as predicting outside the interval of observed x-values', required: true },
            { id: 'trend-may-not-continue', description: 'Explains that extrapolation is dangerous because the existing trend may not continue', required: true },
            { id: 'less-reliable', description: 'States that predictions made by extrapolation are less reliable', required: false },
            { id: 'compare-to-interval', description: 'Explains that you decide by comparing the chosen x-value to the interval of x-values used to build the model', required: false },
            { id: 'example-link', description: 'May mention the 2048 example or the swine prediction at x = 0.2', required: false }
        ],
        scoringGuide: {
            E: 'Defines extrapolation as predicting for an x outside the range of observed x-values, and explains it is risky because the pattern may not continue there. Deciding = comparing the x to the observed interval, which the definition carries.',
            P: 'Names extrapolation (predicting outside the observed x-range) without the reason it is risky, or gives the risk without saying what extrapolation is.',
            I: 'Neither idea is present.'
        },
        commonMistakes: [
            'Saying any regression prediction is reliable',
            'Ignoring the interval of observed x-values',
            'Treating extrapolation as the same as interpolation',
            'Failing to explain why the trend may change'
        ],
        contextFromVideo: 'The video defines extrapolation as predicting outside the interval of x-values, warns that current trends may not continue, and labels the swine prediction at x = 0.2 as unreliable because it was outside the observed interval.'
    },

    exitTicket: {
        questionText: 'A teacher uses the model ŷ = 61.4 + 1.8x to predict quiz score from hours of tutoring, with observed x-values from 2 to 10 hours. Identify the variables, slope, and intercept in context, predict for x = 8, explain why the prediction is not exact, and decide whether x = 15 is reliable.',
        expectedElements: [
            { id: 'variables-context', description: 'Identifies x as hours of after-school tutoring and ŷ as the predicted quiz score', required: false },
            { id: 'slope-context', description: 'Explains that the slope 1.8 means the predicted quiz score increases by 1.8 points for each additional hour of tutoring', required: true },
            { id: 'intercept-context', description: 'Explains that the y-intercept 61.4 is the predicted quiz score for a student with 0 hours of tutoring', required: true },
            { id: 'correct-prediction', description: 'Calculates the predicted quiz score for 8 hours as 75.8', required: true },
            { id: 'prediction-not-exact', description: 'Explains that the model gives a predicted score, so it does not have to match a student’s exact observed score', required: true },
            { id: 'extrapolation-unreliable', description: 'States that x = 15 is outside the observed interval from 2 to 10, so it is extrapolation and is not reliable or is less reliable because the trend may not continue', required: true },
            { id: 'further-less-reliable', description: 'May note that predictions become less reliable the farther they are beyond the observed x-range', required: false }
        ],
        scoringGuide: {
            E: 'Slope: predicted quiz score rises 1.8 points per additional hour of tutoring; intercept: predicted score 61.4 with 0 hours; y-hat = 61.4 + 1.8(8) = 75.8 with the substitution shown; the prediction is not exact because individual students vary around the line; x = 15 is outside 2-10 hours, so it is extrapolation and not reliable.',
            P: 'Four of the five are correct; one is missing or wrong (commonly a slope with no \'predicted\' or no \'per hour\').',
            I: 'Two or more of the five are missing or wrong.'
        },
        commonMistakes: [
            'Treating 75.8 as an exact quiz score',
            'Describing 15 hours as reliable even though it is outside the observed interval',
            'Failing to interpret the slope and intercept in context',
            'Using the wrong x-value in the calculation'
        ],
        contextFromVideo: 'The lesson teaches that predictions are made with ŷ = a + bx, that the output is a predicted rather than exact value, and that predictions outside the observed x-interval are extrapolations and are less reliable.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L6[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about linear regression models and extrapolation (Topic 2.6).

## Question
${rubric.questionText}

## Student's Answer
"${studentAnswer}"

## Key Elements (what a complete answer usually covers)
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
GRADING STANDARD (read before scoring): This is a short reflection written right after watching a lesson video, not an AP exam response. Score the UNDERSTANDING, not the checklist.
- E: every key element is present and correct, in the student's own words. The key elements are already only the essentials, each one a single idea, so none may be skipped. Accept any wording, informal vocabulary, and any correct example. Do NOT withhold E for a missing optional element, or for a missing specific number unless a key element asks for that calculation.
- P: the central idea is right but one key element is missing or wrong.
- I: the main idea is wrong or missing, the response is off-topic, or it is essentially blank.
If you are torn between two scores, give the higher one.

Grade the student's response. Return JSON:
{
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU2L6 = function(questionId) {
    return window.RUBRICS_U2L6[questionId] || null;
};
