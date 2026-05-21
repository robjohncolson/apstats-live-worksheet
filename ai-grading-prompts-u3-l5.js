/**
 * AI Grading Prompts for Unit 3 Lesson 5: Introduction to Experimental Design
 * Topic 3.5: Introduction to Experimental Design
 *
 * Learning Objectives:
 *   Identify the components of an experiment
 *   Describe elements of a well-designed experiment
 *   Compare experimental designs and methods
 *   Explain how confounding affects cause-and-effect conclusions
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L5 = `
VIDEO 1 - Introduction to Experimental Design (~6:21):
- Topic 3.5 focuses on the effect of confounding variables and the basic components of an experiment.
- The opening note-taking example asks whether students who regularly take notes earn higher grades than students who only sit and listen.
- Observing that note-takers earn higher grades does not automatically prove causation.
- A confounding variable is related to the explanatory variable and influences the response variable, possibly creating a false perception of association.
- In the note-taking example, academic motivation could cause students both to take notes and to earn higher grades.
- The video emphasizes that observational studies cannot determine causation because confounding may still be present.
- An experiment intentionally imposes treatments on experimental units.
- If the experimental units are human, they may be called participants or subjects.
- The explanatory variable in an experiment is also called a factor, and its levels are treatments.
- The response variable is the measured outcome of the study.
- Letting students choose whether to take notes would still be a poorly designed experiment because confounding could remain.

VIDEO 2 - Well-Designed Experiments (~6:34):
- A well-designed experiment should include comparison, random assignment, replication, and control.
- Comparison means using at least two treatment groups, possibly including a control group.
- Random assignment or random allotment of treatments helps balance confounding factors across groups.
- Replication means using enough experimental units in each treatment group to see variability among individuals.
- Control means holding potential confounding variables as constant as possible.
- The Botswana cattle experiment tested whether painting eye spots on cattle reduced attacks from predators.
- Cattle were randomly assigned to receive eye spots, cross marks, or remain unmarked.
- None of the 683 cattle with eye spots were attacked, while 4 cross-marked cattle and 19 unmarked cattle were killed.
- The video identifies the cattle study as an experiment because treatments were intentionally imposed and randomly assigned.
- One method of random allocation is to number the units and use a random number generator without replacement to assign units to groups.
- After assigning treatments, researchers compare the response variable across the groups.

VIDEO 3 - Experimental Designs and Methods (~10:13):
- A completely randomized design assigns treatments to all experimental units completely at random.
- Randomization tends to balance the effects of uncontrolled or confounding variables so differences in response can be attributed more fairly to treatments.
- A randomized block design first groups experimental units into blocks that are similar with respect to a blocking variable, then randomizes treatments within each block.
- Blocking helps separate natural variability due to the blocking variable from differences caused by treatments.
- The melanoma example used cancer severity as a possible blocking variable because severity could affect response to treatment.
- A placebo is a fake treatment that is similar to the treatment being tested.
- The placebo effect occurs when experimental units respond to a placebo.
- A single-blind experiment means the subjects do not know which treatment they are receiving, but the researchers do, or vice versa.
- A double-blind experiment means neither the subjects nor the researchers who interact with them know which treatment is being administered.
- Matched pairs design is a special case of a randomized block design in which blocks have size two or each subject receives both treatments in random order.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L5 = {
    reflect1: {
        questionText: 'Students who regularly take notes in AP Statistics tend to earn higher grades than students who do not. Explain why this observational study cannot show that note-taking causes higher grades. Identify the explanatory variable, the response variable, and a possible confounding variable.',
        expectedElements: [
            { id: 'observational', description: 'States that this is an observational study and therefore cannot establish causation', required: true },
            { id: 'explanatory', description: 'Identifies the explanatory variable as whether or not a student takes notes', required: true },
            { id: 'response', description: 'Identifies the response variable as student grades or test scores', required: true },
            { id: 'confounding-variable', description: 'Identifies a possible confounding variable such as academic motivation', required: true },
            { id: 'confounding-explanation', description: 'Explains that the confounding variable affects both note-taking and grades, creating a possible false association', required: true },
            { id: 'motivation-example', description: 'May note that more motivated students may both take notes more often and earn higher grades', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the explanatory and response variables, names a reasonable confounding variable, and explains why the observational study cannot show causation.',
            P: 'Response shows partial understanding of confounding or experimental components but misses one major idea, such as the correct variables, the role of the confounder, or the point about causation.',
            I: 'Response does not correctly explain why the note-taking example cannot establish cause and effect.'
        },
        commonMistakes: [
            'Claiming that higher grades for note-takers prove note-taking causes higher grades',
            'Mixing up the explanatory variable and the response variable',
            'Naming a confounding variable without explaining that it affects both note-taking and grades',
            'Ignoring that the study is observational rather than experimental'
        ],
        contextFromVideo: 'The lesson says academic motivation could cause students both to take notes and to earn higher grades, so the observed relationship in an observational study does not prove causation.'
    },

    reflect2: {
        questionText: 'Explain the difference between a completely randomized design and a randomized block design. Include what blocking does and how treatments are assigned in each design.',
        expectedElements: [
            { id: 'crd-definition', description: 'Defines a completely randomized design as assigning treatments completely at random to all experimental units', required: true },
            { id: 'randomization-benefit', description: 'Explains that randomization helps balance confounding or uncontrolled variables between treatment groups', required: true },
            { id: 'block-definition', description: 'Defines a randomized block design as first grouping similar units into blocks based on a blocking variable', required: true },
            { id: 'within-block-randomization', description: 'Explains that treatments are randomly assigned within each block', required: true },
            { id: 'blocking-purpose', description: 'Explains that blocking helps separate variability due to the blocking variable from treatment differences', required: true },
            { id: 'example', description: 'May use an example such as cancer severity or matched pairs to illustrate blocking', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly distinguishes a completely randomized design from a randomized block design and accurately explains what blocking does and where random assignment occurs.',
            P: 'Response captures part of the distinction but misses one major idea, such as the purpose of blocking or the fact that randomization still happens within blocks.',
            I: 'Response does not correctly distinguish a completely randomized design from a randomized block design.'
        },
        commonMistakes: [
            'Saying that blocks are formed randomly instead of by a relevant variable',
            'Forgetting that treatments are still randomized within each block',
            'Saying that a completely randomized design removes all confounding',
            'Describing blocking without explaining why it helps'
        ],
        contextFromVideo: 'The lesson explains that completely randomized designs assign all units at random, while randomized block designs first group similar units, such as patients with similar cancer severity, and then randomize within those blocks.'
    },

    exitTicket: {
        questionText: 'A dermatologist wants to test whether a new anti-itch cream works better than a placebo cream for patients with eczema. Patients are first separated into two groups based on severity: mild eczema and severe eczema. Within each severity group, patients are randomly assigned to receive either the new cream or an identical-looking placebo cream. Neither the patients nor the nurses who rate the symptoms know which cream each patient receives. Identify the experimental units, identify the explanatory variable, the treatments, and the response variable, explain how blocking and random assignment are used, and identify the control group and why the study is double-blind.',
        expectedElements: [
            { id: 'units', description: 'Identifies the experimental units as the patients with eczema', required: true },
            { id: 'factor', description: 'Identifies the explanatory variable or factor as the type of cream received', required: true },
            { id: 'treatments', description: 'Identifies the treatments as the new anti-itch cream and the placebo cream', required: true },
            { id: 'response', description: 'Identifies the response variable as the measured eczema symptoms, itching, or symptom improvement after treatment', required: true },
            { id: 'blocking', description: 'Explains that patients are blocked by severity, such as mild versus severe eczema', required: true },
            { id: 'within-block-randomization', description: 'Explains that patients are randomly assigned to treatments within each severity block', required: true },
            { id: 'control-group', description: 'Identifies the placebo group as the control group', required: true },
            { id: 'double-blind', description: 'Explains that neither the patients nor the nurses who interact with them know which treatment each patient receives', required: true },
            { id: 'placebo-purpose', description: 'May note that the placebo helps researchers judge whether any effect is due to the treatment rather than the placebo effect', required: false }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the experiment components, explains the blocking and within-block random assignment, identifies the placebo control group, and explains why the design is double-blind.',
            P: 'Response gets most of the design right but misses one major idea, such as the response variable, the role of blocking, the control group, or the explanation of double-blinding.',
            I: 'Response has major errors about the experiment components or the design methods used in the scenario.'
        },
        commonMistakes: [
            'Confusing the blocks with the treatments',
            'Forgetting that random assignment occurs within each severity block',
            'Naming severity as the response variable instead of the blocking variable',
            'Failing to identify the placebo group as the control group',
            'Saying the study is double-blind without mentioning both patients and nurses'
        ],
        contextFromVideo: 'The lesson says blocking groups similar units before randomization, placebos are fake treatments, and double-blind experiments keep both subjects and interacting researchers unaware of treatment assignments.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L5 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L5[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.5: Introduction to Experimental Design

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
window.getRubricU3L5 = function(questionId) {
    return window.RUBRICS_U3L5[questionId] || null;
};
