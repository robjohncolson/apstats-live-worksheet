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
            { id: 'returned-only', description: 'Explains that the sample included only planes that returned from the mission', required: false },
            { id: 'shot-down-excluded', description: 'Notes that planes shot down were left out of the sample', required: true },
            { id: 'not-representative', description: 'Explains that the sample was not representative because the missing planes may have been hit in different spots', required: true },
            { id: 'generalization-risk', description: 'States that generalizing to all hit planes is not appropriate from this sample alone', required: false },
            { id: 'tail-insight', description: 'May mention that missing bullet holes point to vulnerable areas like the tail', required: false }
        ],
        scoringGuide: {
            E: 'Explains that the shot-down planes were left out, so the sample of returning planes is not representative of all hit planes (the missing ones may have been hit elsewhere), which is why generalizing is risky.',
            P: 'Notes the shot-down planes are missing but does not connect that to representativeness / generalization, or the reverse.',
            I: 'Treats the returning planes as if they were all the hit planes, or gives no sample reasoning.'
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
            { id: 'observational-no-treatment', description: 'Explains that observational studies do not impose treatments', required: false },
            { id: 'observational-no-cause', description: 'States that observational studies cannot establish cause and effect', required: true },
            { id: 'experiment-treatment', description: 'Explains that experiments impose treatments or assign different conditions to subjects', required: true },
            { id: 'experiment-causal', description: 'States that a well-designed experiment can support a causal conclusion', required: true },
            { id: 'random-assignment', description: 'May mention random assignment or the resume experiment example', required: false }
        ],
        scoringGuide: {
            E: 'Explains that experiments impose treatments, so a well-designed experiment (random assignment, control of other variables) can support a cause-and-effect conclusion, while observational studies (no treatment imposed) cannot establish causation.',
            P: 'Two of those three ideas are there; one is missing (commonly: says observational studies cannot show cause without saying why a well-designed experiment can).',
            I: 'Claims observational studies can prove cause, or claims any experiment proves cause simply because it imposes a treatment, or does not distinguish the two designs.'
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
            { id: 'observational', description: 'Identifies the study as an observational study because no treatments were imposed and existing records were used', required: false },
            { id: 'generalize-yes', description: 'Explains that generalization to the high school is appropriate because the sample was chosen at random from that population', required: true },
            { id: 'no-causation', description: 'Explains that the study cannot show that sports cause higher GPAs because it is observational', required: true },
            { id: 'confounding', description: 'May mention that other factors could explain GPA differences', required: false }
        ],
        scoringGuide: {
            E: 'Population = all students at that high school; sample = the 120 randomly chosen students; generalizing to the school IS appropriate because the sample was random from it; no causal conclusion because the study is observational (records only, no treatment imposed).',
            P: 'Three of the four are correct; one is missing or wrong.',
            I: 'Two or more of the four are missing or wrong, or the principal is said to be able to conclude that sports cause higher GPAs.'
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
window.getRubricU3L2 = function(questionId) {
    return window.RUBRICS_U3L2[questionId] || null;
};
