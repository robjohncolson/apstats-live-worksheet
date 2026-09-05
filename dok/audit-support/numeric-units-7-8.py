"""Recompute the September 2026 unit 7/8 key arithmetic from the displayed inputs.

Run from the repository root: python dok/audit-support/numeric-units-7-8.py
Requires the existing NumPy, SciPy, and PyYAML environment. Writes numerical evidence only.
The report includes original full-key calculations even when the audit removed them from student work.
"""
from pathlib import Path
import json
import math
import numpy as np
from scipy.stats import t, chi2
import yaml

root = Path(__file__).resolve().parents[2]
evidence = {}
evidence['7.1'] = {'difference': 14.2 - 17.8, 'expected_no_effect': 0,
                   'simulation_fraction': 18 / 2000, 'simulation_percent': 100 * 18 / 2000,
                   'claimed_complement_percent': 100 * (1 - 18 / 2000), 'group_total': 25 + 25}

paired = np.array(yaml.safe_load((root / 'dok/lessons/7.2.yaml').read_text('utf-8'))['visuals']['interface_difference_dotplot']['values'])
paired_mean = float(paired.mean())
paired_sd = float(paired.std(ddof=1))
paired_se = paired_sd / math.sqrt(len(paired))
paired_me = 2.201 * paired_se
evidence['7.2'] = {'n': len(paired), 'sum': float(paired.sum()), 'sum_squared_deviations': float(((paired - paired_mean) ** 2).sum()),
                   'mean': paired_mean, 'sd': paired_sd, 'se': paired_se, 'df': len(paired) - 1,
                   't95_exact': float(t.ppf(.975, len(paired) - 1)), 't95_supplied': 2.201, 'margin': paired_me,
                   'interval': [paired_mean - paired_me, paired_mean + paired_me], 'ten_percent_bound': .1 * 180,
                   'interval_using_supplied_rounded_sd': [2 - 2.201 * 1.6514 / math.sqrt(12), 2 + 2.201 * 1.6514 / math.sqrt(12)]}

critical = float(t.ppf(.975, 24))
margin = critical * 6 / math.sqrt(25)
evidence['7.3'] = {'se': 6 / math.sqrt(25), 'df': 24, 't95_exact': critical, 'margin': margin,
                   'interval': [42.4 - margin, 42.4 + margin], 'ten_percent_bound': .1 * 800,
                   'cutoffs': {'42_inside': 42.4-margin < 42 < 42.4+margin, '45_above': 45 > 42.4+margin}}

paired = np.array(yaml.safe_load((root / 'dok/lessons/7.4.yaml').read_text('utf-8'))['visuals']['interface_differences']['values'])
evidence['7.4'] = {'n_people': len(paired), 'n_measurements': 2 * len(paired), 'sum': float(paired.sum()),
                   'mean': float(paired.mean()), 'sd': float(paired.std(ddof=1)), 'ten_percent_bound': .1 * 300,
                   'df_if_test_carried_out': len(paired) - 1}

se = 2.8 / math.sqrt(24)
statistic = (11.1 - 12) / se
evidence['7.5'] = {'se': se, 't': statistic, 'df': 23, 'p_lower': float(t.cdf(statistic, 23)), 'ten_percent_bound': .1 * 1200}

for topic, n1, n2, sd1, sd2, mean1, mean2, pop1, pop2 in [
    ('7.6', 36, 36, 8.4, 7.6, 42.3, 40.1, 900, 1200),
    ('7.7', 40, 40, 4, 4, 18.6, 15.6, 1200, 900),
    ('7.9', 100, 100, 4.2, 4.5, 42.8, 41.6, 4000, 3600),
]:
    a, b = sd1 ** 2 / n1, sd2 ** 2 / n2
    se = math.sqrt(a + b)
    df = (a + b) ** 2 / (a ** 2 / (n1 - 1) + b ** 2 / (n2 - 1))
    difference = mean1 - mean2
    critical = 1.995 if topic == '7.6' else float(t.ppf(.975, df))
    margin = critical * se
    statistic = difference / se
    evidence[topic] = {'difference': difference, 'se': se, 'df_welch': df, 't95_exact': float(t.ppf(.975, df)),
                       't95_used': critical, 'margin': margin, 'interval': [difference-margin, difference+margin],
                       't': statistic, 'p_upper': float(t.sf(statistic, df)), 'ten_percent_bounds': [.1*pop1, .1*pop2]}
    if topic == '7.6':
        bad_se = 3 / math.sqrt(36)
        bad_margin = float(t.ppf(.975, 35)) * bad_se
        evidence[topic]['artificial_pair_se'] = bad_se
        evidence[topic]['artificial_pair_interval'] = [2.2-bad_margin, 2.2+bad_margin]

