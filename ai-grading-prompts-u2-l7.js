/**
 * AI Grading Prompts for Unit 2 Lesson 7: Residuals
 * Topic 2.7: Required Course Content
 *
 * Learning Objectives:
 *   Calculate and interpret residuals using y - ŷ
 *   Explain what positive and negative residuals mean in context
 *   Use residual plots to judge whether a linear model is appropriate
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L7 = `
VIDEO 1 - Calculating and Interpreting Residuals (~5:42):
- The lesson introduces three goals: calculate a residual, interpret a residual, and construct residual plots.
- The context is grocery stores in San Antonio, Texas, and whether neighborhood income predicts access to healthy foods.
- Linda Saucedo collected data on average household income in a store's zip code and the number of organic items offered at the store.
- The fitted least-squares regression line shows a positive trend: as income increases, the number of organic items tends to increase.
- A residual is the difference between the actual response value and the predicted response value.
- The order matters: residual = y - ŷ, which means actual minus predicted.
- The example uses x = 66,730 and predicts 51.4 organic items.
- The actual observed value is 84 organic items, so the residual is 84 - 51.4 = 32.6.
- A positive residual means the actual value is greater than predicted, so the model underestimated.
- A negative residual means the actual value is less than predicted, so the model overestimated.
- A residual plot places residual values on the y-axis instead of the original response values.
- Residual plots help us focus on model errors and assess model fit.

VIDEO 2 - Using Residual Plots to Judge Fit (~4:31):
- The lesson uses residual plots to determine whether a linear model is appropriate.
- In a good residual plot, we see apparent randomness with scatter centered at zero and no clear pattern.
- This means the linear model captured the linear trend and the leftover residuals are just random noise.
- A bad residual plot can show a visible pattern such as curvature or an up-down-up shape.
- A visible pattern suggests the residuals are not just random noise and the linear model may not be the best fit.
- When patterns appear, students may need to consider nonlinear models or other modeling procedures.
- Residual plots are used to investigate the appropriateness of a selected model.

AP CLASSROOM FRAMEWORK CONNECTION:
- The residual is the difference between the actual value and the predicted value: residual = y - ŷ.
- A residual plot is a plot of residuals versus explanatory-variable values or predicted response values.
- Apparent randomness in a residual plot for a linear model is evidence of a linear form to the association.
- Residual plots can be used to investigate the appropriateness of a selected model.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L7 = {
    reflect1: {
        questionText: 'What does a residual tell you about a single data point, and how does the sign of the residual help you interpret the model\'s prediction?',
        expectedElements: [
            { id: 'actual-minus-predicted', description: 'States that a residual is the actual value minus the predicted value, or y - ŷ', required: true },
            { id: 'single-point-difference', description: 'Explains that a residual tells how far one observed point is from the model\'s prediction', required: true },
            { id: 'positive-underestimate', description: 'Explains that a positive residual means the actual value is greater than predicted, so the model underestimated', required: true },
            { id: 'negative-overestimate', description: 'Explains that a negative residual means the actual value is less than predicted, so the model overestimated', required: true },
            { id: 'context-example', description: 'May mention the example of 84 actual items, 51.4 predicted items, and a residual of 32.6', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that a residual is actual minus predicted, describes what it says about a single point, and correctly interprets positive and negative residuals.',
            P: 'Response explains part of the residual idea correctly but misses an important point about the subtraction order, what the residual represents, or the meaning of the sign.',
            I: 'Response does not correctly explain what a residual is or how its sign should be interpreted.'
        },
        commonMistakes: [
            'Reversing the subtraction and saying predicted minus actual',
            'Saying a positive residual means overestimation',
            'Saying a negative residual means underestimation',
            'Failing to explain that a residual is tied to one observed data point'
        ],
        contextFromVideo: 'The video defines residual as y - ŷ and uses the grocery-store example where 84 actual items and 51.4 predicted items give a residual of 32.6, which is positive and shows underprediction.'
    },

    reflect2: {
        questionText: 'How can a residual plot tell you whether a linear model is appropriate, and what would make you question the model?',
        expectedElements: [
            { id: 'apparent-randomness', description: 'States that a good residual plot shows apparent randomness', required: true },
            { id: 'centered-at-zero', description: 'States that the residuals should be scattered around zero', required: true },
            { id: 'no-clear-pattern', description: 'Explains that no clear pattern is a good sign for a linear model', required: true },
            { id: 'pattern-warning', description: 'Explains that a visible pattern or curvature is a warning sign that the linear model may not be appropriate', required: true },
            { id: 'nonlinear-next-step', description: 'May mention considering a nonlinear model or another model when a pattern appears', required: false }
        ],
        scoringGuide: {
            E: 'Response explains that randomness around zero with no clear pattern supports a linear model and that visible patterns make the model questionable.',
            P: 'Response identifies part of what to look for in a residual plot but misses a key idea about randomness, zero, patterns, or model appropriateness.',
            I: 'Response does not correctly explain how residual plots are used to judge whether a linear model fits.'
        },
        commonMistakes: [
            'Saying a patterned residual plot is a good sign',
            'Ignoring whether residuals are centered around zero',
            'Describing the original scatterplot instead of the residual plot',
            'Failing to connect patterns to poor linear fit'
        ],
        contextFromVideo: 'The video says a good residual plot has apparent randomness with scatter centered at zero and no clear pattern, while curvature or another visible pattern suggests the linear model may not be the best fit.'
    },

    exitTicket: {
        questionText: 'A linear model predicts 51.4 organic items for a store with x = 66,730, but the actual store has 84 items, and the full residual plot shows random scatter around 0 with no clear pattern. Calculate and interpret the residual, identify underprediction or overprediction, explain what the residual plot says about fit, and describe a pattern that would make you doubt a linear model.',
        expectedElements: [
            { id: 'correct-residual', description: 'Calculates the residual as 84 - 51.4 = 32.6', required: true },
            { id: 'context-interpretation', description: 'Interprets the residual in context by saying the actual store had 32.6 more organic items than predicted', required: true },
            { id: 'underpredicted', description: 'States that the positive residual means the model underpredicted', required: true },
            { id: 'good-fit-randomness', description: 'Explains that random scatter around zero with no clear pattern suggests a linear model is appropriate', required: true },
            { id: 'bad-fit-pattern', description: 'Describes that a visible pattern such as curvature or an up-down-up shape would make a linear model questionable', required: true },
            { id: 'residual-plot-role', description: 'May mention that residual plots are used to investigate model fit or appropriateness', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly computes and interprets the residual, identifies underprediction, explains that the residual plot supports a linear model, and names a pattern that would cast doubt on linear fit.',
            P: 'Response gets most of the exit ticket right but misses or weakly explains one major part of the residual calculation, interpretation, sign, or residual-plot conclusion.',
            I: 'Response has major errors about the residual, its interpretation, or what the residual plot says about model fit.'
        },
        commonMistakes: [
            'Computing predicted minus actual instead of actual minus predicted',
            'Calling the positive residual overprediction',
            'Saying a random residual plot is bad for a linear model',
            'Failing to give an example of a pattern that would make linear fit doubtful'
        ],
        contextFromVideo: 'The lesson uses 84 actual and 51.4 predicted to get a positive residual of 32.6, then explains that apparent randomness around zero in a residual plot is a good sign for linear model fit.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L7 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L7[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about residuals and residual plots (Topic 2.7).

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
window.getRubricU2L7 = function(questionId) {
    return window.RUBRICS_U2L7[questionId] || null;
};
