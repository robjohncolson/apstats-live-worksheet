"""Recompute every answer-key quantity for OLD Units 5 and 6.

Run from the repository root: python dok/audit-support/verify-units-5-6.py
Only Python's standard library is required. Values supplied as study inputs are
retained explicitly; normal/binomial probabilities are recomputed, not copied.
"""
import json
import math
import statistics
from pathlib import Path

OUTPUT = Path(__file__).with_name('units-5-6-numbers.json')
NORMAL = statistics.NormalDist()
RESULTS = {}


def checked(topic, values, expected):
    for name, (target, tolerance) in expected.items():
        assert abs(values[name] - target) <= tolerance, (topic, name, values[name], target)
    RESULTS[topic] = {'values': values, 'verified_roundings': {k: v[0] for k, v in expected.items()}}


def one_interval(successes, total):
    estimate = successes / total
    se = math.sqrt(estimate * (1 - estimate) / total)
    return {'estimate': estimate, 'SE': se, 'ME': 1.96 * se,
            'lower': estimate - 1.96 * se, 'upper': estimate + 1.96 * se,
            'width': 2 * 1.96 * se}


def two_interval(x1, n1, x2, n2):
    difference = x1 / n1 - x2 / n2
    se = math.sqrt((x1 / n1) * (1 - x1 / n1) / n1 + (x2 / n2) * (1 - x2 / n2) / n2)
    return {'difference': difference, 'SE': se, 'ME': 1.96 * se,
            'lower': difference - 1.96 * se, 'upper': difference + 1.96 * se}


z_a = (92 - 80) / 9
z_b = (92 - 80) / 15
checked('5.2', {'distance': 92 - 80, 'z_A': z_a, 'z_B': z_b,
    'cdf_A': NORMAL.cdf(z_a), 'cdf_B': NORMAL.cdf(z_b),
    'percentile_A': 100 * NORMAL.cdf(z_a), 'percentile_B': 100 * NORMAL.cdf(z_b)},
    {'z_A': (1.33, .005), 'z_B': (.80, 1e-12), 'cdf_A': (.9088, .00005),
     'cdf_B': (.7881, .00005), 'percentile_A': (90.9, .05), 'percentile_B': (78.8, .05)})

means = [492,494,495,496,497,498,499,499,500,500,500,501,501,502,503,504,505,506,508,520]
checked('5.1', {'count': len(means), 'mean': statistics.mean(means), 'median': statistics.median(means),
    'minimum': min(means), 'maximum': max(means), 'range': max(means)-min(means),
    'gap': means[-1]-means[-2], 'values_492_through_508': sum(492<=x<=508 for x in means)},
    {'mean': (501, 1e-12), 'median': (500, 1e-12), 'range': (28, 1e-12), 'gap': (12, 1e-12)})

checked('5.3', {'mean_n4': 25, 'mean_n40': 25, 'SD_n4': 15/math.sqrt(4), 'SD_n40': 15/math.sqrt(40),
    'histogram_percent_total': sum([12,30,28,15,8,4,2,1])},
    {'SD_n4': (7.5, 1e-12), 'SD_n40': (2.3717, .00005), 'histogram_percent_total': (100, 1e-12)})

probabilities = [math.comb(25,k)*.4**k*.6**(25-k) for k in range(26)]
mean_a = sum((k/25)*p for k,p in enumerate(probabilities))
mean_b = sum(((k+5)/35)*p for k,p in enumerate(probabilities))
sd_a = math.sqrt(sum((k/25-mean_a)**2*p for k,p in enumerate(probabilities)))
sd_b = math.sqrt(sum(((k+5)/35-mean_b)**2*p for k,p in enumerate(probabilities)))
checked('5.4', {'estimate_A_X9': 9/25, 'estimate_B_X9': (9+5)/35, 'mean_A': mean_a, 'mean_B': mean_b,
    'SD_A': sd_a, 'SD_B': sd_b, 'bias_B': mean_b-.4, 'bias_B_percentage_points': 100*(mean_b-.4),
    'within_006_A': sum(probabilities[9:12]), 'within_006_B': sum(probabilities[7:12])},
    {'estimate_A_X9': (.36, 1e-12), 'estimate_B_X9': (.4, 1e-12), 'mean_A': (.4, 1e-12),
     'mean_B': (.428571, .0000005), 'SD_A': (.098, .0005), 'SD_B': (.070, .0005),
     'bias_B': (.028571, .0000005), 'within_006_A': (.459, .0005), 'within_006_B': (.659, .0005)})

