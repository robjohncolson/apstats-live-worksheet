/**
 * AI Grading Prompts for Unit 1 Lesson 1: Topic 1.1
 * Topic 1.1: Topic 1.1
 *
 * Learning Objectives:
 *   Identify the question to be answered or the problem to be solved in context
 *   Explain how statistics can answer real-world questions using data that vary
 *   Recognize the variable in one-variable data
 *   Use data displays and percentages to answer a contextual question
 *   Interpret a decision using a threshold in context
 *   Describe the process of asking questions, collecting data, analyzing data, and interpreting results
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L1 = `
VIDEO 1 - Introducing Statistics (~6:40):
- The lesson opens by asking, "What can we learn from data?"
- Two main goals are introduced: identify the question or problem in a given context, and explain how statistics can help answer important real-world questions based on data that vary.
- The main example is the Flint water crisis in Flint, Michigan.
- In April 2014, the city switched its water supply from Lake Huron to the Flint River to save money.
- Residents reported that the water looked, smelled, and tasted bad, and some developed rashes, hair loss, or itchy skin.
- A key statistical question in the context is: Was Flint's water safe to drink?
- City officials collected data by measuring lead levels in 71 water samples from Flint residents between January and June 2015.
- The variable is lead level measured in parts per billion, and the data varied from 0 to 104 parts per billion.
- Lead levels greater than 15 parts per billion were considered extremely unhealthy.
- The rule in the example was that if more than 10% of samples exceeded 15 parts per billion, the water was deemed not safe to drink.
- In the full sample of 71 water samples, 8 exceeded 15 parts per billion.
- That proportion was 8/71 = 0.113, or 11.3%, so based on the full sample the water was not safe to drink.
- City officials then omitted two samples from the analysis: one business sample with a lead level of 20 parts per billion and one home sample with a lead level of 104 parts per billion.
- After omitting those two samples, 6 of the remaining 69 samples exceeded 15 parts per billion.
- That proportion was 6/69 = 0.087, or 8.7%, which is below the 10% threshold, so officials declared the water safe to drink.
- Later, Virginia Tech researchers conducted a more thorough study and found about 17% of samples above 15 parts per billion.
- Pediatrician Mona Hanna-Attisha found that elevated blood lead levels in children had doubled since the water source switch.
- The lesson ends by summarizing the statistical process: ask questions, collect data, analyze data, and interpret the results.
- A major takeaway is that statistics helps answer real-world questions when data vary, but conclusions depend on how the data are analyzed and interpreted.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L1 = {
    reflect1: {
        questionText: 'Why is "Was Flint\'s water safe to drink?" a statistical question instead of something answered by checking just one house?',
        expectedElements: [
            { id: 'variation', description: 'Explains that the lead levels vary from one water sample or house to another', required: true },
            { id: 'many-samples', description: 'Explains that you need data from many samples rather than just one house', required: true },
            { id: 'overall-population-question', description: 'Explains that the question is about Flint water in general or the overall safety of the water supply, not one individual house', required: true },
            { id: 'threshold-link', description: 'May mention using the percent above the threshold to answer the question', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that the data vary, that one sample is not enough, and that the question concerns the overall water supply rather than a single house.',
            P: 'Response shows some understanding of why the question is statistical, but misses one key idea such as variation, the need for many samples, or the overall context.',
            I: 'Response does not correctly explain why the question requires data and variability rather than a single observation.'
        },
        commonMistakes: [
            'Saying one sample is enough to answer the question',
            'Ignoring that lead levels vary from place to place',
            'Describing the question as only about one home instead of the broader water supply',
            'Giving a conclusion about safety without explaining why the question is statistical'
        ],
        contextFromVideo: 'The video emphasizes that statistical questions are answered using data that vary, and the Flint example uses 71 water samples rather than one reading.'
    },

    reflect2: {
        questionText: 'How did omitting the two water samples change the conclusion, and what does that show about analyzing data carefully?',
        expectedElements: [
            { id: 'percent-change', description: 'Explains that the percent above 15 parts per billion changed from 11.3% to 8.7% when the two samples were removed', required: true },
            { id: 'conclusion-change', description: 'Explains that the conclusion changed from not safe to safe because the percent moved from above the 10% threshold to below it', required: true },
            { id: 'careful-analysis', description: 'Explains that removing data can change the result, so data must be analyzed carefully and responsibly', required: true },
            { id: 'ethical-angle', description: 'May mention that selective omission can be misleading or unfair', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly explains how the omitted samples changed both the percent and the conclusion, and clearly states why careful analysis of all relevant data matters.',
            P: 'Response identifies part of the change in percent or conclusion, but does not clearly explain both the numerical change and why careful data analysis matters.',
            I: 'Response does not correctly explain how omitting the samples affected the conclusion or what that shows about working with data.'
        },
        commonMistakes: [
            'Failing to mention that the percent dropped below the 10% cutoff',
            'Ignoring that the conclusion changed from unsafe to safe',
            'Saying the omitted points did not matter',
            'Missing the idea that selective data removal can change or distort a conclusion'
        ],
        contextFromVideo: 'The Flint example shows that using all 71 samples gave 11.3% above the threshold, while removing two samples produced 8.7%, which changed the decision.'
    },

    exitTicket: {
        questionText: 'A school district tests 50 classroom drinking fountains for lead. District leaders say the water system is unsafe if more than 12% of samples are above 15 parts per billion. In the sample, 7 fountains are above 15 parts per billion. State a sensible statistical question and identify the variable, calculate the percent above 15 parts per billion, decide whether the system would be considered safe, and explain how statistics helps answer the question when the data vary.',
        expectedElements: [
            { id: 'statistical-question', description: 'States a sensible statistical question such as whether the district water system is safe or whether more than 12% of fountains exceed 15 parts per billion', required: true },
            { id: 'variable', description: 'Identifies the variable as lead level in the classroom drinking fountains, measured in parts per billion', required: true },
            { id: 'percent-calculation', description: 'Calculates that 7 out of 50 is 0.14 or 14%', required: true },
            { id: 'decision', description: 'Concludes that the system would be considered unsafe or that action is needed because 14% is greater than the 12% threshold', required: true },
            { id: 'variation-and-statistics', description: 'Explains that statistics uses data from many fountains because the lead levels vary from fountain to fountain', required: true },
            { id: 'process-language', description: 'May mention asking a question, collecting data, analyzing the percent, and interpreting the result', required: false }
        ],
        scoringGuide: {
            E: 'Response states a sensible statistical question, identifies the variable, calculates 14%, concludes the system is unsafe because 14% > 12%, and explains that statistics is needed because the data vary across fountains.',
            P: 'Response gets most major pieces correct but misses or confuses one part, such as the variable, the percent, the threshold comparison, or the explanation of why statistics is needed.',
            I: 'Response has major errors in the calculation or conclusion, or does not show understanding of the role of variation and data in answering the question.'
        },
        commonMistakes: [
            'Using the wrong percent for 7 out of 50',
            'Saying the system is safe even though 14% is greater than 12%',
            'Not identifying the variable in context',
            'Failing to explain that data vary from fountain to fountain',
            'Treating the question as answerable from one fountain instead of many samples'
        ],
        contextFromVideo: 'The lesson uses the Flint water crisis to show how a real-world safety question is answered by collecting data, finding the percent above a threshold, and interpreting the result in context.'
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

    return `You are grading an AP Statistics student's response about Topic 1.1.

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
