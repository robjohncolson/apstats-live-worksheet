/**
 * AI Grading Prompts for Unit 3 Lesson 1: Introducing Statistics: Do the Data We Collected Tell the Truth?
 * Topic 3.1: Introducing Statistics: Do the Data We Collected Tell the Truth?
 *
 * Learning Objectives:
 *   Identify questions to ask about how data were collected
 *   Explain why data collection context matters when analyzing results
 *   Recognize when a sample may not represent the whole population
 *   Explain why methods that do not rely on chance can lead to untrustworthy conclusions
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L1 = `
VIDEO 1 - Introducing Statistics: Do the Data We Collected Tell the Truth? (~2:15):
- The lesson opens Unit 3 by asking whether the data we collect tell the truth and by focusing on the challenges of collecting data in an unbiased way.
- Students are told they should learn what problems may arise when collecting samples, how the way data are collected informs analysis, and what to be wary of during data collection.
- Abraham Wald is introduced as a statistician who worked for the Statistical Research Group during World War II.
- The main example is the Wald airplane problem: British bombers returned from missions with bullet holes, and leaders wanted to know where extra bullet-resistant armor should be placed.
- Soldiers made bullet-hole charts only for the planes that came back from the bombing missions.
- Wald's key insight was to notice the context in which the data were collected: the sample included only surviving planes, not planes that were shot down.
- The visible bullet holes show places where planes could take hits and still make it back.
- Therefore, the better place for extra armor is likely where bullet holes were not seen, because those may be the vulnerable areas on planes that never returned.
- The lesson emphasizes that a proper analysis of data must take into account how the data were collected.
- Samples may not be representative of the whole population, so statisticians must consider how sampled individuals may differ from those not sampled.
- The AP framework statement for this topic is that methods for data collection that do not rely on chance result in untrustworthy conclusions.
- The closing reminder is to be critical, cautious, compassionate, and avoid bad statistics.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L1 = {
    reflect1: {
        questionText: 'Why does the Wald airplane example show that the context of data collection matters?',
        expectedElements: [
            { id: 'returned-planes', description: 'Explains that the data came only from planes that returned from the mission', required: true },
            { id: 'missing-planes', description: 'Notes that planes shot down were not included in the sample', required: true },
            { id: 'vulnerable-areas', description: 'Explains that missing bullet holes may point to vulnerable areas where armor is needed', required: true },
            { id: 'analysis-depends', description: 'May state that the way data are collected changes how the data should be analyzed', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that the sample only included returning planes, that planes shot down were left out, and that this changes the conclusion about where armor should go.',
            P: 'Response shows partial understanding of the Wald example but misses one major piece, such as who was left out or why missing bullet holes matter.',
            I: 'Response does not correctly explain why the data collection context changes the conclusion.'
        },
        commonMistakes: [
            'Saying the sample included all planes from the missions',
            'Focusing only on where bullet holes were seen without discussing the missing planes',
            'Not explaining why areas without bullet holes might be the vulnerable spots',
            'Talking about war history without connecting it to data collection'
        ],
        contextFromVideo: 'The video says the bullet-hole charts came only from planes that made it back, so the missing planes must be considered when deciding where extra armor belongs.'
    },

    reflect2: {
        questionText: 'What questions should a statistician ask about a sample before trusting conclusions drawn from it?',
        expectedElements: [
            { id: 'who-sampled', description: 'Asks who was included in the sample', required: true },
            { id: 'who-missed', description: 'Asks who was left out or how unsampled individuals might differ', required: true },
            { id: 'chance-method', description: 'Asks whether the sample was collected using chance or random selection', required: true },
            { id: 'representative', description: 'Asks whether the sample is representative of the population', required: true },
            { id: 'untrustworthy', description: 'May mention that nonchance methods can lead to untrustworthy conclusions', required: false }
        ],
        scoringGuide: {
            E: 'Response identifies the key questions about inclusion, exclusion, chance selection, and representativeness before trusting a sample.',
            P: 'Response identifies some useful questions about the sample but leaves out one or more major ideas, such as chance selection or representativeness.',
            I: 'Response does not show a clear understanding of what should be checked about a sample before trusting conclusions.'
        },
        commonMistakes: [
            'Only asking whether the sample size is large enough',
            'Ignoring who was left out of the sample',
            'Not mentioning whether the sample was chosen by chance',
            'Assuming any collected sample automatically represents the population'
        ],
        contextFromVideo: 'The lesson ends by warning that samples may not be representative and that methods that do not rely on chance lead to untrustworthy conclusions.'
    },

    exitTicket: {
        questionText: 'A principal wants to know whether students at a high school support a later school start time. She posts a survey link on the student council Instagram page, and 82% of respondents say they support the change. Identify the population and the sample, explain why the data may not tell the truth about the whole school, describe how respondents might differ from nonrespondents, and suggest a better chance-based sampling method.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at the high school', required: true },
            { id: 'sample', description: 'Identifies the sample as the students who responded to the Instagram survey', required: true },
            { id: 'nonchance', description: 'Explains that the method is not based on chance or is a voluntary response sample', required: true },
            { id: 'difference', description: 'Explains that respondents may differ from nonrespondents, such as being more engaged, more opinionated, or more likely to follow student council social media', required: true },
            { id: 'better-method', description: 'Suggests a random or chance-based method for selecting students from the whole school', required: true },
            { id: 'trust-conclusion', description: 'States that the reported 82% may not be trustworthy or representative of the whole school', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the population and sample, explains why the voluntary Instagram survey is a nonchance method, describes how respondents may differ, suggests a random sample, and states that the result may not represent the whole school.',
            P: 'Response gets most of the situation right but misses one or two major pieces, such as the population, the nonchance problem, or the better sampling method.',
            I: 'Response has major errors about the population, sample, or why the survey method could lead to untrustworthy conclusions.'
        },
        commonMistakes: [
            'Confusing the sample with the population',
            'Treating the Instagram survey as random just because many students could see it',
            'Failing to explain how respondents might differ from students who did not respond',
            'Suggesting a better survey without using chance or random selection',
            'Assuming 82% must reflect the whole school'
        ],
        contextFromVideo: 'The AP framework for Topic 3.1 says that data collection methods that do not rely on chance result in untrustworthy conclusions, and the Wald example shows why who gets left out matters.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L1 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L1[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.1: Introducing Statistics: Do the Data We Collected Tell the Truth?

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
window.getRubricU3L1 = function(questionId) {
    return window.RUBRICS_U3L1[questionId] || null;
};
