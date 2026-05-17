/**
 * AI Grading Prompts for Unit 3 Lesson 3: Random Sampling and Data Collection
 * Topic 3.3: Random Sampling and Data Collection
 *
 * Learning Objectives:
 *   Identify common random sampling methods
 *   Describe how a simple random sample is selected
 *   Distinguish cluster, stratified, and systematic sampling
 *   Explain why a sampling method is or is not appropriate
 */

// Lesson context from video transcripts for AI grading
window.LESSON_CONTEXT_U3L3 = `
VIDEO 1 - Random Sampling and Data Collection (~9:05):
- Topic 3.3 focuses on random sampling and data collection.
- The lesson introduces why statisticians use random samples and how to collect simple random, stratified, cluster, and systematic samples.
- The San Antonio example is used because household incomes are economically segregated: incomes are similar within neighborhoods but vary a lot between neighborhoods.
- Because income is typically right-skewed, the video uses the median rather than the mean to describe household income.
- A census collects data from all individuals in the population, but censuses are hard to carry out for large populations.
- A random sample is easier to collect than a census and, if done well, should be representative of the population.
- A simple random sample (SRS) is a sample in which every group of a given size has an equal chance of being chosen.
- One way to select an SRS is to number all households and use a random number generator to choose households without replacement.
- The simulated SRS of San Antonio households looked representative, but it would be difficult to collect data from homes spread all across the city.
- A cluster random sample divides the population into nearby clusters, randomly selects entire clusters, and includes all individuals in the selected clusters.
- A stratified random sample divides the population into strata based on a similar characteristic and takes a simple random sample within each stratum.
- The video emphasizes that cluster and stratified sampling both use groups, but cluster sampling selects whole groups while stratified sampling samples within every group.
- Cluster sampling ideally uses heterogeneous clusters, while stratified sampling ideally uses homogeneous strata.
- A systematic random sample uses a random starting point and a fixed periodic interval, such as surveying every 20th student in line.
- The closing summary says random samples tend to provide representative samples, an SRS gives every group of n an equal chance, cluster sampling samples entire groups, and stratified sampling samples within groups.

VIDEO 2 - Sampling Advantages and Disadvantages (~7:42):
- The second video compares the advantages and disadvantages of the different random sampling methods from the San Antonio example.
- The three main sample median estimates were about $50,500 for the SRS, $110,000 for the cluster sample, and $51,025 for the stratified sample, compared with a true median near $51,000.
- A non-random sample can systematically miss the truth, showing why random sampling matters.
- A simple random sample is easy to explain and tends to be unbiased, but it can be difficult to implement when sampled homes are spread out.
- Cluster sampling can be easier to perform because data are collected in only a few selected areas.
- Cluster sampling can have very high variability if clusters are homogeneous within themselves and very different from one another.
- Cluster sampling works best when clusters are heterogeneous within and similar to one another.
- Stratified sampling tends to work well when strata are homogeneous and can produce low variability because each sample includes some observations from each group.
- Stratified sampling can give more precise estimates in the San Antonio example because it captures a similar mix of neighborhoods each time.
- A disadvantage of stratified sampling is that it can be difficult and complicated to implement.
- The closing takeaway is that different random sampling methods have different strengths and weaknesses depending on the population and the question being studied.
`;

