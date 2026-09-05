"""Recompute original and revised answer quantities for the early-unit audit."""
import json
import math
from pathlib import Path
from statistics import mean, median, stdev

results = {}

sleep = [5, 7, 8.5, 6.5, 8, 7.5, 5.5, 9, 7, 6, 8, 4.5]
assert len(sleep) == 12
short_sleep = sorted(sleep)[2:]
results["1.1"] = {"full_percent": 100 * sum(x < 6 for x in sleep) / 12,
                    "omitted_percent": 100 * sum(x < 6 for x in short_sleep) / 10}
assert list(results["1.1"].values()) == [25, 10]
# The original sleep/quiz pairing also fits its descriptive key, except the
# original exact causal and population conclusions were pedagogically premature.
quiz = [4, 7, 10, 7, 8, 8, 5, 10, 7, 6, 9, 9]
assert [(s, q) for s, q in zip(sleep, quiz) if 5 <= s <= 6] == [(5, 4), (5.5, 5), (6, 6)]
assert (sleep[-1], quiz[-1]) == (4.5, 9)
results["1.2"] = {"mean_of_zip_digits": (1902 + 1905) / 2, "students": 6}
assert results["1.2"]["mean_of_zip_digits"] == 1903.5
results["1.3"] = {"chess_yes_percent": 100 * 15 / 18, "chess_no_percent": 100 * 3 / 18,
                    "robotics_yes_percent": 100 * 27 / 45, "robotics_no_percent": 100 * 18 / 45,
                    "yes_difference": 27 - 15, "club_size_difference": 45 - 18}
assert [round(results["1.3"][k]) for k in ["chess_yes_percent", "chess_no_percent", "robotics_yes_percent", "robotics_no_percent"]] == [83, 17, 60, 40]
votes = [52, 47, 44, 41]
assert sum(votes) == 184
results["1.4"] = {"percents": [100 * v / sum(votes) for v in votes],
                    "visible_heights": [52 - 40, 41 - 40], "actual_difference": 52 - 41,
                    "percent_increase": 100 * (52 - 41) / 41}
assert [round(p) for p in results["1.4"]["percents"]] == [28, 26, 24, 22]
assert results["1.4"]["visible_heights"] == [12, 1]
steps = [5.1,5.3,5.5,5.7,5.8,6.1,6.2,6.4,6.6,6.8,6.9,7.1,7.2,7.4,7.5,7.7,7.8,7.9,8.1,8.3,8.6,11.1,11.4,11.8,12.1,12.4,12.7,13.1,13.4,19]
fine = [sum(left <= value < left + 1 for value in steps) for left in range(4, 20)]
coarse = [sum(left <= value < left + 5 for value in steps) for left in range(0, 20, 5)]
assert fine == [0,5,6,7,3,0,0,3,3,2,0,0,0,0,0,1]
assert coarse == [0,21,8,1]
results["1.5"] = {"fine_bin_counts": fine, "coarse_bin_counts": coarse, "total": len(steps),
                    "key_correction": "Only bin boundaries, not exact values, are available to students."}
commutes = [3,13,10,7,4,2,0,1]
assert sum(commutes) == 40
assert sum(commutes[:2]) == 16 and sum(commutes[:3]) == 26
results["1.6"] = {"total": sum(commutes), "under_30": sum(commutes[:3]),
                    "midpoint_mean_estimate": sum((i * 10 + 5) * n for i,n in enumerate(commutes)) / 40,
                    "key_correction": "Midpoint estimate is 27.25, but neither exact mean nor endpoints are known."}
hours = [0,0,0,4,5,6,6,8,8,10,10,12,12,15,30]
q1, q3 = median(hours[:7]), median(hours[8:])
iqr = q3 - q1
results["1.7"] = {"n": len(hours), "sum": sum(hours), "mean": mean(hours), "sd": stdev(hours),
                    "median": median(hours), "q1": q1, "q3": q3, "iqr": iqr,
                    "lower_fence": q1 - 1.5 * iqr, "upper_fence": q3 + 1.5 * iqr,
                    "sum_squared_deviations": sum((x - mean(hours)) ** 2 for x in hours),
                    "included_median_quartiles": [median(hours[:8]), median(hours[7:])]}
