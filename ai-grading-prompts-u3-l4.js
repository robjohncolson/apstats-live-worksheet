/**
 * AI Grading Prompts for Unit 3 Lesson 4: Potential Problems with Sampling
 * Topic 3.4: Potential Problems with Sampling
 *
 * Learning Objectives:
 *   Identify potential sources of bias in sampling methods
 *   Describe how bias can create overestimates or underestimates
 *   Recognize undercoverage, nonresponse, volunteer response, and survey response bias
 *   Explain why a sample may not be representative of the population
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L4 = `
VIDEO 1 - Potential Problems with Sampling (~6:57):
- Topic 3.4 focuses on potential sources of bias in sampling methods.
- The lesson asks which methods lead to biased estimates, how to describe overestimates and underestimates, and what survey problems can arise.
- A college pamphlet claimed that 99.7% of former students were working full-time in careers of their choice, but the statistic was based only on recent graduates.
- The video points out that only 40% of the incoming freshman class graduated within six years, so students who did not graduate were excluded from the group being described.
- Bias is defined as a systematic tendency to favor certain responses over others.
- Undercoverage bias occurs when part of the population has a reduced chance of being included in the sample.
- The college example shows undercoverage because nongraduates were left out.
- Nonresponse bias occurs when individuals chosen for the sample do not respond and those nonrespondents differ from the respondents.
- In the internship example, a random sample of students was surveyed but only 10% responded.
- The AP-style method for explaining bias is to identify the population and sample, explain how the sample may differ from the population, and state whether the estimate is likely an overestimate or underestimate.
- In the internship example, students without paid internships may be less likely to respond, so the reported 85% with internships is likely an overestimate.
- Volunteer response bias occurs when invitations are sent to all individuals and the people who volunteer differ from those who do not.
- The running-study advertisement example shows that a study advertised as being about running may attract people who already enjoy running, which could overestimate the true proportion of all people who enjoy running.
- The lesson advises that even if the exact vocabulary label is unclear, students should still describe how the bias arises and the likely direction of the bias.
- Question wording bias occurs when survey questions are confusing or leading.
- Self-reported response bias occurs when individuals inaccurately report their own traits or behaviors.
- The final takeaway is that strong bias explanations describe how the sample systematically differs from the population and how that affects the estimate.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L4 = {
    reflect1: {
        questionText: 'A university randomly selects students and emails them a survey asking whether they found a paid summer internship. Only 10% respond. Explain why this could lead to nonresponse bias. Identify the population, the sample, and whether the result is likely too high or too low.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at the university', required: true },
            { id: 'sample', description: 'Identifies the sample as the students who responded to the survey', required: true },
            { id: 'nonresponse', description: 'Explains that this is nonresponse bias because many selected students did not respond', required: true },
            { id: 'different-responders', description: 'Explains that respondents may differ from nonrespondents, such as students without internships being less likely to respond', required: true },
            { id: 'overestimate', description: 'States that the reported percentage with internships is likely an overestimate of the true percentage', required: true },
            { id: 'underrepresented', description: 'May note that students without internships are underrepresented in the responses', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the population and sample, explains why nonresponse creates bias, and states that the internship rate is likely overestimated.',
            P: 'Response shows partial understanding of nonresponse bias but misses one major idea, such as the correct sample, how respondents differ, or the direction of the bias.',
            I: 'Response does not correctly explain why this survey could produce nonresponse bias.'
        },
        commonMistakes: [
            'Calling the sample all selected students instead of the students who actually responded',
            'Ignoring that students without internships may respond at lower rates',
            'Saying the result is unbiased just because the original selection was random',
            'Leaving out whether the estimate is likely too high or too low'
        ],
        contextFromVideo: 'The lesson says only 10% of selected students responded to the internship survey, and students without paid internships may be less likely to respond, making the reported percentage an overestimate.'
    },

    reflect2: {
        questionText: 'Describe the difference between undercoverage bias and volunteer response bias. Explain how each one makes the sample differ from the population and how either could lead to a distorted estimate.',
        expectedElements: [
            { id: 'undercoverage-definition', description: 'Defines undercoverage bias as part of the population having a reduced chance of being included', required: true },
            { id: 'volunteer-definition', description: 'Defines volunteer response bias as people choosing themselves to participate', required: true },
            { id: 'undercoverage-difference', description: 'Explains that undercoverage can leave out a subgroup whose responses differ from the rest of the population', required: true },
            { id: 'volunteer-difference', description: 'Explains that volunteer response can overrepresent people with stronger interest, stronger opinions, or more favorable attitudes', required: true },
            { id: 'direction', description: 'States that either bias can distort the estimate by causing an overestimate or underestimate because the sample is not representative', required: true },
            { id: 'example', description: 'May reference an example such as nongraduates being excluded or runners volunteering', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes undercoverage from volunteer response bias and explains how each can make the sample unrepresentative and distort the estimate.',
            P: 'Response captures part of the difference between the two biases but misses one major distinction or leaves out how the estimate gets distorted.',
            I: 'Response does not correctly distinguish undercoverage bias from volunteer response bias.'
        },
        commonMistakes: [
            'Treating undercoverage and volunteer response as the same thing',
            'Defining volunteer response bias as simply low response rate',
            'Forgetting to explain how the sample differs from the population',
            'Leaving out that the bias changes the direction of the estimate'
        ],
        contextFromVideo: 'The lesson contrasts undercoverage, where part of the population is left out, with volunteer response, where volunteers may differ from nonvolunteers. In both cases the sample can systematically differ from the population.'
    },

    exitTicket: {
        questionText: 'A city wants to estimate the proportion of all residents who support adding more bike lanes. Officials mail every household a card that says, "Complete our survey if you support this important plan to make our streets safer by adding more bike lanes." Residents may choose whether to respond online. Identify the population and the sample, identify one source of sampling bias and its likely direction, identify one source of response bias in the wording, and describe one change that would improve the study.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all city residents', required: true },
            { id: 'sample', description: 'Identifies the sample as the residents who choose to respond to the survey', required: true },
            { id: 'volunteer-bias', description: 'Identifies volunteer or voluntary response bias because people choose whether to respond', required: true },
            { id: 'overestimate', description: 'Explains that support for bike lanes is likely overestimated because supporters may be more likely to respond', required: true },
            { id: 'wording-bias', description: 'Identifies question wording bias because words like "important" and "safer" are leading', required: true },
            { id: 'improvement', description: 'Suggests an improvement such as taking a random sample of residents or using neutral wording', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the population and sample, explains the voluntary response bias and likely overestimate, identifies the leading wording, and suggests a reasonable improvement.',
            P: 'Response gets most of the scenario right but misses one major idea, such as the correct sample, the likely direction of the bias, the wording problem, or a useful improvement.',
            I: 'Response has major errors about the population, sample, source of bias, or the survey wording problem.'
        },
        commonMistakes: [
            'Calling the sample all residents instead of only the people who respond',
            'Saying the survey is random because every household got the invitation',
            'Missing that supporters may be more likely to respond than opponents',
            'Ignoring the leading words in the survey question',
            'Suggesting an improvement without addressing either sampling or wording'
        ],
        contextFromVideo: 'The lesson says volunteer response bias happens when people choose themselves to participate and may differ from the population, and question wording bias happens when survey wording is leading or confusing.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L4 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L4[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.4: Potential Problems with Sampling

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
window.getRubricU3L4 = function(questionId) {
    return window.RUBRICS_U3L4[questionId] || null;
};