sd = math.sqrt(.08*.92/100)
tail = sum(math.comb(100,k)*.08**k*.92**(100-k) for k in range(14,101))
exact_without_replacement = sum(math.comb(400,k)*math.comb(4600,100-k)/math.comb(5000,100) for k in range(14,101))
checked('5.5', {'estimate': 14/100, 'mean': .08, 'SD': sd, '10_percent_N': .10*5000,
    'expected_successes': 100*.08, 'expected_failures': 100*.92,
    'unsupported_normal_tail': 1-NORMAL.cdf((.14-.08)/sd), 'binomial_tail': tail,
    'without_replacement_tail': exact_without_replacement},
    {'estimate': (.14, 1e-12), 'SD': (.0271, .00005), 'binomial_tail': (.0282357, .00000005),
     'without_replacement_tail': (.0269, .00005), 'unsupported_normal_tail': (.0135, .00005)})

counts = [14,40,58,47,25,12,4]
checked('6.1', {'simulation_total': sum(counts), 'mode': counts.index(max(counts)), 'mode_count': max(counts),
    'sample_proportion': 6/12, 'simulation_tail': counts[6]/sum(counts), 'expected_successes': 12*.2,
    'expected_failures': 12*.8, 'normal_tail': 1-NORMAL.cdf((.5-.2)/math.sqrt(.2*.8/12)),
    'exact_binomial_tail': sum(math.comb(12,k)*.2**k*.8**(12-k) for k in range(6,13)),
    'reported_rarity_ratio': .020/.005},
    {'simulation_total': (200, 0), 'mode': (2, 0), 'simulation_tail': (.020, 1e-12),
     'exact_binomial_tail': (.0194, .00005), 'reported_rarity_ratio': (4, 1e-12), 'normal_tail': (.005, .0005)})

a=one_interval(116,200); b=one_interval(520,800)
checked('6.2', {**{'A_'+k:v for k,v in a.items()}, **{'B_'+k:v for k,v in b.items()},
    '10_percent_N': 20000*.1, 'A_failures': 200-116, 'B_failures': 800-520},
    {'A_estimate': (.58,1e-12), 'A_SE': (.0348999,.00000005), 'A_ME': (.0684037,.00000005),
     'A_lower': (.5116,.00005), 'A_upper': (.6484,.00005), 'A_width': (.1368,.00005),
     'B_estimate': (.65,1e-12), 'B_ME': (.0330523,.00000005), 'B_lower': (.6169,.00005),
     'B_upper': (.6831,.00005), 'B_width': (.0661,.00005)})

interval=one_interval(204,300)
checked('6.3', {**interval, '10_percent_N': 10000*.1, 'failures': 300-204},
    {'estimate': (.68,1e-12), 'SE': (.0269320,.00000005), 'ME': (.0527867,.00000005),
     'lower': (.6272,.00005), 'upper': (.7328,.00005)})

checked('6.4', {'estimate': 84/180, '10_percent_N': 2400*.1, 'expected_successes': 180*.4,
    'expected_failures': 180*.6, 'observed_failures': 180-84},
    {'estimate': (.4667,.00005), 'expected_successes': (72,1e-12), 'expected_failures': (108,1e-12)})

sd=math.sqrt(.55*.45/200); z=(98/200-.55)/sd
checked('6.5', {'estimate': 98/200, 'null_SD': sd, 'z': z, 'one_sided_p': NORMAL.cdf(z),
    'two_sided_p': 2*NORMAL.cdf(z), 'failures': 200-98},
    {'null_SD': (.035178,.0000005), 'z': (-1.7056,.00005), 'one_sided_p': (.04404,.000005), 'two_sided_p': (.08808,.000005)})

sd=math.sqrt(.6*.4/250); z=(136/250-.6)/sd
checked('6.6', {'estimate': 136/250, 'difference': 136/250-.6, 'percentage_point_gap': 100*(.6-136/250),
    '10_percent_N': 5000*.1, 'expected_successes': 250*.6, 'expected_failures': 250*.4,
    'null_SD': sd, 'z': z, 'p_value': NORMAL.cdf(z)},
    {'estimate': (.544,1e-12), 'percentage_point_gap': (5.6,1e-12), 'null_SD': (.0309839,.00000005),
     'z': (-1.8074,.00005), 'p_value': (.0354,.00005)})

checked('6.7', {'A_alpha_supplied': .010, 'B_alpha_supplied': .050, 'A_power_supplied': .748,
    'B_power_supplied': .877, 'A_beta': 1-.748, 'B_beta': 1-.877,
    'A_false_replacements_per_1000_at_p005': 1000*.01, 'B_false_replacements_per_1000_at_p005': 1000*.05,
    'A_misses_per_1000_at_p010': 1000*(1-.748), 'B_misses_per_1000_at_p010': 1000*(1-.877)},
    {'A_beta': (.252,1e-12), 'B_beta': (.123,1e-12)})

