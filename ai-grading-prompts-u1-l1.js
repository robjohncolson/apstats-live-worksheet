/**
 * AI Grading Prompts for Unit 1 Lesson 1: Topic 1.1
 * Topic 1.1: Topic 1.1
 *
 * Learning Objectives:
 *   Identify the question to be answered or problem to be solved in context
 *   Recognize how statistics helps answer real-world questions based on data that vary
 *   Identify questions based on variation in one-variable data
 *   Explain why numbers become meaningful when placed in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L1 = `
VIDEO 1 - Introducing Statistics: What Can We Learn from Data? (~6:40):
- The video introduces two main goals: identifying the question to be answered or problem to be solved in a context, and using statistics to answer important real-world questions based on data that vary.
- The lesson example is the Flint water crisis in Flint, Michigan.
- In April 2014, Flint switched its water source from Lake Huron to the Flint River to save money.
- Residents reported that the water looked, smelled, and tasted bad, while city officials claimed it was safe to drink.
- The central statistical question was: Was Flint's water safe to drink?
- City officials collected lead-level data from 71 water samples taken between January and June 2015.
- The lead levels ranged from 0 parts per billion to 104 parts per billion.
- Lead levels above 15 parts per billion were considered extremely unhealthy.
- The rule in this context was that if more than 10% of water samples exceeded 15 parts per billion, the water would be deemed not safe to drink.
- In the full sample, 8 of 71 samples exceeded 15 parts per billion, which is 0.113 or 11.3%, so the water was not safe to drink.
- City officials omitted two samples, one at 20 parts per billion and one at 104 parts per billion.
- With those two samples removed, 6 of 69 samples exceeded 15 parts per billion, which is 0.087 or 8.7%, and officials used that result to declare the water safe.
- Later, Virginia Tech researchers found that about 17% of samples were above the action threshold.
- The video closes by summarizing the statistical process: ask questions, collect data, analyze data, and interpret results.
- A key AP Statistics idea in Topic 1.1 is that numbers convey meaningful information only when they are placed in context.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L1 = {
    reflect1: {
        questionText: 'Why does a number like 15 parts per billion or 11.3% only become meaningful when it is placed in context?',
        expectedElements: [
            { id: 'needs-context', description: 'Explains that a number by itself does not mean much unless we know what is being measured or described', required: true },
            { id: 'units-or-variable', description: 'Identifies the context as lead level in water samples or mentions units such as parts per billion or percent of samples', required: true },
            { id: 'links-to-question', description: 'Connects the number to the real question of whether Flint\'s water was safe to drink or whether the threshold was exceeded', required: true },
            { id: 'threshold-idea', description: 'May mention that 15 ppb and 11.3% matter because they can be compared to a cutoff or threshold', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that numbers need context, identifies what the numbers refer to, and connects them to the question or decision about water safety.',
            P: 'Response shows some understanding of context but does not clearly explain what the numbers refer to or how they help answer the question.',
            I: 'Response does not explain why context matters for interpreting the numbers.'
        },
        commonMistakes: [
            'Saying the number speaks for itself without needing context',
            'Mentioning the number but not what it measures',
            'Failing to connect the number to the question about safe drinking water',
            'Ignoring the role of units or percent in the interpretation'
        ],
        contextFromVideo: 'The video emphasizes that numbers such as 15 parts per billion and 11.3% become useful only when tied to the variable, the threshold, and the question of whether the water was safe to drink.'
    },

    reflect2: {
        questionText: 'How did removing two water samples change the conclusion, and what does that show about using statistics responsibly?',
        expectedElements: [
            { id: 'changed-percent', description: 'Explains that the percent above 15 ppb changed from 11.3% (8 of 71) to 8.7% (6 of 69)', required: true },
            { id: 'changed-conclusion', description: 'States that the conclusion changed from not safe to safe when the two samples were removed', required: true },
            { id: 'responsible-use', description: 'Explains that leaving out relevant data can change results and that statistics should be used honestly and carefully', required: true },
            { id: 'real-consequences', description: 'May note that these choices can affect real people and real decisions', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains how the omitted samples changed both the percentage and the conclusion, and it clearly connects that change to responsible use of data.',
            P: 'Response describes either the numerical change or the idea of responsible data use, but not both clearly and completely.',
            I: 'Response does not correctly explain how removing the samples changed the result or what that implies.'
        },
        commonMistakes: [
            'Stating that the omitted points did not affect the conclusion',
            'Mentioning only that two points were removed without describing the new percentages',
            'Ignoring that the conclusion changed from unsafe to safe',
            'Failing to address why data should be handled responsibly'
        ],
        contextFromVideo: 'In the video, removing the 20 ppb and 104 ppb readings changed the percent above the threshold from 11.3% to 8.7%, which changed the water-safety conclusion.'
    },

    exitTicket: {
        questionText: 'A school health office records the number of hours of sleep the night before a big exam for a random sample of 30 students. The principal wants to know whether too little sleep is a concern for these students. The data show that 9 of the 30 students got fewer than 6 hours of sleep. Identify the question, describe the variable and variation, explain why 30% is meaningful only in context, and describe how statistics could help answer the question.',
        expectedElements: [
            { id: 'question-in-context', description: 'Identifies a sensible question in context, such as whether too many students are getting too little sleep before the exam', required: true },
            { id: 'variable', description: 'Describes the variable as the number of hours of sleep the night before the exam', required: true },
            { id: 'variation', description: 'Explains that the data vary because different students got different amounts of sleep', required: true },
            { id: 'context-for-30', description: 'Explains that 9 out of 30, or 30%, is meaningful because it describes the proportion of sampled students who got fewer than 6 hours of sleep', required: true },
            { id: 'statistics-process', description: 'Describes how statistics can help by collecting data, analyzing the data, and interpreting the results to answer the principal\'s question', required: true }
        ],
        scoringGuide: {
            E: 'Response identifies the question, correctly describes the variable and variation, explains the meaning of 30% in context, and describes the basic statistical process for answering the principal\'s question.',
            P: 'Response includes several correct ideas but misses one major component, such as the context for 30% or the explanation of variation.',
            I: 'Response omits multiple required components or does not show understanding of the lesson focus on context and one-variable data.'
        },
        commonMistakes: [
            'Giving a number without explaining what it represents',
            'Failing to identify the variable clearly',
            'Not explaining what variation means in the data',
            'Leaving out the role of collecting, analyzing, and interpreting data'
        ],
        contextFromVideo: 'The Flint example shows that a useful statistical response begins with a question, uses one-variable data, interprets numbers in context, and then uses data analysis to support a conclusion.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L1[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 1.1: introducing statistics and what we can learn from data.

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
window.getRubricU1L1 = function(questionId) {
    return window.RUBRICS_U1L1[questionId] || null;
};
