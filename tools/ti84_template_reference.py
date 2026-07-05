"""Independent scipy reference values for the Track C template samples
(TI84_TRAINER_TEMPLATES_SPEC.md 7B). Reads tests/ti84-template-samples.json,
recomputes each answer with scipy (never with stat-math.js), and writes
tests/ti84-template-reference-values.json keyed {templateId, seed}.

Usage: python tools/ti84_template_reference.py
"""
import json
import math
from pathlib import Path

from scipy.stats import norm, t as tdist

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "tests" / "ti84-template-samples.json"
OUT = ROOT / "tests" / "ti84-template-reference-values.json"


def one_prop_z_test(p0, x, n, direction):
    p_hat = x / n
    se = math.sqrt(p0 * (1 - p0) / n)
    z = (p_hat - p0) / se
    if direction == ">":
        p = 1 - norm.cdf(z)
    elif direction == "<":
        p = norm.cdf(z)
    else:  # two-tailed
        p = 2 * (1 - norm.cdf(abs(z)))
    return {"z": round(z, 7), "p": round(p, 7)}


def one_prop_z_int(x, n, c_level):
    p_hat = x / n
    z_star = norm.ppf(1 - (1 - c_level) / 2)
    me = z_star * math.sqrt(p_hat * (1 - p_hat) / n)
    return {"lower": round(p_hat - me, 7), "upper": round(p_hat + me, 7)}


def t_test(mu0, xbar, sx, n, direction):
    se = sx / math.sqrt(n)
    t = (xbar - mu0) / se
    df = n - 1
    if direction == ">":
        p = 1 - tdist.cdf(t, df)
    elif direction == "<":
        p = tdist.cdf(t, df)
    else:
        p = 2 * (1 - tdist.cdf(abs(t), df))
    return {"t": round(t, 7), "p": round(p, 7)}


def t_interval(xbar, sx, n, c_level):
    t_star = tdist.ppf(1 - (1 - c_level) / 2, n - 1)
    me = t_star * sx / math.sqrt(n)
    return {"lower": round(xbar - me, 7), "upper": round(xbar + me, 7)}


def two_prop_z_test(x1, n1, x2, n2, direction):
    p1, p2 = x1 / n1, x2 / n2
    p_pool = (x1 + x2) / (n1 + n2)  # TI 2-PropZTest uses the POOLED p-hat
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    z = (p1 - p2) / se
    if direction == ">":
        p = 1 - norm.cdf(z)
    elif direction == "<":
        p = norm.cdf(z)
    else:
        p = 2 * (1 - norm.cdf(abs(z)))
    return {"z": round(z, 7), "p": round(p, 7)}


def two_prop_z_int(x1, n1, x2, n2, c_level):
    p1, p2 = x1 / n1, x2 / n2
    se = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)  # UNpooled
    z_star = norm.ppf(1 - (1 - c_level) / 2)
    diff = p1 - p2
    return {"lower": round(diff - z_star * se, 7), "upper": round(diff + z_star * se, 7)}


def welch_df(s1, n1, s2, n2):
    v1, v2 = s1 * s1 / n1, s2 * s2 / n2
    return (v1 + v2) ** 2 / (v1 * v1 / (n1 - 1) + v2 * v2 / (n2 - 1))


def two_samp_t_test(xbar1, s1, n1, xbar2, s2, n2, direction):
    se = math.sqrt(s1 * s1 / n1 + s2 * s2 / n2)
    t = (xbar1 - xbar2) / se
    df = welch_df(s1, n1, s2, n2)
    if direction == ">":
        p = 1 - tdist.cdf(t, df)
    elif direction == "<":
        p = tdist.cdf(t, df)
    else:
        p = 2 * (1 - tdist.cdf(abs(t), df))
    return {"t": round(t, 7), "p": round(p, 7)}


def two_samp_t_int(xbar1, s1, n1, xbar2, s2, n2, c_level):
    se = math.sqrt(s1 * s1 / n1 + s2 * s2 / n2)
    df = welch_df(s1, n1, s2, n2)
    t_star = tdist.ppf(1 - (1 - c_level) / 2, df)
    diff = xbar1 - xbar2
    return {"lower": round(diff - t_star * se, 7), "upper": round(diff + t_star * se, 7)}


COMPUTE = {
    "one-propztest": lambda v: one_prop_z_test(v["p0"], v["x"], v["n"], v["direction"]),
    "one-propzint": lambda v: one_prop_z_int(v["x"], v["n"], v["cLevel"]),
    "t-test-stats": lambda v: t_test(v["mu0"], v["xbar"], v["sx"], v["n"], v["direction"]),
    "t-interval-stats": lambda v: t_interval(v["xbar"], v["sx"], v["n"], v["cLevel"]),
    "two-propztest": lambda v: two_prop_z_test(v["x1"], v["n1"], v["x2"], v["n2"], v["direction"]),
    "two-propzint": lambda v: two_prop_z_int(v["x1"], v["n1"], v["x2"], v["n2"], v["cLevel"]),
    "two-samp-ttest": lambda v: two_samp_t_test(v["xbar1"], v["sx1"], v["n1"], v["xbar2"], v["sx2"], v["n2"], v["direction"]),
    "two-samp-tint": lambda v: two_samp_t_int(v["xbar1"], v["sx1"], v["n1"], v["xbar2"], v["sx2"], v["n2"], v["cLevel"]),
}


def main():
    samples = json.loads(SAMPLES.read_text(encoding="utf-8"))
    refs = []
    for sample in samples:
        compute = COMPUTE[sample["templateId"]]
        refs.append({
            "templateId": sample["templateId"],
            "templateHash": sample["templateHash"],
            "seed": sample["seed"],
            "ref": compute(sample["values"]),
        })
    OUT.write_text(json.dumps(refs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(refs)} reference values to {OUT}")


if __name__ == "__main__":
    main()