var_after=.54*.46/150;var_before=.42*.58/120;sd=math.sqrt(var_after+var_before)
z=(.01-(.54-.42))/sd
checked('5.6', {'mean': .54-.42,'after_10_percent': .1*5000,'before_10_percent': .1*4000,
    'after_successes': 150*.54,'after_failures': 150*.46,'before_successes': 120*.42,'before_failures': 120*.58,
    'after_variance':var_after,'before_variance':var_before,'variance':var_after+var_before,'SD':sd,'z':z,'tail':NORMAL.cdf(z)},
    {'mean':(.12,1e-12),'variance':(.003686,1e-12),'SD':(.0607124,.00000005),'z':(-1.8118,.00005),'tail':(.0350,.00005)})

a=one_interval(77,140);b=one_interval(48,120);interval=two_interval(77,140,48,120)
checked('6.8',{**interval,'Oak_10_percent':2200*.1,'Pine_10_percent':1800*.1,'Oak_failures':140-77,'Pine_failures':120-48,
    'Oak_lower':a['lower'],'Oak_upper':a['upper'],'Pine_lower':b['lower'],'Pine_upper':b['upper'],
    'Devon_lower':a['lower']-b['upper'],'Devon_upper':a['upper']-b['lower']},
    {'difference':(.15,1e-12),'SE':(.0613829,.00000005),'ME':(.1203104,.00000005),
     'lower':(.0296896,.00000005),'upper':(.2703104,.00000005),'Devon_lower':(-.0201,.00005),'Devon_upper':(.3201,.00005)})

interval=two_interval(126,180,105,180)
checked('6.9',{**interval,'reminder_proportion':126/180,'standard_proportion':105/180,
    'reminder_failures':180-126,'standard_failures':180-105},
    {'difference':(.1167,.00005),'lower':(.018,.0005),'upper':(.215,.0005)})

checked('6.10',{'meter_proportion':126/180,'standard_proportion':108/180,'difference':126/180-108/180,
    'combined_successes':126+108,'pooled':(126+108)/360,'expected_successes_each':180*(126+108)/360,
    'expected_failures_each':180*(1-(126+108)/360),'10_percent_N':50000*.1},
    {'difference':(.10,1e-12),'pooled':(.65,1e-12),'expected_successes_each':(117,1e-12),'expected_failures_each':(63,1e-12)})

pool=(3050+2950)/10000;se=math.sqrt(pool*(1-pool)*(1/5000+1/5000));z=(3050/5000-2950/5000)/se
checked('6.11',{'A_proportion':3050/5000,'B_proportion':2950/5000,'difference':3050/5000-2950/5000,
    'pooled':pool,'SE':se,'z':z,'two_sided_p':2*(1-NORMAL.cdf(z)),
    'expected_successes_each':5000*pool,'expected_failures_each':5000*(1-pool),'10_percent_N':500000*.1},
    {'difference':(.02,1e-12),'pooled':(.6,1e-12),'SE':(.00979796,.000000005),
     'z':(2.04124,.000005),'two_sided_p':(.04123,.000005)})

checked('5.7',{'mean_A':40,'mean_B':40,'10_percent_each_N':.1*1000,'SD_A':12/math.sqrt(9),'SD_B':12/math.sqrt(36),
    'z_A':(46-40)/(12/math.sqrt(9)),'z_B':(46-40)/(12/math.sqrt(36)),
    'tail_A':1-NORMAL.cdf(1.5),'tail_B':1-NORMAL.cdf(3)},
    {'SD_A':(4,1e-12),'SD_B':(2,1e-12),'tail_A':(.0668,.00005),'tail_B':(.00135,.000005)})

mean=6-4.8;var=1.8**2/12+3**2/48;sd=math.sqrt(var);z=(2.5-mean)/sd
checked('5.8',{'mean_difference':mean,'North_10_percent_N':.1*600,'South_10_percent_N':.1*1000,
    'variance':var,'SD':sd,'z':z,'tail':1-NORMAL.cdf(z),'original_total':12+48,'counterfactual_total':48+8},
    {'mean_difference':(1.2,1e-12),'variance':(.4575,1e-12),'SD':(.676387,.0000005),
     'z':(1.92198,.000005),'tail':(.027304,.0000005),'counterfactual_total':(56,0)})

OUTPUT.write_text(json.dumps(RESULTS,indent=2)+'\n',encoding='utf-8')
print(f'PASS: {len(RESULTS)} topics; {sum(len(r["values"]) for r in RESULTS.values())} recomputed/input quantities; '
      f'{sum(len(r["verified_roundings"]) for r in RESULTS.values())} rounding assertions.')
