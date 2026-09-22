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
            { id: 'both-group', description: 'Explains that both methods begin by dividing the population into groups', required: false },
            { id: 'cluster-select-groups', description: 'States that cluster sampling randomly selects whole clusters or groups', required: true },
            { id: 'cluster-all-members', description: 'Explains that all individuals in the selected clusters are included in the sample', required: true },
            { id: 'stratified-sample-within', description: 'States that stratified sampling takes a simple random sample within each stratum', required: true },
            { id: 'stratified-combine', description: 'Explains that the sampled individuals from all strata are combined into one sample', required: false },
            { id: 'hetero-homo', description: 'May mention that clusters are ideally heterogeneous while strata are ideally homogeneous', required: false }
        ],
        scoringGuide: {
            E: 'Cluster: whole groups are randomly selected and everyone in the chosen groups is included. Stratified: a random sample is taken within every stratum. Combining the strata samples is implied.',
            P: 'Two of the three are correct; one is missing or the two methods are partly swapped.',
            I: 'Treats the two methods as the same, or swaps them.'
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
            { id: 'sample-each-region', description: 'States that stratified sampling takes some homes from each region or stratum', required: false },
            { id: 'cluster-risk', description: 'Explains that a cluster sample could accidentally select only high-income or low-income areas', required: true },
            { id: 'better-estimate', description: 'States that stratified sampling gives a more consistent or more precise estimate because it includes a better mix of incomes', required: true },
            { id: 'harder-to-collect', description: 'Notes that stratified sampling is harder to implement because data must be collected across many regions or with a more complicated procedure', required: false },
            { id: 'low-variability', description: 'May mention lower variability or greater precision directly', required: false }
        ],
        scoringGuide: {
            E: 'Explains that incomes are alike within a region and differ across regions, so a cluster sample could land on only rich or only poor regions, while stratifying guarantees every region is represented and so gives a more reliable estimate. Mentioning the extra collection effort strengthens the answer.',
            P: 'Two of the three are there; one is missing (commonly: no explanation of why clusters are risky here).',
            I: 'Says cluster is better because it is easier, or gives no reason tied to how incomes vary.'
        },
        commonMistakes: [
            'Saying cluster sampling is automatically better because it is easier to collect',
            'Ignoring that incomes vary a lot between neighborhoods',
            'Forgetting that stratified sampling includes people from every group',
            'Saying stratified is better without connecting it to how incomes vary across regions'
        ],
        contextFromVideo: 'The lesson says San Antonio has income segregation, so stratified sampling works well because it takes some homes from every region, while cluster sampling can vary wildly if selected regions are unusually rich or poor.'
    },

    exitTicket: {
        questionText: 'A high school wants to estimate the average number of hours students spend on homework each week. Administrators divide students into 9th-, 10th-, 11th-, and 12th-grade groups. Then they randomly choose 25 students from each grade and survey those students. Identify the population and the sampling method, explain why the method is appropriate, explain why this is not a cluster sample, and describe one disadvantage or challenge of using this method.',
        expectedElements: [
            { id: 'population', description: 'Identifies the population as all students at the high school', required: true },
            { id: 'stratified', description: 'Identifies the sampling method as a stratified random sample', required: true },
            { id: 'strata-grade', description: 'Explains that grade levels are the strata or groups based on a shared characteristic', required: false },
            { id: 'within-each-grade', description: 'States that students are randomly selected within each grade and then combined into one sample', required: false },
            { id: 'appropriate-representation', description: 'Explains that the method is appropriate because it guarantees representation from every grade and homework time may differ by grade', required: true },
            { id: 'not-cluster', description: 'Explains that this is not a cluster sample because not all students in a selected grade are surveyed', required: true },
            { id: 'disadvantage', description: 'Describes one disadvantage such as being harder to organize, more time-consuming, or more complicated to implement', required: true }
        ],
        scoringGuide: {
            E: 'Population = all students at the school; names it a stratified random sample (students chosen at random within each grade, then combined); explains why that is appropriate (every grade represented; homework may differ by grade); explains it is not cluster sampling because not every student in a chosen grade is surveyed; and gives one practical disadvantage.',
            P: 'Four of the five are correct; one is missing or wrong.',
            I: 'Two or more of the five are missing or wrong, or the method is called a cluster sample.'
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
window.getRubricU3L3 = function(questionId) {
    return window.RUBRICS_U3L3[questionId] || null;
};
