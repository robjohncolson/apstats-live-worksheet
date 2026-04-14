// Auto-generated hand-authored MCQ supplement for AP Stats formulas not covered
// by the main EMBEDDED_CURRICULUM bank. Each probe targets a specific formula id
// from Formula Defense (tmux-trainer/ap-stats-cartridge.js).
//
// Loaded by study_guide_diagnostic.html alongside ../curriculum_render/data/curriculum.js.
// Each entry has an extra `formulaId` field linking it back to the formula.
//
// Schema matches EMBEDDED_CURRICULUM: {id, type, prompt, answerKey, attachments:{choices:[{key,value}]}}

const EMBEDDED_CURRICULUM_SUPPLEMENT = [
  {
    "id": "U4-L9-QS1",
    "type": "multiple-choice",
    "formulaId": "lincomb-mean",
    "prompt": "A coffee shop sells small drinks (X) and large drinks (Y). Mean daily small sales: 42 cups (SD 6). Mean daily large sales: 30 cups (SD 5). Total revenue is T = 3X + 5Y dollars. What is the mean of T, assuming X and Y are NOT independent?",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "$72, because independence is required to add means." },
        { "key": "B", "value": "$300, because 5(42) + 3(30) = 210 + 90 (with the coefficients swapped)." },
        { "key": "C", "value": "$276, because E(3X + 5Y) = 3E(X) + 5E(Y) = 3(42) + 5(30) = 276, regardless of independence." },
        { "key": "D", "value": "Cannot be determined without knowing whether X and Y are independent." },
        { "key": "E", "value": "$180, the average of 3(42) and 5(30)." }
      ]
    },
    "reasoning": "Linearity of expectation: E(aX + bY) = aE(X) + bE(Y) always holds, even when X and Y are dependent. Independence is only required for the variance formula, not the mean. 3(42) + 5(30) = 126 + 150 = 276."
  },
  {
    "id": "U9-L2-QS1",
    "type": "multiple-choice",
    "formulaId": "slope-mean",
    "prompt": "A researcher repeatedly takes random samples of size n = 25 from a large population and fits the least-squares regression line for each sample, recording the slope b. If the true population regression slope is β = 2.5, what does the theoretical sampling distribution predict for the mean of all the sample slopes b?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "0, because regression slopes are centered at zero under H₀." },
        { "key": "B", "value": "2.5, because the mean of the sampling distribution of b equals the true population slope β." },
        { "key": "C", "value": "2.5 / √25 = 0.5, because the mean shrinks with sample size." },
        { "key": "D", "value": "It depends on the standard deviation of the residuals." },
        { "key": "E", "value": "Cannot be determined without knowing the correlation r." }
      ]
    },
    "reasoning": "The least-squares slope b is an unbiased estimator of the population slope β. So μ_b = β = 2.5. Sample size affects spread (SE), not center."
  },
  {
    "id": "U9-L2-QS2",
    "type": "multiple-choice",
    "formulaId": "slope-sd",
    "prompt": "Which of the following correctly distinguishes σ_b (the true standard deviation of the sampling distribution of the slope) from SE(b) (the standard error computed from a single sample)?",
    "answerKey": "A",
    "attachments": {
      "choices": [
        { "key": "A", "value": "σ_b uses the population residual standard deviation σ, while SE(b) substitutes the sample residual standard deviation s. σ_b is theoretical; SE(b) is what we can actually compute." },
        { "key": "B", "value": "σ_b and SE(b) are always identical; the notation is just a stylistic difference." },
        { "key": "C", "value": "σ_b depends on the true slope β, while SE(b) does not." },
        { "key": "D", "value": "SE(b) is always larger than σ_b because sample estimates add uncertainty." },
        { "key": "E", "value": "σ_b = SE(b) / √n for large samples." }
      ]
    },
    "reasoning": "In the sampling distribution of the regression slope, σ_b = σ / (σ_x √n) where σ is the population residual SD (unknown in practice). SE(b) = s / (s_x √n) uses the sample residual SD s — that's why we use a t-distribution rather than z: we're using an estimate, not the true value."
  },
  {
    "id": "U9-L1-QS1",
    "type": "multiple-choice",
    "formulaId": "resid-s",
    "prompt": "A regression of weight (lb) on height (in) for n = 12 adults produces Σ(y − ŷ)² = 250. What is s, the standard deviation of the residuals, used in the regression t-test for the slope?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "√(250/12) ≈ 4.56" },
        { "key": "B", "value": "√(250/10) = 5.00" },
        { "key": "C", "value": "√(250/11) ≈ 4.77" },
        { "key": "D", "value": "250/10 = 25.0" },
        { "key": "E", "value": "250, the sum of squared residuals itself." }
      ]
    },
    "reasoning": "s = √(SSE / (n − 2)) = √(250 / 10) = √25 = 5.00. Degrees of freedom is n − 2 for simple linear regression because we estimated two parameters (slope and intercept)."
  },
  {
    "id": "U8-L5-QS1",
    "type": "multiple-choice",
    "formulaId": "std-resid-chi",
    "prompt": "In a chi-square test of independence, one cell of the two-way table has observed count O = 85 and expected count E = 64. The standardized residual for this cell, given by (O − E)/√E, is:",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "21/64 ≈ 0.33" },
        { "key": "B", "value": "21/√85 ≈ 2.28" },
        { "key": "C", "value": "21/√64 = 2.625" },
        { "key": "D", "value": "441/64 ≈ 6.89 (this is the cell's contribution to χ²)" },
        { "key": "E", "value": "21, the raw residual." }
      ]
    },
    "reasoning": "Standardized residual = (O − E)/√E = (85 − 64)/√64 = 21/8 = 2.625. Values with |standardized residual| > 2 indicate cells contributing meaningfully to the chi-square statistic. Choice D is the cell's contribution to χ² = (O−E)²/E, a different quantity."
  },
  {
    "id": "U6-L6-QS1",
    "type": "multiple-choice",
    "formulaId": "power",
    "prompt": "A researcher tests H₀: p = 0.5 vs H_a: p > 0.5 at α = 0.05. If the true population proportion is actually p = 0.60 and the probability of a Type II error at that true value is β = 0.28, what is the power of the test?",
    "answerKey": "D",
    "attachments": {
      "choices": [
        { "key": "A", "value": "0.05, the significance level." },
        { "key": "B", "value": "0.28, the probability of a Type II error." },
        { "key": "C", "value": "0.95, one minus the significance level." },
        { "key": "D", "value": "0.72, because Power = 1 − β = 1 − 0.28." },
        { "key": "E", "value": "Cannot be determined without the sample size." }
      ]
    },
    "reasoning": "Power is the probability of correctly rejecting a false null. Power = P(reject H₀ | H_a true) = 1 − P(fail to reject H₀ | H_a true) = 1 − β = 1 − 0.28 = 0.72."
  },
  {
    "id": "U7-L2-QS1",
    "type": "multiple-choice",
    "formulaId": "margin-error",
    "prompt": "A 95% confidence interval for a population mean is built from a sample with x̄ = 48, sample standard deviation s = 7, and n = 16. The critical value is t* = 2.131. What is the margin of error?",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "1.75, the standard error by itself." },
        { "key": "B", "value": "3.73, because ME = t* · SE = 2.131 · (7/√16) = 2.131 · 1.75." },
        { "key": "C", "value": "2.131, the critical value by itself." },
        { "key": "D", "value": "48 ± 3.73, the full confidence interval." },
        { "key": "E", "value": "7, the sample standard deviation." }
      ]
    },
    "reasoning": "Margin of error = critical value × standard error. SE = s/√n = 7/4 = 1.75. ME = 2.131 × 1.75 ≈ 3.73. The full CI is x̄ ± ME = 48 ± 3.73, but the ME itself is just 3.73."
  },
  {
    "id": "U6-L4-QS1",
    "type": "multiple-choice",
    "formulaId": "width-ci",
    "prompt": "A political pollster wants to estimate the proportion of voters who support a ballot measure with 95% confidence and a margin of error of at most 3 percentage points (0.03). A conservative estimate uses p-hat = 0.5 to maximize the needed sample size. Using z* = 1.96, what is the minimum sample size required?",
    "answerKey": "C",
    "attachments": {
      "choices": [
        { "key": "A", "value": "267, because 0.5 times 0.5 times (1.96/0.03) = 32.67." },
        { "key": "B", "value": "534, because 0.5 times (1.96/0.03)^2 = 533." },
        { "key": "C", "value": "1068, because n >= (1.96/0.03)^2 times 0.5 times 0.5 = 1067.11 and we round up." },
        { "key": "D", "value": "33, because 1.96/0.03 times 0.5 is about 33." },
        { "key": "E", "value": "385, using p-hat = 0.1 instead of 0.5." }
      ]
    },
    "reasoning": "For a proportion CI: n >= (z*/ME)^2 * p-hat(1 - p-hat). Using the conservative p-hat = 0.5: n >= (1.96/0.03)^2 * 0.25 = 4268.4 * 0.25 = 1067.11. Always round UP: n = 1068."
  },
  {
    "id": "U6-L4-QS2",
    "type": "multiple-choice",
    "formulaId": "type-i-error",
    "prompt": "A pharmaceutical company tests H₀: the new drug is no more effective than placebo vs H_a: the new drug is more effective than placebo, at α = 0.01. In context, a Type I error occurs when:",
    "answerKey": "A",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The company concludes the drug IS more effective than placebo, when in truth it is not." },
        { "key": "B", "value": "The company concludes the drug is not more effective than placebo, when in truth it is." },
        { "key": "C", "value": "α = 0.01 means there is a 1% chance the drug actually works." },
        { "key": "D", "value": "The probability of this error is β, not α." },
        { "key": "E", "value": "The drug effect is smaller than the researchers expected." }
      ]
    },
    "reasoning": "Type I error = rejecting a true null. Here, H₀ is 'not more effective.' So Type I error = concluding the drug IS more effective (rejecting H₀) when in truth it is not (H₀ is true). The probability of this error is α. Choice B describes a Type II error."
  },
  {
    "id": "U6-L4-QS3",
    "type": "multiple-choice",
    "formulaId": "type-ii-error",
    "prompt": "A factory inspector tests H₀: bolts meet the minimum strength specification vs H_a: bolts do NOT meet the specification. In context, a Type II error occurs when:",
    "answerKey": "B",
    "attachments": {
      "choices": [
        { "key": "A", "value": "The inspector concludes the bolts do not meet specification, when in truth they do." },
        { "key": "B", "value": "The inspector concludes the bolts meet specification, when in truth they do not." },
        { "key": "C", "value": "Both H₀ and H_a are true at the same time." },
        { "key": "D", "value": "α is the probability of this error." },
        { "key": "E", "value": "The inspector rejects H₀ too quickly." }
      ]
    },
    "reasoning": "Type II error = failing to reject a false null. Here, H₀ is 'bolts meet spec.' So Type II error = failing to reject H₀ (concluding bolts meet spec) when in truth H₀ is false (bolts actually do not meet spec). The probability of this error is β. Choice A describes a Type I error."
  }
];

if (typeof window !== 'undefined') {
  window.EMBEDDED_CURRICULUM_SUPPLEMENT = EMBEDDED_CURRICULUM_SUPPLEMENT;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EMBEDDED_CURRICULUM_SUPPLEMENT };
}
