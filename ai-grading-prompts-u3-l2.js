/**
 * AI Grading Prompts for Unit 3 Lesson 2: Introduction to Planning a Study
 * Topic 3.2: Introduction to Planning a Study
 *
 * Learning Objectives:
 *   Distinguish between a population and a sample
 *   Identify observational studies and experiments
 *   Explain when generalization to a population is appropriate
 *   Explain why observational studies cannot establish cause and effect
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L2 = `
VIDEO 1 - Introduction to Planning a Study (~8:03):
- The lesson introduces Topic 3.2 on planning studies and focuses on the types of conclusions different studies allow.
- Students are told they will learn the difference between a population and a sample, the difference between observational studies and experiments, and what conclusions can be drawn from each.
- The video revisits Abraham Wald's airplane example and explains that the charted planes were only the planes that returned from missions.
- Because the visible bullet holes came from returning planes, Wald concluded that armor should go where the fewest bullet holes appeared, especially the tail.
- The lesson uses this example to define a population as all individuals of interest and a sample as a subset of that population.
- Wald's sample did not represent all hit planes because planes shot down were excluded and probably were hit in different locations.
- The video states that generalizations are appropriate only when samples are randomly selected or otherwise representative of the population.
- A sample is only generalizable to the population from which it was selected; the lima bean versus black bean example is used to show that one population does not automatically describe another.
- The racial income gap example is presented using survey data and possible explanations such as school inequity, family connections, and direct discrimination.
- These possible explanations are described as confounding factors.
- The survey example is identified as an observational study because no treatments were imposed.
- The video distinguishes retrospective studies, which examine existing or past data, from prospective studies, which follow individuals into the future.
- The resume study is presented as an experiment because researchers randomly assigned employers identical resumes with different name types.
- In an experiment, treatments are imposed on subjects, and a well-designed experiment can determine a causal relationship.
- The closing summary says that observational studies cannot establish cause and effect, but representative samples can support generalization to a population.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L2 = {
    reflect1: {
        questionText: 'Why is it risky to generalize from the returning planes in Wald\'s sample to all hit planes?',
        expectedElements: [
            { id: 'returned-only', description: 'Explains that the sample included only planes that returned from the mission', required: true },
            { id: 'shot-down-excluded', description: 'Notes that planes shot down were left out of the sample', required: true },
            { id: 'not-representative', description: 'Explains that the sample was not representative because the missing planes may have been hit in different spots', required: true },
            { id: 'generalization-risk', description: 'States that generalizing to all hit planes is not appropriate from this sample alone', required: true },
            { id: 'tail-insight', description: 'May mention that missing bullet holes point to vulnerable areas like the tail', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that only returning planes were sampled, shot-down planes were excluded, the sample was not representative, and generalizing to all hit planes is risky.',
            P: 'Response shows partial understanding of the sample problem in Wald\'s example but misses one major idea, such as who was left out or why that hurts generalization.',
            I: 'Response does not correctly explain why Wald\'s sample should not be generalized to all hit planes.'
        },
        commonMistakes: [
            'Saying the sample included all planes that were hit',
            'Ignoring the planes that were shot down',
            'Not connecting representativeness to whether generalization is appropriate',
            'Focusing only on where armor should go without explaining the sample problem'
        ],
        contextFromVideo: 'The video says the returning planes formed a non-random sample and that planes shot down were likely hit in different locations, so the sample was not representative of all hit planes.'
    },

    reflect2: {
        questionText: 'How do observational studies and experiments differ in the kinds of conclusions they allow statisticians to make?',
        expectedElements: [
            { id: 'observational-no-treatment', description: 'Explains that observational studies do not impose treatments', required: true },
            { id: 'observational-no-cause', description: 'States that observational studies cannot establish cause and effect', required: true },
            { id: 'experiment-treatment', description: 'Explains that experiments impose treatments or assign different conditions to subjects', required: true },
            { id: 'experiment-causal', description: 'States that a well-designed experiment can support a causal conclusion', required: true },
            { id: 'random-assignment', description: 'May mention random assignment or the resume experiment example', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly contrasts observational studies and experiments by treatment use and correctly states that only well-designed experiments can support causal conclusions.',
            P: 'Response identifies some difference between observational studies and experiments but leaves out one major conclusion idea, such as the lack of causation in observational studies or the role of imposed treatments.',
            I: 'Response does not correctly distinguish the two study types or the conclusions they allow.'
        },
        commonMistakes: [
            'Claiming observational studies can prove cause and effect',
            'Failing to mention imposed treatments in experiments',
            'Describing an experiment as just a larger or more careful observational study',
            'Talking only about generalization without addressing causation'
        ],
        contextFromVideo: 'The lesson says the income-gap survey was observational because no treatments were imposed, while the resume study was an experiment because name type was imposed on employers through randomly assigned resumes.'
    },

    exitTicket: {
        questionText: 'A principal wants to study whether students who participate in sports tend to have higher GPAs. She uses school records to look at 120 students chosen at random from her high school and compares the GPAs of athletes and nonathletes. Identify the population and sample, identify the study type, explain whether generalization to the school is appropriate, and explain whether a causal conclusion can be made.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at that high school', required: true },
            { id: 'sample', description: 'Identifies the sample as the 120 randomly chosen students from the high school', required: true },
            { id: 'observational', description: 'Identifies the study as an observational study because no treatments were imposed and existing records were used', required: true },
            { id: 'generalize-yes', description: 'Explains that generalization to the high school is appropriate because the sample was chosen at random from that population', required: true },
            { id: 'no-causation', description: 'Explains that the study cannot show that sports cause higher GPAs because it is observational', required: true },
            { id: 'confounding', description: 'May mention that other factors could explain GPA differences', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the population and sample, classifies the study as observational, explains why generalization to the school is appropriate, and states that no causal conclusion can be made.',
            P: 'Response gets most of the scenario right but misses one major idea, such as the observational study classification, the reason generalization is allowed, or the lack of causal inference.',
            I: 'Response has major errors about the population, sample, study type, generalization, or causal conclusion.'
        },
        commonMistakes: [
            'Confusing the sample with the population',
            'Calling the study an experiment because two groups are being compared',
            'Ignoring that the sample was randomly selected from the high school',
            'Claiming the principal can conclude sports cause higher GPAs',
            'Forgetting that observational studies may have confounding variables'
        ],
        contextFromVideo: 'Topic 3.2 says generalization is appropriate when a sample is randomly selected or otherwise representative of the population, but observational studies cannot determine causal relationships.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L2 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L2[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.2: Introduction to Planning a Study

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
    "score": "E", "P", or "I", // EXACTLY one uppercase letter -- no words, no lowercase, no extra text
    "feedback": "brief explanation of the score",
    "matched": ["list of required elements the student addressed"],
    "missing": ["list of required elements the student missed"],
    "suggestion": "one specific thing the student could add to improve their answer"
}`;
};

// Get rubric for a question (used by appeal system)
window.getRubricU3L2 = function(questionId) {
    return window.RUBRICS_U3L2[questionId] || null;
};
