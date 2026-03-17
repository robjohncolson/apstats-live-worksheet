// AI Grading Prompts for Edgar's Unit 6 Conceptual Driller
// From Sample Proportions to Population Proportions — Bottom-Up First Principles

window.LESSON_CONTEXT_EDGAR_U6 = `
This is a bottom-up conceptual driller that builds inference for proportions from first principles.
It is NOT a video follow-along. It is a deliberate pedagogical expansion of the standard 4-phase Unit 6 study plan,
starting one layer earlier with sampling distributions and building through all of Unit 6 (Topics 6.1-6.11).

Key concepts tested at AP FRQ level:
- Population proportion p vs sample proportion p-hat vs hypothesized p0 vs pooled p-hat-c
- Sampling distribution: centered at p, spread sqrt(p(1-p)/n), approximately normal if Large Counts met
- Three conditions: Random, 10%, Large Counts
- THE CRITICAL DISTINCTION: CI checks Large Counts with p-hat; significance test checks with p0
- CI interpretation: "We are C% confident..." (never probability language)
- p-value interpretation: assumes H0 is true
- Conclusion language: reject/fail to reject (never "accept H0")
- Type I error = false positive (prob = alpha); Type II = false negative (prob = 1-power)
- Two-proportion CI uses separate p-hats; two-proportion test pools because H0 assumes equality
`;

