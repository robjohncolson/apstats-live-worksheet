"""Independent scipy reference values for the Track C template samples
(TI84_TRAINER_TEMPLATES_SPEC.md 7B). Reads tests/ti84-template-samples.json,
recomputes each answer with scipy (never with stat-math.js), and writes
tests/ti84-template-reference-values.json keyed {templateId, seed}.

Usage: python tools/ti84_template_reference.py
"""
import json
import math
from pathlib import Path

from scipy.stats import norm

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


COMPUTE = {
    "one-propztest": lambda v: one_prop_z_test(v["p0"], v["x"], v["n"], v["direction"]),
    "one-propzint": lambda v: one_prop_z_int(v["x"], v["n"], v["cLevel"]),
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
