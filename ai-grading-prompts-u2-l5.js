/**
 * AI Grading Prompts for Unit 2 Lesson 5: Correlation
 * Topic 2.5: Required Course Content
 *
 * Learning Objectives:
 *   Determine the correlation for a linear relationship
 *   Interpret the correlation for a linear relationship
 *   Explain the limits of correlation, including that correlation does not imply causation
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U2L5 = `
VIDEO 1 - Correlation and Interpreting r (~5:49):
- The lesson introduces three goals: calculate the correlation r, interpret it, and decide what properties of a scatterplot can be learned from the value alone.
- The context returns to the attendance and Algebra I exam example from the previous lesson.
- School leaders hoped that improving attendance might help equalize opportunities and raise final test scores.
- The sample of 11 students showed a strong positive linear relationship between percent attendance and number of questions answered correctly.
- The correlation coefficient r gives the direction and quantifies the strength of a linear relationship.
- The video shows the formula for r but stresses that technology is usually used to calculate it.
- Correlation values range from -1 to 1 inclusive.
- Negative r values indicate a negative correlation, while positive r values indicate a positive correlation.
- Values of r closer to 0 indicate weaker linear relationships.
- Values of r with magnitude closer to 1 indicate stronger linear relationships.
- For the attendance data, the correlation coefficient is r = 0.95.
- The video interprets r = 0.95 as a very strong positive linear relationship.
- Districts later raised attendance with expensive initiatives, but test scores stayed flat.
- The lesson uses that outcome to emphasize that a strong correlation does not prove that changing one variable will cause the other to change.
- The closing takeaway is that the sign of r tells direction, the magnitude tells strength, and r alone does not provide enough evidence to describe form or unusual features without looking at the scatterplot.

AP CLASSROOM FRAMEWORK CONNECTION:
- The correlation, r, gives the direction and quantifies the strength of the linear association between two quantitative variables.
- The correlation coefficient can be calculated by formula, but the most common way to determine r is by using technology.
- A correlation coefficient close to 1 or -1 does not necessarily mean that a linear model is appropriate.
- Correlation is unit-free and always between -1 and 1, inclusive.
- A value of r = 0 indicates no linear association.
- A value of r = 1 or r = -1 indicates a perfect linear association.
- A perceived or real relationship between two variables does not mean that changes in one variable cause changes in the other.
- Correlation does not necessarily imply causation.
`;

// Rubrics for each reflection question
window.RUBRICS_U2L5 = {
    reflect1: {
        questionText: 'How do the sign and magnitude of r help you interpret a linear relationship?',
        expectedElements: [
            { id: 'sign-direction', description: 'Explains that the sign of r tells the direction of the relationship', required: true },
            { id: 'positive-negative', description: 'States that positive means y tends to increase as x increases, while negative means y tends to decrease as x increases', required: false },
            { id: 'magnitude-strength', description: 'Explains that the magnitude or distance from 0 tells the strength of the linear relationship', required: true },
            { id: 'close-values', description: 'States that values closer to 0 are weaker and values closer to 1 or -1 are stronger', required: false },
            { id: 'linear-focus', description: 'Recognizes that r is describing a linear relationship', required: false }
        ],
        scoringGuide: {
            E: 'The sign of r gives the direction (positive: y tends to rise with x; negative: falls) and the distance from 0 gives the strength of the linear relationship (near 1 or -1 strong, near 0 weak). Either half can be stated in either wording.',
            P: 'Explains sign or magnitude correctly but not both.',
            I: 'Neither sign nor magnitude is interpreted correctly.'
        },
        commonMistakes: [
            'Confusing sign with strength',
            'Saying positive means the relationship is strong',
            'Ignoring what values near 0 mean',
            'Forgetting that r describes a linear relationship'
        ],
        contextFromVideo: 'The video says negative r values indicate negative correlation, positive r values indicate positive correlation, values closer to 0 are weaker, and values with magnitude closer to 1 are stronger. The attendance example had r = 0.95.'
    },

    reflect2: {
        questionText: 'Why can\'t correlation by itself prove causation or fully describe a scatterplot?',
        expectedElements: [
            { id: 'no-causation', description: 'States that correlation does not imply causation', required: true },
            { id: 'no-form', description: 'Explains that r alone does not tell the form of the relationship', required: true },
            { id: 'no-unusual-features', description: 'Explains that r alone does not show unusual features such as outliers or clusters', required: false },
            { id: 'need-graph-context', description: 'States that you need to look at the scatterplot or consider context to make those judgments', required: false },
            { id: 'attendance-example', description: 'May mention that attendance rose while test scores stayed flat despite a strong positive correlation', required: false }
        ],
        scoringGuide: {
            E: 'States that correlation does not imply causation, and that r alone does not show the form of the relationship (or unusual features), so the scatterplot is still needed.',
            P: 'Gives the no-causation idea but not what r fails to show, or says what r cannot show while treating the relationship as causal.',
            I: 'Neither idea is present: r is treated as both proof of causation and a complete description.'
        },
        commonMistakes: [
            'Using strong correlation as proof of cause and effect',
            'Saying r alone can identify outliers or clusters',
            'Treating r as enough to decide whether a linear model is appropriate',
            'Ignoring the need to inspect the scatterplot'
        ],
        contextFromVideo: 'The lesson ends by saying the sign of r tells direction, the magnitude tells strength, and r alone does not provide enough evidence to describe form or unusual features. It also shows that attendance increased while test scores stayed flat, which warns against causal claims.'
    },

    exitTicket: {
        questionText: 'A teacher recorded hours of tutoring and quiz score for six students, and technology reported r = 0.89. Interpret the sign and strength in context, explain one thing r alone does not tell you, explain why this correlation does not prove causation, and state one reason technology is used to calculate r.',
        expectedElements: [
            { id: 'positive-direction', description: 'Interprets the sign as positive, meaning more tutoring tends to go with higher quiz scores', required: true },
            { id: 'strong-strength', description: 'Interprets the strength as strong because 0.89 is close to 1', required: true },
            { id: 'r-alone-limit', description: 'Explains that r alone does not tell form or unusual features and that you need the scatterplot for that', required: true },
            { id: 'no-causation', description: 'Explains that the correlation does not prove that tutoring caused the higher quiz scores', required: true },
            { id: 'technology-use', description: 'States that technology is usually used because the formula is cumbersome or because it quickly computes r accurately', required: false },
            { id: 'unit-free-range', description: 'May mention that r is unit-free and between -1 and 1', required: false }
        ],
        scoringGuide: {
            E: 'Interprets r = 0.89 as a strong positive linear relationship in context (more tutoring tends to go with higher quiz scores), names one thing r alone does not show (form or unusual features), and explains why it does not prove tutoring causes higher scores. The technology reason strengthens the answer.',
            P: 'Three of the four are correct; one is missing or wrong.',
            I: 'Two or more of the four are missing or wrong.'
        },
        commonMistakes: [
            'Saying 0.89 proves causation',
            'Describing only direction and not strength',
            'Claiming r alone shows the exact shape or unusual features',
            'Forgetting to explain why technology is commonly used'
        ],
        contextFromVideo: 'The video says the sign of r tells direction, the magnitude tells strength, technology usually calculates r, and correlation alone cannot prove causation or describe form and unusual features.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU2L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U2L5[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about correlation (Topic 2.5).

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
window.getRubricU2L5 = function(questionId) {
    return window.RUBRICS_U2L5[questionId] || null;
};