const RUBRICS_EDGAR_U6 = {
    reflect_vocab: {
        questionText: "For the germination scenario (seed company claims 90%, botanist observes 80% in a random sample), identify: (a) the population, (b) the parameter p, (c) the sample, (d) the statistic p-hat. Then explain in a paragraph: what is the difference between a parameter and a statistic? Use the words 'population', 'sample', and 'unknown truth'.",
        expectedElements: [
            { id: "population-id", description: "Identifies population as all seeds of this type (from the company)", required: true },
            { id: "parameter-id", description: "Identifies p as the true proportion of all seeds that germinate", required: true },
            { id: "sample-id", description: "Identifies the sample as the specific random sample of seeds the botanist tested", required: true },
            { id: "statistic-id", description: "Identifies p-hat as 0.80, the proportion that germinated in the sample", required: true },
            { id: "param-vs-stat", description: "Explains that a parameter is a fixed but unknown truth about the population, while a statistic is calculated from a sample and varies from sample to sample", required: true },
            { id: "p-hat-in-hypotheses", description: "Notes or implies that hypotheses use p (parameter), not p-hat (statistic)", required: false }
        ],
        scoringGuide: {
            E: "Correctly identifies all four elements (population, p, sample, p-hat) with context, and writes a clear paragraph distinguishing parameters (fixed, unknown, about the population) from statistics (calculated, varies, from the sample).",
            P: "Identifies most elements correctly but is vague on one (e.g., says 'the seeds' without specifying all seeds vs the sample), or the paragraph is correct but lacks clarity or context.",
            I: "Confuses population with sample, confuses p with p-hat, or the paragraph shows fundamental misunderstanding of the parameter/statistic distinction."
        },
        commonMistakes: [
            "Saying the population is 'the sample of seeds' instead of all seeds of this type",
            "Listing p = 0.80 (that's p-hat) or p = 0.90 (that's p0, the claimed value)",
            "Saying 'a parameter is a number' without explaining it's about the population and is unknown",
            "Failing to mention that statistics vary from sample to sample"
        ],
        contextFromVideo: "The population is all seeds of this type. p = true germination rate for all seeds (unknown). Sample = the specific seeds the botanist tested. p-hat = 0.80 (observed rate). p0 = 0.90 (the company's claim, used in hypotheses). Parameters are fixed unknowns about populations; statistics are calculated from samples and vary."
    },

    reflect_conditions: {
        questionText: "For a significance test with H0: p = 0.60, sample size n = 40, and observed p-hat = 0.45: (a) What two Large Counts products must be checked? (b) Which value — p0 or p-hat — belongs in those checks? Explain WHY in your own words. Then complete: 'For a confidence interval, the large-counts check uses ___. For a significance test, the large-counts check uses ___, because ___.''",
        expectedElements: [
            { id: "two-products", description: "States the two products: np0 = 40(0.60) = 24 and n(1-p0) = 40(0.40) = 16", required: true },
            { id: "uses-p0", description: "States that p0 (not p-hat) belongs in the check for a significance test", required: true },
            { id: "why-p0", description: "Explains WHY: because the test assumes H0 is true, so we check whether the sampling distribution under H0 is approximately normal — and under H0, p = p0", required: true },
            { id: "ci-uses-phat", description: "States that a CI uses p-hat because we don't have a hypothesized value — we're estimating p, so our best available value is p-hat", required: true },
            { id: "fill-in-sentence", description: "Correctly completes: CI uses p-hat, test uses p0, because the test assumes the null is true", required: true }
        ],
        scoringGuide: {
            E: "Correctly computes both products using p0 = 0.60 (not p-hat = 0.45), clearly explains that tests use p0 because they operate under the assumption H0 is true, and correctly distinguishes CI (uses p-hat) from test (uses p0) with reasoning.",
            P: "Gets the correct value (p0) but explanation is vague or incomplete (e.g., 'because that's the rule' without explaining the H0 assumption), or correctly explains reasoning but makes an arithmetic error.",
            I: "Uses p-hat = 0.45 in the Large Counts check, or cannot explain why tests and CIs use different values, or fundamentally confuses the two procedures."
        },
        commonMistakes: [
            "Computing 40(0.45) = 18 and 40(0.55) = 22 instead of 40(0.60) = 24 and 40(0.40) = 16",
            "Saying 'use p0 because the formula says so' without connecting to the H0 assumption",
            "Confusing the CI and test checks — saying CI uses p0",
            "Not explaining that 'assuming H0 is true' is the key reason p0 is used"
        ],
        contextFromVideo: "For a significance test: Large Counts check uses p0 because we are assuming H0: p = p0 is true. Under that assumption, the sampling distribution is centered at p0, so we check np0 >= 10 and n(1-p0) >= 10. For a CI: no hypothesized value exists, so we use p-hat (our best estimate) to check np-hat >= 10 and n(1-p-hat) >= 10. This is the #1 student error on the AP exam."
    },

    reflect_ci: {
        questionText: "A random sample of 1,000 people in the United States found that 37% said American football was their favorite sport to watch on television. (a) Construct a 95% confidence interval for the population proportion. Show your work. (b) Interpret the interval in context. (c) Explain why the statement 'There is a 95% probability that p is in this interval' is not a correct interpretation.",
        expectedElements: [
            { id: "phat-calc", description: "Identifies p-hat = 0.37 and n = 1000", required: true },
            { id: "ci-formula", description: "Uses correct formula: 0.37 +/- 1.96 * sqrt(0.37 * 0.63 / 1000)", required: true },
            { id: "ci-result", description: "Calculates approximately (0.340, 0.400) or equivalent", required: true },
            { id: "correct-interpretation", description: "Writes 'We are 95% confident that the interval from ___ to ___ captures the proportion of all people in the United States who say American football is their favorite sport to watch on television'", required: true },
            { id: "no-probability", description: "Explains that p is a fixed (not random) value — the interval either contains p or it doesn't. The 95% refers to the long-run success rate of the method across many samples, not a probability for any specific interval.", required: true }
        ],
        scoringGuide: {
            E: "Correctly constructs the CI with proper formula and arithmetic, interprets using confidence language with full context (population + variable), and clearly explains why probability language is wrong (p is fixed, the method is random).",
            P: "Constructs CI correctly but interpretation lacks full context, or explanation of probability error is vague (e.g., 'it's just not how confidence works' without explaining fixed p vs random method).",
            I: "Uses wrong z* or wrong SE formula, interprets with probability language, or cannot explain the distinction between confidence and probability."
        },
        commonMistakes: [
            "Using z* = 2.576 (99%) instead of 1.96 (95%)",
            "Using p0 in the SE instead of p-hat (this is a CI, not a test)",
            "Interpreting as 'There is a 95% chance...' or '95% of the data falls in...'",
            "Not naming the population (all people in the US) or the variable (favorite sport) in the interpretation",
            "Saying the parameter 'moves around' — it's fixed"
        ],
        contextFromVideo: "CI formula: p-hat +/- z* * sqrt(p-hat(1-p-hat)/n). For 95%, z* = 1.96. Here: 0.37 +/- 1.96 * sqrt(0.37*0.63/1000) = 0.37 +/- 0.030 = (0.340, 0.400). Interpretation must say 'confident' not 'probability.' The 95% is about the method's long-run capture rate. A specific interval either has p in it (prob 1) or doesn't (prob 0)."
    },

    reflect_test: {
        questionText: "In a region, 30% of bats have wingspans greater than 10 inches. In a random sample of 80 bats from outside the region, 20 had wingspans greater than 10 inches. (a) State p-hat, p0, and n. (b) Compute the one-sample z-test statistic. Show the formula with numbers substituted. (c) The p-value is 0.164. Write a correct interpretation of this p-value assuming the null is true. (d) At alpha = 0.05, state the formal decision and contextual conclusion.",
        expectedElements: [
            { id: "identify-values", description: "p-hat = 20/80 = 0.25, p0 = 0.30, n = 80", required: true },
            { id: "z-formula", description: "z = (0.25 - 0.30) / sqrt(0.30 * 0.70 / 80) — uses p0 in denominator, not p-hat", required: true },
            { id: "z-calc", description: "Computes z approximately equal to -0.976 or -0.98", required: true },
            { id: "pvalue-interp", description: "Interprets p-value: 'Assuming the true proportion of bats outside the region with wingspan > 10 in is 0.30, there is a 0.164 probability of observing a sample proportion as extreme as or more extreme than 0.25'", required: true },
            { id: "decision", description: "Since 0.164 > 0.05, fail to reject H0", required: true },
            { id: "conclusion-context", description: "There is not convincing evidence that the proportion of bats outside the region with wingspan > 10 inches is different from 0.30", required: true },
            { id: "no-accept", description: "Does NOT say 'accept H0' or 'prove H0 is true'", required: false }
        ],
        scoringGuide: {
            E: "Correctly identifies all three values, writes the z-formula with p0 in the denominator, computes z correctly, interprets the p-value by stating it assumes H0, makes the correct decision, and states the conclusion in context without 'accept H0.'",
            P: "Gets most steps correct but has one error: e.g., uses p-hat in the denominator, or interprets p-value without mentioning the H0 assumption, or says 'accept H0' in conclusion.",
            I: "Multiple errors: wrong formula, p-value interpreted as probability H0 is true, incorrect decision, or conclusion not in context."
        },
        commonMistakes: [
            "Using p-hat = 0.25 in the denominator instead of p0 = 0.30",
            "Interpreting p-value as 'the probability that H0 is true'",
            "Saying 'we accept H0' instead of 'we fail to reject H0'",
            "Forgetting to state the conclusion in context (just saying 'fail to reject' without mentioning bats)",
            "Getting the direction of the z-score wrong (should be negative since 0.25 < 0.30)"
        ],
        contextFromVideo: "z = (p-hat - p0) / sqrt(p0(1-p0)/n) = (0.25 - 0.30) / sqrt(0.30*0.70/80) = -0.05/0.0512 = -0.976. The SE uses p0 because under H0 we assume p = 0.30. p-value interpretation must begin with 'Assuming H0 is true' or equivalent. Conclusion: since p-value > alpha, fail to reject. Never say 'accept H0.'"
    },

    reflect_errors: {
        questionText: "Researchers are testing whether a new machine improves precision (H0: the machine does NOT improve precision). (a) Describe what a Type I error would mean in this context. (b) Describe what a Type II error would mean. (c) The researchers care more about missing a real improvement. Which type of error is that? (d) Give two ways to reduce the chance of that error. (e) Explain the tradeoff: what happens to Type I error risk if you take steps to reduce Type II error?",
        expectedElements: [
            { id: "type1-context", description: "Type I: concluding the machine improves precision when it actually does not (false alarm / rejecting a true H0)", required: true },
            { id: "type2-context", description: "Type II: failing to detect a real improvement — concluding there is not enough evidence when the machine actually does improve precision (missed signal)", required: true },
            { id: "identify-type2", description: "Missing a real improvement = Type II error", required: true },
            { id: "reduce-type2", description: "Two ways: increase sample size, increase alpha (significance level), or note that SE decreasing or true parameter being farther from null also helps", required: true },
            { id: "tradeoff", description: "Explains: increasing alpha to reduce Type II error also increases the chance of Type I error. With fixed sample size, reducing one type of error increases the other.", required: true }
        ],
        scoringGuide: {
            E: "Correctly describes both errors in the machine context, identifies Type II as the concern, gives two valid ways to reduce it, and clearly explains the alpha tradeoff (reducing Type II risk increases Type I risk when n is fixed).",
            P: "Describes both errors but one is vague or not fully in context, or identifies the correct error but gives only one way to reduce it, or explains the tradeoff incompletely.",
            I: "Confuses Type I and Type II, cannot identify which error corresponds to missing a real improvement, or gives incorrect methods for reducing the error."
        },
        commonMistakes: [
            "Swapping Type I and Type II definitions",
            "Describing errors abstractly without connecting to the machine context",
            "Saying 'increase sample size' without explaining why it helps (more data = more power = lower Type II risk)",
            "Forgetting that the tradeoff exists — implying you can reduce both errors simultaneously without changing n",
            "Saying 'decrease alpha' reduces Type II (it's the opposite)"
        ],
        contextFromVideo: "Type I = reject H0 when true (false alarm, prob = alpha). Type II = fail to reject H0 when false (missed signal, prob = 1-power). Missing a real improvement = Type II. Reduce Type II by: (1) increase n, (2) increase alpha, (3) decrease SE, (4) true param farther from null. Tradeoff: increasing alpha reduces Type II but increases Type I."
    },

    reflect_twoprop: {
        questionText: "Two independent random samples are taken to compare support for a proposal: District A (35/50 support) and District B (36/60 support). (a) Why does a two-proportion z-test use the pooled proportion p-hat-c in its standard error? (b) Why would it be logically wrong to pool when constructing a confidence interval for p_A - p_B? Write a short paragraph explaining the distinction.",
        expectedElements: [
            { id: "why-pool-test", description: "Explains: In a test, H0 says p_A = p_B, so under H0 both populations have the same proportion. Combining the samples gives a better estimate of that shared proportion.", required: true },
            { id: "why-not-pool-ci", description: "Explains: A CI does not assume the proportions are equal — in fact, the whole point is to estimate how different they might be. Pooling would contradict the goal of the CI.", required: true },
            { id: "pooled-formula", description: "Mentions or implies p-hat-c = (n1*p-hat1 + n2*p-hat2) / (n1 + n2) or total successes / total n", required: false },
            { id: "logical-distinction", description: "Articulates the core logic: test assumes equality (so pool), CI estimates difference (so keep separate)", required: true }
        ],
        scoringGuide: {
            E: "Clearly explains that pooling is justified in a test because H0 assumes equal proportions, and that pooling is wrong in a CI because a CI does not assume equality — it estimates the difference. The paragraph demonstrates understanding of the logical connection between the null hypothesis and the choice to pool.",
            P: "States the correct rule (pool for test, don't pool for CI) but the explanation of WHY is incomplete or circular (e.g., 'because the formula says so').",
            I: "Cannot distinguish when to pool vs. not pool, or gives incorrect reasoning (e.g., 'pool for CI because we want a better estimate')."
        },
        commonMistakes: [
            "Saying 'pool for both' or 'pool for neither'",
            "Explaining the rule without connecting to the H0 assumption",
            "Saying 'we pool to get a larger sample size' (the reason is the H0 equality assumption, not sample size)",
            "Confusing the CI standard error formula with the test standard error formula"
        ],
        contextFromVideo: "Two-prop test: H0 says p1 = p2, so under H0 one shared proportion exists. Pool to estimate it: p-hat-c = (35+36)/(50+60) = 71/110. Two-prop CI: no equality assumption. Use separate p-hats in SE formula. The null hypothesis is the logical reason for pooling."
    },

    capstone1: {
        questionText: "A fair die has probability 1/6 of landing on 6. Students bake a die, let it cool with 6 face up, then roll it 200 times. The number 6 appears 43 times.\n(a) Define the parameter p in context.\n(b) Compute p-hat.\n(c) A 95% CI gives (0.158, 0.272). Interpret this interval. Does it provide evidence the baked die lands on 6 more than a fair die? Explain using 1/6.\n(d) A test of H0: p = 1/6 vs Ha: p > 1/6 gives z = 1.83 and p-value = 0.033. State the formal decision at alpha = 0.05, the contextual conclusion, and a correct interpretation of the p-value.\n(e) Do the CI and the test agree? Explain why they should.\n(f) Describe Type I and Type II errors in this context.",
        expectedElements: [
            { id: "define-p", description: "p = the true proportion of times the baked die lands on 6", required: true },
            { id: "compute-phat", description: "p-hat = 43/200 = 0.215", required: true },
            { id: "ci-interpret", description: "We are 95% confident that (0.158, 0.272) captures the true proportion of times the baked die lands on 6", required: true },
            { id: "ci-vs-1over6", description: "Since 1/6 ≈ 0.167 IS in the interval, the CI does NOT provide convincing evidence — or: since most values are above 1/6, there is some suggestion but 1/6 is plausible", required: true },
            { id: "decision", description: "p-value 0.033 < 0.05, so reject H0", required: true },
            { id: "conclusion-context", description: "There is convincing evidence that the baked die lands on 6 more often than a fair die", required: true },
            { id: "pvalue-interp", description: "Assuming the baked die lands on 6 with probability 1/6, there is a 0.033 probability of getting a sample proportion of 0.215 or higher in 200 rolls", required: true },
            { id: "ci-test-agree", description: "Explains that CI and test may give slightly different signals here because the CI is two-sided and the test is one-sided, but both address the same underlying question", required: true },
            { id: "type1", description: "Type I: concluding the baked die is biased toward 6 when it is actually fair", required: true },
            { id: "type2", description: "Type II: failing to detect that the baked die is biased toward 6 when it actually is", required: true }
        ],
        scoringGuide: {
            E: "Addresses all parts with correct notation, proper interpretation language, correct decision, and both errors described in context. Shows clear understanding of how CI and test relate.",
            P: "Gets most parts correct but has 1-2 errors: e.g., says 'accept H0' somewhere, interprets p-value without assuming H0, or gives errors without context.",
            I: "Multiple fundamental errors: wrong decision, probability language in CI interpretation, cannot describe errors in context, or confuses p-hat with p0."
        },
        commonMistakes: [
            "Defining p as 'the probability of rolling a 6' without specifying the BAKED die",
            "Saying the CI 'proves' the die is biased",
            "Interpreting p-value as probability H0 is true",
            "Saying 'accept H0' when p-value > alpha",
            "Not recognizing the CI/test tension (CI contains 1/6 but test rejects at 0.05)",
            "Describing Type I/II errors abstractly without the die context"
        ],
        contextFromVideo: "This is a full capstone integrating one-proportion CI, one-proportion test, p-value interpretation, conclusion language, and error types. The subtle point: the 95% CI (0.158, 0.272) contains 1/6 ≈ 0.167, so the CI alone does not give convincing evidence at 95% — but the one-sided test at alpha 0.05 does reject. This is because a two-sided CI at 95% corresponds to a two-sided test at alpha 0.05, not a one-sided test."
    },

    capstone2: {
        questionText: "Two independent random samples compare support for a proposal: District A (35/50) and District B (36/60).\n(a) Define the two parameters in context.\n(b) Write H0 and Ha for testing whether support rates differ.\n(c) Compute p-hat-A, p-hat-B, and the pooled proportion p-hat-c.\n(d) Check conditions for a two-sample z-test.\n(e) Write the test statistic formula with numbers substituted in.\n(f) Suppose the p-value is greater than 0.05. State the formal decision, contextual conclusion, and what a matching CI for p_A - p_B should contain.",
        expectedElements: [
            { id: "define-params", description: "p_A = true proportion of all District A voters who support; p_B = true proportion of all District B voters who support", required: true },
            { id: "hypotheses", description: "H0: p_A = p_B (or p_A - p_B = 0); Ha: p_A ≠ p_B (or p_A - p_B ≠ 0)", required: true },
            { id: "compute-phats", description: "p-hat-A = 35/50 = 0.70, p-hat-B = 36/60 = 0.60, p-hat-c = 71/110 ≈ 0.645", required: true },
            { id: "check-conditions", description: "Random (both independent random samples), 10% (both samples < 10% of populations, assumed), Large Counts using pooled: n1*pc, n1*(1-pc), n2*pc, n2*(1-pc) all >= 10", required: true },
            { id: "test-stat-formula", description: "z = (0.70 - 0.60) / sqrt(0.645 * 0.355 * (1/50 + 1/60)) with correct pooled proportion", required: true },
            { id: "decision-ftreject", description: "Since p-value > 0.05, fail to reject H0", required: true },
            { id: "conclusion-nodiff", description: "There is not convincing evidence of a difference in the proportions of voters supporting the proposal in Districts A and B", required: true },
            { id: "ci-contains-zero", description: "A corresponding CI for p_A - p_B should contain 0, consistent with failing to reject H0", required: true }
        ],
        scoringGuide: {
            E: "Correctly defines both parameters in context, writes proper hypotheses, computes pooled proportion, checks all conditions using the pooled value, writes the correct test statistic formula, and draws the right conclusion with the CI-zero connection.",
            P: "Gets most steps right but has 1-2 errors: e.g., checks Large Counts with separate p-hats instead of pooled, or writes correct conclusion but forgets context, or doesn't connect the CI to containing 0.",
            I: "Multiple fundamental errors: uses p-hat instead of pooled in conditions or formula, hypotheses about p-hat instead of p, incorrect conclusion, or cannot connect CI and test results."
        },
        commonMistakes: [
            "Using separate p-hats in the test SE instead of pooled p-hat-c",
            "Checking Large Counts with p-hat-A and p-hat-B instead of p-hat-c",
            "Writing hypotheses about p-hat instead of p",
            "Saying 'accept H0' instead of 'fail to reject'",
            "Not connecting the fail-to-reject decision to the CI containing 0",
            "Forgetting to define parameters in context (just saying 'p1 and p2' without the voting context)"
        ],
        contextFromVideo: "Two-prop test: H0: pA = pB, Ha: pA ≠ pB. Pool: pc = (35+36)/(50+60) = 71/110 ≈ 0.645. Check Large Counts with pc. z = (0.70-0.60)/sqrt(0.645*0.355*(1/50+1/60)). If p-value > 0.05, fail to reject. A CI for pA-pB that contains 0 is consistent with this decision."
    }
};