evidence['7.8'] = {'difference': 41.2 - 44, 'ten_percent_bounds': [.1 * 600, .1 * 540],
                   'sample_sizes': [18, 18], 'null_difference': 0}

observed = np.array([32., 30., 18.])
expected = 80 * np.array([.5, .3, .2])
contributions = (observed - expected) ** 2 / expected
evidence['8.1'] = {'sample_total': float(observed.sum()), 'expected': expected.tolist(), 'contributions': contributions.tolist(),
                   'chi_square': float(contributions.sum()), 'df_removed_from_student_task': 2,
                   'p_theoretical_for_crosscheck_only': float(chi2.sf(contributions.sum(), 2)),
                   'p_simulated': 186 / 1000, 'ten_percent_bound': .1 * 10000}

for topic, observed, population in [
    ('8.4', [[42, 34, 24], [8, 6, 6]], 5000),
    ('8.5', [[60, 25, 15], [48, 32, 20], [42, 33, 25]], 15000),
    ('8.6', [[15, 85], [24, 56], [30, 30]], 6000),
]:
    observed = np.array(observed, dtype=float)
    rows, columns = observed.sum(axis=1), observed.sum(axis=0)
    total = float(observed.sum())
    expected = np.outer(rows, columns) / total
    contributions = (observed - expected) ** 2 / expected
    df = (observed.shape[0] - 1) * (observed.shape[1] - 1)
    evidence[topic] = {'row_totals': rows.tolist(), 'column_totals': columns.tolist(), 'table_total': total,
                       'expected': expected.tolist(), 'contributions': contributions.tolist(), 'df': df,
                       'chi_square': float(contributions.sum()), 'p_upper': float(chi2.sf(contributions.sum(), df)),
                       'ten_percent_bound': .1 * population}
    if topic == '8.4':
        evidence[topic]['minimum_expected'] = float(expected.min())
        evidence[topic]['strict_printed_rule_passes'] = bool((expected > 5).all())
    if topic == '8.5':
        evidence[topic]['route_population_total'] = 3 * 5000
        evidence[topic]['design_a_each_ten_percent_bound'] = .1 * 5000
    if topic == '8.6':
        evidence[topic]['late_raw_absolute_gaps'] = np.abs(observed[:, 0] - expected[:, 0]).tolist()

assert math.isclose(evidence['7.1']['simulation_fraction'], .009)
assert math.isclose(evidence['7.2']['sd'], 1.6514, abs_tol=.00005)
assert np.allclose(evidence['7.3']['interval'], [39.923, 44.877], atol=.0005)
assert math.isclose(evidence['7.4']['sd'], 1.2546, abs_tol=.00005)
assert math.isclose(evidence['7.5']['p_lower'], .0645, abs_tol=.00005)
assert np.allclose(evidence['7.6']['interval'], [-1.5665, 5.9665], atol=.0001)
assert np.allclose(evidence['7.7']['interval'], [1.219, 4.781], atol=.0005)
assert math.isclose(evidence['7.9']['p_upper'], .0263, abs_tol=.00005)
assert math.isclose(evidence['8.1']['chi_square'], 3.35)
assert evidence['8.4']['minimum_expected'] == 5
assert evidence['8.5']['expected'] == [[50., 30., 20.]] * 3
assert math.isclose(evidence['8.6']['chi_square'], 22.5172, abs_tol=.00005)
assert math.isclose(evidence['8.6']['p_upper'], .0000129, abs_tol=.00000005)

output_path = root / 'dok/audit-support/numeric-units-7-8.json'
output_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + '\n', 'utf-8')
print(f'All numerical checks passed for {len(evidence)} topics; wrote {output_path.relative_to(root)}')
