"""Recompute every numerical key claim (including removed extensions) in units 2/4.

Run from the repository root. Assertions use the source visual data where available.
The JSON output records the independent calculation, not copied answer text.
"""
from collections import Counter
from itertools import groupby, product
import json
import re
from math import comb, isclose, sqrt
from pathlib import Path
from statistics import correlation, mean, pstdev
import yaml

results = {}
lessons = {}
for path in Path("dok/lessons").glob("*.yaml"):
    if path.stem.startswith(("2.", "4.")):
        lessons[path.stem] = yaml.safe_load(path.read_text())

for topic, name in [("2.1", "sport_sleep_table"), ("2.3", "tutoring_outcomes"),
                    ("4.4", "preference_table"), ("4.5", "screening_table"),
                    ("4.6", "pet_instrument_table")]:
    matrix = [[int(value.replace("{,}", "")) for value in row]
              for row in lessons[topic]["visuals"][name]["cells"]]
    assert all(sum(row[:-1]) == row[-1] for row in matrix)
    assert all(sum(row[i] for row in matrix[:-1]) == matrix[-1][i] for i in range(3))
    results[topic] = {"validated_table": matrix}

results["2.1"].update({"within_group_percents": [35/50*100, 15/50*100, 75/150*100, 75/150*100],
                      "percentage_point_gap": 35/50*100-75/150*100, "group_size_ratio": 150/50})
assert results["2.1"]["within_group_percents"] == [70, 30, 50, 50]
results["2.2"] = {"totals": [72+48, 18+42], "within_grade_percents": [72/120*100, 48/120*100, 18/60*100, 42/60*100],
                  "percentage_point_gap": 72/120*100-18/60*100}
assert results["2.2"]["within_grade_percents"] == [60, 40, 30, 70]
results["2.3"].update({"pass_rates": [225/300*100, 66/75*100, 159/225*100],
                      "actual_group_gap": 66/75*100-159/225*100, "mixed_group_gap": 88-75})
assert isclose(results["2.3"]["actual_group_gap"], 17.33333333333333)

run_table = lessons["4.1"]["visuals"]["run_dotplot"]
runs = [int(x) for x, count in zip(run_table["rows"], run_table["cells"]) for _ in range(int(count[0]))]
run_counts = Counter(runs)
observed_run = max(len(list(group)) for _, group in groupby("HHHHHHTTTT"))
exact_runs = [max(len(list(group)) for _, group in groupby(sequence)) for sequence in product("HT", repeat=10)]
results["4.1"] = {"simulation_frequencies": dict(sorted(run_counts.items())), "simulated_sets": len(runs),
                  "observed_longest_run": observed_run, "mode": run_counts.most_common(1)[0],
                  "run_at_least_six_count": sum(x >= 6 for x in runs),
                  "empirical_probability": sum(x >= 6 for x in runs)/len(runs),
                  "exact_fair_coin_probability_for_audit_only": sum(x >= 6 for x in exact_runs)/len(exact_runs)}
assert observed_run == 6 and len(runs) == 100 and run_counts.most_common(1)[0] == (3, 32)
assert results["4.1"]["empirical_probability"] == .07
results["4.2"] = {"estimates": [87/1000, 94/1000], "assigned_chances": [1/10, 12/100],
                  "target_probability_removed_from_student_demand": sum(comb(5,k)*.12**k*.88**(5-k) for k in range(2,6)),
                  "wrong_chance_target": sum(comb(5,k)*.1**k*.9**(5-k) for k in range(2,6)),
                  "exactly_two_target": comb(5,2)*.12**2*.88**3}
assert isclose(results["4.2"]["target_probability_removed_from_student_demand"], .1124508672)
assert isclose(results["4.2"]["wrong_chance_target"], .08146)
assert isclose(results["4.2"]["exactly_two_target"], .098131968)

spins = lessons["4.3"]["visuals"]["spin_results"]["values"]
results["4.3"] = {"frequencies": dict(sorted(Counter(spins).items())), "total": len(spins),
                  "wins": sum(x <= 3 for x in spins), "empirical": sum(x <= 3 for x in spins)/len(spins),
                  "model": 3/8, "percentage_point_gap": (18/40-3/8)*100}
assert results["4.3"]["wins"] == 18 and len(spins) == 40
results["4.4"].update({"intersection_probability": 35/120, "union_count": 80+60-35,
                      "union_probability": (80+60-35)/120, "neither_count": 120-(80+60-35),
                      "neither_probability": 15/120, "incorrect_sum": 140/120})
assert results["4.4"]["union_probability"] == .875
results["4.5"].update({"condition_count": 1000*.05, "no_condition_count": 1000*.95,
                      "positive_with_condition": 1000*.05*.9, "positive_without_condition": 1000*.95*.1,
                      "all_positive": 45+95, "all_negative": 5+855, "positive_given_condition": 45/50,
                      "condition_given_positive_percent": 45/(45+95)*100})
assert round(results["4.5"]["condition_given_positive_percent"], 1) == 32.1
results["4.6"].update({"pet": 120/200, "instrument": 100/200, "instrument_given_pet": 84/120,
                      "intersection": 84/200, "union_count": 120+100-84, "union": (120+100-84)/200,
                      "pet_complement_product_removed": .6*.4, "independence_product_removed": .6*.5})
assert results["4.6"]["union"] == .68
prizes = [100,25,5,0]
ticket_counts = [1,4,20,175]
results["4.7"] = {"ticket_total": sum(ticket_counts), "net_values": [x-2 for x in prizes],
                  "probability_sum": sum(ticket_counts)/200, "loss_chance": 175/200,
                  "given_gross_average_verified": sum(x*n/200 for x,n in zip(prizes,ticket_counts)),
                  "net_expectation_removed_from_student_demand": sum((x-2)*n/200 for x,n in zip(prizes,ticket_counts))}
