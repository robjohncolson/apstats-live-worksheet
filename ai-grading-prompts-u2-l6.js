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
            { id: 'plug-in-x', description: 'Explains that you substitute the explanatory-variable value for x in the regression equation', required: true },
            { id: 'slope-and-intercept', description: 'Explains that you multiply the slope by x and combine it with the y-intercept to get ŷ', required: true },
            { id: 'predicted-response', description: 'States that ŷ is the predicted response rather than an exact observed value', required: true },
            { id: 'decimal-possible', description: 'Explains that the result can be a decimal because it is a model prediction, not an actual count or exact data value', required: true },
            { id: 'variability-idea', description: 'May mention that data have variability, so the model is estimating rather than giving exact values', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains how x is substituted into ŷ = a + bx, how slope and intercept combine to produce ŷ, and why the output is a predicted rather than exact value.',
            P: 'Response gets part of the prediction process right but leaves out an important idea about the equation, the predicted response, or why the result is not exact.',
            I: 'Response does not correctly explain how the regression equation is used or why its output is only a prediction.'
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
            { id: 'less-reliable', description: 'States that predictions made by extrapolation are less reliable', required: true },
            { id: 'compare-to-interval', description: 'Explains that you decide by comparing the chosen x-value to the interval of x-values used to build the model', required: true },
            { id: 'example-link', description: 'May mention the 2048 example or the swine prediction at x = 0.2', required: false }
        ],
        scoringGuide: {
            E: 'Response explains what extrapolation is, why it is risky, and how to tell when a prediction uses an x-value outside the observed data range.',
            P: 'Response correctly explains part of extrapolation but misses a key idea about the observed interval, reliability, or why the trend may fail to continue.',
            I: 'Response does not correctly explain extrapolation or why it can make predictions unreliable.'
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
            { id: 'variables-context', description: 'Identifies x as hours of after-school tutoring and ŷ as the predicted quiz score', required: true },
            { id: 'slope-context', description: 'Explains that the slope 1.8 means the predicted quiz score increases by 1.8 points for each additional hour of tutoring', required: true },
            { id: 'intercept-context', description: 'Explains that the y-intercept 61.4 is the predicted quiz score for a student with 0 hours of tutoring', required: true },
            { id: 'correct-prediction', description: 'Calculates the predicted quiz score for 8 hours as 75.8', required: true },
            { id: 'prediction-not-exact', description: 'Explains that the model gives a predicted score, so it does not have to match a student’s exact observed score', required: true },
            { id: 'extrapolation-unreliable', description: 'States that x = 15 is outside the observed interval from 2 to 10, so it is extrapolation and is not reliable or is less reliable because the trend may not continue', required: true },
            { id: 'further-less-reliable', description: 'May note that predictions become less reliable the farther they are beyond the observed x-range', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the model components in context, computes the prediction for x = 8, explains that the model gives a predicted rather than exact value, and rejects x = 15 as an unreliable extrapolation.',
            P: 'Response gets most of the exit ticket right but misses or weakly explains one major idea about model components, the calculation, prediction meaning, or extrapolation.',
            I: 'Response has major errors about the regression model, the prediction, or the reliability of extrapolated values.'
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
window.getRubricU2L6 = function(questionId) {
    return window.RUBRICS_U2L6[questionId] || null;
};
