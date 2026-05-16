/**
 * AI Grading Prompts for Unit 1 Lesson 6: Topic 1.6
 * Topic 1.6: Describing the Distribution of a Quantitative Variable
 *
 * Learning Objectives:
 *   Identify the four characteristics used to describe a quantitative distribution
 *   Use vocabulary such as symmetric, skewed left, skewed right, unimodal, bimodal, and uniform to describe shape
 *   Describe center as the typical response and variability as the spread of the distribution
 *   Identify unusual features such as outliers, gaps, and clusters
 *   Describe a quantitative distribution in context
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U1L6 = `
VIDEO 1 - Describing the Distribution of a Quantitative Variable (~6:28):
- The lesson asks how to describe the distribution of a quantitative variable.
- Students are told that there are four important characteristics to include in a description: shape, center, variability or spread, and unusual features.
- Shape vocabulary includes symmetric, skewed left, skewed right, unimodal, bimodal, and uniform.
- A symmetric distribution has left and right sides that are roughly mirror images.
- A skewed-left distribution has a longer tail on the left, while a skewed-right distribution has a longer tail on the right.
- A unimodal distribution has one peak, and a bimodal distribution has two peaks.
- A uniform distribution has about the same frequency across values.
- Center answers the question of which value best describes the typical response.
- Variability answers whether the values are packed close together or spread out.
- Unusual features include outliers, gaps, and clusters.
- The main example uses Flint water crisis lead-level data from 71 water samples.
- In the Flint example, the distribution is described as unimodal and skewed right.
- The center of the Flint distribution is described as about 3 to 4 parts per billion.
- The variability is described generally by noting the values range from 0 to 104 parts per billion.
- The Flint data also show a cluster between 0 and 10, a gap between 42 and 104, and some high outliers.
- The lesson emphasizes that students should always include context when describing a distribution, such as saying the distribution of lead levels rather than using shape words alone.
- The key takeaway is that strong descriptions combine statistical vocabulary with context and address shape, center, variability, and unusual features.
`;

// Rubrics for each reflection question
window.RUBRICS_U1L6 = {
    reflect1: {
        questionText: 'What four characteristics should you include when describing the distribution of quantitative data?',
        expectedElements: [
            { id: 'shape', description: 'Names shape as one of the four characteristics', required: true },
            { id: 'center', description: 'Names center as one of the four characteristics', required: true },
            { id: 'variability', description: 'Names variability or spread as one of the four characteristics', required: true },
            { id: 'unusual-features', description: 'Names unusual features as one of the four characteristics', required: true },
            { id: 'brief-meaning', description: 'May briefly explain one or more characteristics, such as center meaning typical value or unusual features meaning outliers, gaps, and clusters', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies shape, center, variability or spread, and unusual features as the four characteristics, and may briefly explain what they mean.',
            P: 'Response identifies some of the four characteristics but leaves out or confuses at least one major part.',
            I: 'Response does not correctly identify the four characteristics used to describe a quantitative distribution.'
        },
        commonMistakes: [
            'Leaving out variability or unusual features',
            'Replacing one of the four characteristics with a graph type like histogram',
            'Using only one or two of the four terms',
            'Giving vague statements without naming the actual four characteristics'
        ],
        contextFromVideo: 'The video explicitly says there are four characteristics to include: shape, center, variability, and unusual features.'
    },

    reflect2: {
        questionText: 'Why should you include context when describing a distribution, and what might that sound like in a complete sentence?',
        expectedElements: [
            { id: 'name-variable', description: 'Explains that context means naming the variable or situation being described, not just listing shape words', required: true },
            { id: 'why-context-matters', description: 'Explains that context makes the description clearer and more meaningful', required: true },
            { id: 'example-sentence', description: 'Gives or describes an example of a contextualized sentence, such as saying the distribution of lead levels is skewed right', required: true },
            { id: 'feature-in-context', description: 'May include a specific characteristic such as shape, center, or unusual features inside the contextualized sentence', required: false }
        ],
        scoringGuide: {
            E: 'Response explains that context means naming the real variable or situation, explains why this improves clarity, and gives a reasonable example of a complete sentence in context.',
            P: 'Response shows some understanding of context, but does not clearly explain why it matters or does not provide a strong example sentence.',
            I: 'Response does not correctly explain the role of context when describing a distribution.'
        },
        commonMistakes: [
            'Saying context is optional',
            'Giving only shape words like skewed right without naming the variable',
            'Not explaining why context helps',
            'Giving an example sentence with no actual context or variable'
        ],
        contextFromVideo: 'Luke Wilcox points out that he said the distribution of lead levels and emphasizes that students should always include context when describing a distribution.'
    },

    exitTicket: {
        questionText: 'A trainer recorded the number of minutes 15 athletes spent stretching before practice one afternoon: 4, 5, 5, 6, 6, 6, 7, 7, 8, 8, 9, 10, 10, 18, 22. Describe the shape using appropriate vocabulary, give a reasonable center in context, describe the variability or spread, identify any unusual features, and write one complete sentence describing the distribution in context.',
        expectedElements: [
            { id: 'shape-description', description: 'Describes the distribution as unimodal and skewed right, or otherwise clearly notes one main peak with a longer right tail', required: true },
            { id: 'center-description', description: 'Gives a reasonable typical value around 7 or 8 minutes in context', required: true },
            { id: 'variability-description', description: 'Describes the spread, such as values ranging from 4 to 22 minutes or noting the distribution is spread out by the high values', required: true },
            { id: 'unusual-features', description: 'Identifies unusual features such as a cluster from about 4 to 10, a gap before the high values, or possible high outliers at 18 and 22', required: true },
            { id: 'context-sentence', description: 'Writes about minutes spent stretching by athletes in a complete sentence or otherwise clearly includes context', required: true }
        ],
        scoringGuide: {
            E: 'Response gives a reasonable shape description, center, spread, and unusual features, and does so in context for the athletes stretching data.',
            P: 'Response gets much of the description right but misses or confuses one major component such as shape, center, spread, unusual features, or context.',
            I: 'Response has major errors or omissions in describing the distribution of the stretching-time data.'
        },
        commonMistakes: [
            'Ignoring the long right tail created by 18 and 22',
            'Choosing a center far from the main cluster of values',
            'Describing only shape and leaving out spread or unusual features',
            'Forgetting to write in context about athletes and stretching time',
            'Calling the distribution symmetric even though the high values stretch the right side'
        ],
        contextFromVideo: 'The lesson models a full description by addressing shape, center, variability, and unusual features, and by stating the answer in context.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU1L6 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U1L6[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about describing the distribution of a quantitative variable (Topic 1.6).

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
window.getRubricU1L6 = function(questionId) {
    return window.RUBRICS_U1L6[questionId] || null;
};