assert results["4.7"]["given_gross_average_verified"] == 1.5
assert results["4.7"]["net_expectation_removed_from_student_demand"] == -.5
route_a = [25,27,29,29,31,31,33,35]
route_b = [10,18,26,26,34,34,42,50]
results["4.8"] = {}
for label, values in [("A", route_a), ("B", route_b)]:
    results["4.8"][label] = {"values": values, "sum": sum(values), "mean": mean(values),
                             "squared_distance_sum": sum((x-mean(values))**2 for x in values),
                             "population_sd": pstdev(values), "range": [min(values),max(values)],
                             "late_probability": sum(x>40 for x in values)/len(values),
                             "shifted_mean_removed": mean([x+5 for x in values]),
                             "shifted_sd_removed": pstdev([x+5 for x in values]),
                             "shifted_range_removed": [min(values)+5,max(values)+5]}
assert results["4.8"]["A"]["population_sd"] == 3 and results["4.8"]["B"]["population_sd"] == 12
assert results["4.8"]["A"]["squared_distance_sum"] == 72 and results["4.8"]["B"]["squared_distance_sum"] == 1152
probabilities = [comb(10,k)*.7**k*.3**(10-k) for k in range(11)]
results["4.10"] = {"combination_10_choose_3": comb(10,3), "exactly_three": probabilities[3],
                   "three_or_fewer": sum(probabilities[:4]), "pmf": probabilities,
                   "expected_counts_per_1000": [1000*p for p in probabilities]}
assert isclose(probabilities[3], .009001692)
assert isclose(sum(probabilities[:4]), .0105920784)
displayed_counts = [float(value) for _, value in re.findall(r"\((\d+),([\d.]+)\)", lessons["4.10"]["visuals"]["free_throw_pmf"]["body"])]
assert len(displayed_counts) == 11
for actual, displayed in zip(results["4.10"]["expected_counts_per_1000"], displayed_counts):
    assert abs(actual-displayed) <= .000501
results["4.11"] = {"mean": 100*.7, "variance": 100*.7*.3, "sd": sqrt(100*.7*.3), "distance_below_mean": 70-58,
                   "standardized_distance_removed": (58-70)/sqrt(21), "approximation_counts_removed": [70,30],
                   "58_or_fewer": sum(comb(100,k)*.7**k*.3**(100-k) for k in range(59)),
                   "fewer_than_60_removed": sum(comb(100,k)*.7**k*.3**(100-k) for k in range(60))}
assert round(results["4.11"]["58_or_fewer"],4) == .0072

dough = dict(lessons["2.4"]["visuals"]["dough_growth"]["points"])
results["2.4"] = {"early_increase": dough[20]-dough[0], "late_increase": dough[90]-dough[70],
                  "comparison_volumes": [dough[40],dough[50],dough[60]],
                  "midpoint_removed": (dough[40]+dough[60])/2,
                  "midpoint_gap_removed": (dough[40]+dough[60])/2-dough[50]}
assert results["2.4"]["early_increase"] == 170 and results["2.4"]["late_increase"] == 15
points = lessons["2.5"]["visuals"]["arts_centers"]["points"]
results["2.5"] = {"r_full": correlation([p[0] for p in points],[p[1] for p in points]),
                  "r_first_seven": correlation([p[0] for p in points[:7]],[p[1] for p in points[:7]])}
assert round(results["2.5"]["r_full"],3) == .922 and round(results["2.5"]["r_first_seven"],3) == .095
results["2.6"] = {"slope": -6.4, "intercept": 36, "observed_range": [.5,2.5],
                  "predictions": [36-6.4*1.8,36-6.4*3.5], "buffer": (36-6.4*3.5)-12, "range_gap": 3.5-2.5}
assert isclose(results["2.6"]["predictions"][0],24.48) and isclose(results["2.6"]["buffer"],1.6)
residual_points = lessons["2.7"]["visuals"]["braking_residuals"]["points"]
speeds = [x for x,e in residual_points]
actual_distances = [-10+2.5*x+e for x,e in residual_points]
results["2.7"] = {"predictions_at_10_30_50": [-10+2.5*x for x in [10,30,50]],
                  "actual_at_10_30_50": [actual_distances[speeds.index(x)] for x in [10,30,50]],
                  "residuals_at_10_30_50": [dict(residual_points)[x] for x in [10,30,50]],
                  "correlation_reconstructed_from_all_residuals": correlation(speeds,actual_distances)}
assert round(results["2.7"]["correlation_reconstructed_from_all_residuals"],3) == .997
results["2.8"] = {"mean_point": [7,28], "slope": .8*(6/1.5), "intercept": 28-.8*(6/1.5)*7,
                  "r_squared": .8**2, "wrong_slope": .8*(1.5/6), "wrong_intercept": 28-.8*(1.5/6)*7,
                  "mean_point_predictions": [5.6+3.2*7,26.6+.2*7],
                  "eight_hour_predictions_removed": [5.6+3.2*8,26.6+.2*8],
                  "prediction_gap_removed": (5.6+3.2*8)-(26.6+.2*8), "explained_percentage_point_error_removed": 80-64}
assert isclose(results["2.8"]["slope"],3.2) and isclose(results["2.8"]["intercept"],5.6)
assert all(isclose(p,28) for p in results["2.8"]["mean_point_predictions"])
assert len(results) == 18
Path("dok/audit-support/numeric-units-2-4.json").write_text(json.dumps(results,indent=2)+"\n",encoding="utf-8")
print("PASS: all 18 topics; original and revised key arithmetic independently recomputed.")