assert [q1, q3, iqr, q3 + 1.5 * iqr] == [4,12,8,24]
assert math.isclose(results["1.7"]["sum_squared_deviations"], 795.6)
assert round(stdev(hours), 1) == 7.5 and mean(hours) == 8.4
assert results["1.7"]["included_median_quartiles"] == [4.5, 11]
times = [22,22,23,23,24,24,24,25,25,25,26,26,38,38,39,39,40,40,41,41,42,43,44,55]
summary = [min(times), median(times[:12]), median(times), median(times[12:]), max(times)]
assert summary == [22,24,32,40.5,55]
assert sum(x > 30 for x in times) == 12
results["1.8"] = {"five_number_summary": summary, "over_30": 12, "total": 24,
                    "upper_fence": summary[3] + 1.5 * (summary[3] - summary[1])}
assert results["1.8"]["upper_fence"] == 65.25
results["1.9"] = {"b_iqr": 33-22, "e_iqr": 34-26, "b_range": 40-5, "e_range": 38-18,
                    "b_lower_fence": 22-1.5*(33-22), "b_upper_fence": 33+1.5*(33-22),
                    "e_lower_fence": 26-1.5*(34-26), "e_upper_fence": 34+1.5*(34-26),
                    "bus_mean_difference": 24.5-24, "bus_median_difference": 24-22,
                    "bus_sd_ratio": 6.5/1.8}
assert list(results["1.9"].values())[:4] == [11,8,35,20]
app_counts = [3,7,13,16,9,5,3,2,1,1]
normal_tail = math.erfc(2.5 / math.sqrt(2)) / 2
results["1.10"] = {"total": sum(app_counts), "over_70": sum(app_counts[7:]),
                     "observed_percent": 100 * sum(app_counts[7:]) / sum(app_counts),
                     "z_52": (52-40)/12, "z_70": (70-40)/12,
                     "empirical_tail_percent": (100-68)/2, "normal_tail_percent": 100*normal_tail,
                     "table_tail_percent": 100*(1-0.9938)}
assert sum(app_counts) == 60 and sum(app_counts[7:]) == 4
assert round(100*normal_tail,2) == 0.62
assert round(results["1.10"]["observed_percent"],1) == 6.7
# Given design quantities need consistency checks, not invented outcome estimates.
results["3.1"] = {"response_counts": [412,68], "possible_rounded_yes_counts": [293,30],
                    "rounded_percents": [round(100*293/412), round(100*30/68)]}
assert results["3.1"]["rounded_percents"] == [71,44]
results["3.2"] = {"volunteers": 40, "assignment": "independent coin flip; no fixed group totals asserted"}
results["3.3"] = {"population": 4*300, "sample": 4*12+2, "systematic_interval": 1200//50,
                    "possible_systematic_starts": 24}
assert results["3.3"] == {"population":1200,"sample":50,"systematic_interval":24,"possible_systematic_starts":24}
results["3.4"] = {"mail_response_percent": 100*120/500, "phone_response_percent": 100*240/300,
                    "mail_nonresponse_percent":100*(500-120)/500,
                    "compatible_opposition_percent": [round(100*94/120),round(100*149/240)]}
assert results["3.4"]["compatible_opposition_percent"] == [78,62]
results["3.5"] = {"volunteers": 30, "signup_total":15+15,
                    "assignment": "coin flip; random group sizes need not equal 15"}
results["3.6"] = {"plants":12+12, "per_block":6+6,
                    "treatment_differences":[7.2-6.0,4.0-2.8],
                    "greenhouse_differences":[7.2-4.0,6.0-2.8]}
assert all(math.isclose(x,1.2) for x in results["3.6"]["treatment_differences"])
assert all(math.isclose(x,3.2) for x in results["3.6"]["greenhouse_differences"])
Path(__file__).with_suffix(".json").write_text(json.dumps(results, indent=2)+"\n",encoding="utf-8")
print(f"Numeric checks passed for {len(results)} topics (original and revised keys).")