window.getRubricEdgarU6 = function(questionId) {
    return RUBRICS_EDGAR_U6[questionId] || null;
};

window.buildReflectionPromptEdgarU6 = function(questionId, studentAnswer) {
    const rubric = RUBRICS_EDGAR_U6[questionId];
    if (!rubric) return null;

    const requiredElements = rubric.expectedElements.filter(e => e.required).map(e => e.description);
    const optionalElements = rubric.expectedElements.filter(e => !e.required).map(e => e.description);

    return `You are an AP Statistics teacher grading a student's response using the AP FRQ E/P/I rubric.

QUESTION: ${rubric.questionText}

STUDENT'S ANSWER: ${studentAnswer}

LESSON CONTEXT: ${rubric.contextFromVideo}

SCORING RUBRIC (AP FRQ Style):
- E (Essentially Correct): ${rubric.scoringGuide.E}
- P (Partially Correct): ${rubric.scoringGuide.P}
- I (Incorrect): ${rubric.scoringGuide.I}

REQUIRED ELEMENTS (must address for E):
${requiredElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

BONUS ELEMENTS (strengthen the response):
${optionalElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

COMMON MISTAKES TO WATCH FOR:
${rubric.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Grade the response as E, P, or I. Be encouraging but accurate. Identify which elements were addressed and which were missing. Provide a specific suggestion for improvement if the score is P or I.

Respond in JSON format:
{
    "score": "E" | "P" | "I",
    "feedback": "Brief explanation of the grade",
    "matched": ["list of elements the student addressed"],
    "missing": ["list of elements the student missed"],
    "suggestion": "Specific suggestion for improvement (null if E)"
}`;
};