// Rubrics for each reflection question
window.RUBRICS_U3L3 = {
    reflect1: {
        questionText: 'Explain the difference between cluster sampling and stratified sampling. Include what gets randomly selected and what happens after the selection.',
        expectedElements: [
            { id: 'both-group', description: 'Explains that both methods begin by dividing the population into groups', required: true },
            { id: 'cluster-select-groups', description: 'States that cluster sampling randomly selects whole clusters or groups', required: true },
            { id: 'cluster-all-members', description: 'Explains that all individuals in the selected clusters are included in the sample', required: true },
            { id: 'stratified-sample-within', description: 'States that stratified sampling takes a simple random sample within each stratum', required: true },
            { id: 'stratified-combine', description: 'Explains that the sampled individuals from all strata are combined into one sample', required: true },
            { id: 'hetero-homo', description: 'May mention that clusters are ideally heterogeneous while strata are ideally homogeneous', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly explains that cluster sampling randomly selects whole groups and includes everyone in them, while stratified sampling takes samples within every stratum and combines those sampled individuals.',
            P: 'Response shows partial understanding of the difference between cluster and stratified sampling but leaves out one major step, such as what is randomly selected or who ends up in the sample.',
            I: 'Response does not correctly distinguish cluster sampling from stratified sampling.'
        },
        commonMistakes: [
            'Saying cluster and stratified sampling are the same because both use groups',
            'Claiming that stratified sampling selects entire strata',
            'Claiming that cluster sampling samples only some people within each selected cluster',
            'Leaving out what happens after the groups are chosen'
        ],
        contextFromVideo: 'The lesson says cluster sampling takes an SRS of groups and then samples all individuals in the selected groups, while stratified sampling takes an SRS within each group and combines those individuals into the sample.'
    },

    reflect2: {
        questionText: 'Why might a stratified random sample give a better estimate than a cluster sample in the San Antonio income example, even though it may be harder to collect?',
        expectedElements: [
            { id: 'segregation-pattern', description: 'Explains that incomes are similar within regions or neighborhoods and different across regions because of economic segregation', required: true },
            { id: 'sample-each-region', description: 'States that stratified sampling takes some homes from each region or stratum', required: true },
            { id: 'cluster-risk', description: 'Explains that a cluster sample could accidentally select only high-income or low-income areas', required: true },
            { id: 'better-estimate', description: 'States that stratified sampling gives a more consistent or more precise estimate because it includes a better mix of incomes', required: true },
            { id: 'harder-to-collect', description: 'Notes that stratified sampling is harder to implement because data must be collected across many regions or with a more complicated procedure', required: true },
            { id: 'low-variability', description: 'May mention lower variability or greater precision directly', required: false }
        ],
        scoringGuide: {
            E: 'Response clearly connects San Antonio\'s income segregation to why stratified sampling gives a better mix of incomes and more consistent estimates, while also noting that it is harder to carry out.',
            P: 'Response explains part of why stratified sampling may be better than cluster sampling but misses one major idea, such as the neighborhood income pattern, the cluster risk, or the practical difficulty.',
            I: 'Response does not correctly explain why stratified sampling would be preferred in this situation.'
        },
        commonMistakes: [
            'Saying cluster sampling is automatically better because it is easier to collect',
            'Ignoring that incomes vary a lot between neighborhoods',
            'Forgetting that stratified sampling includes people from every group',
            'Not mentioning the practical difficulty of carrying out the stratified sample'
        ],
        contextFromVideo: 'The lesson says San Antonio has income segregation, so stratified sampling works well because it takes some homes from every region, while cluster sampling can vary wildly if selected regions are unusually rich or poor.'
    },

    exitTicket: {
        questionText: 'A high school wants to estimate the average number of hours students spend on homework each week. Administrators divide students into 9th-, 10th-, 11th-, and 12th-grade groups. Then they randomly choose 25 students from each grade and survey those students. Identify the population and the sampling method, explain why the method is appropriate, explain why this is not a cluster sample, and describe one disadvantage or challenge of using this method.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at the high school', required: true },
            { id: 'stratified', description: 'Identifies the sampling method as a stratified random sample', required: true },
            { id: 'strata-grade', description: 'Explains that grade levels are the strata or groups based on a shared characteristic', required: true },
            { id: 'within-each-grade', description: 'States that students are randomly selected within each grade and then combined into one sample', required: true },
            { id: 'appropriate-representation', description: 'Explains that the method is appropriate because it guarantees representation from every grade and homework time may differ by grade', required: true },
            { id: 'not-cluster', description: 'Explains that this is not a cluster sample because not all students in a selected grade are surveyed', required: true },
            { id: 'disadvantage', description: 'Describes one disadvantage such as being harder to organize, more time-consuming, or more complicated to implement', required: true }
        ],
        scoringGuide: {
            E: 'Response correctly identifies the population and the stratified random sample, explains why the method is appropriate, explains why it is not a cluster sample, and gives a reasonable disadvantage or challenge.',
            P: 'Response gets most of the scenario right but misses one major idea, such as why the method is stratified, why it is appropriate, why it is not cluster sampling, or a legitimate disadvantage.',
            I: 'Response has major errors about the population, sampling method, appropriateness, or comparison to cluster sampling.'
        },
        commonMistakes: [
            'Calling the method a cluster sample just because students are grouped by grade',
            'Forgetting to identify the population as the whole high school',
            'Not explaining that students are sampled within each grade',
            'Ignoring why representation from every grade could matter',
            'Leaving out any disadvantage or challenge of stratified sampling'
        ],
        contextFromVideo: 'Topic 3.3 says a stratified random sample divides the population into homogeneous groups, takes a simple random sample within each group, and combines those sampled individuals. It is different from cluster sampling, which samples all individuals in selected groups.'
    }
};

// Build reflection prompt for AI grading
window.buildReflectionPromptU3L3 = function(questionId, studentAnswer) {
    const rubric = window.RUBRICS_U3L3[questionId];
    if (!rubric) return '';

    const requiredElements = rubric.expectedElements
        .filter(e => e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    const optionalElements = rubric.expectedElements
        .filter(e => !e.required)
        .map((e, i) => `${i + 1}. ${e.description}`)
        .join('\n');

    return `You are grading an AP Statistics student's response about Topic 3.3: Random Sampling and Data Collection

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
window.getRubricU3L3 = function(questionId) {
    return window.RUBRICS_U3L3[questionId] || null;
};
