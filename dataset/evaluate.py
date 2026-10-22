"""Measure how accurately the pipeline reads reports, against ground truth.

Usage:
    python dataset/evaluate.py --data dataset/synthetic

Prints:
  - test detection: how many tests on the report were found (recall) and how many found tests were real (precision)
  - value accuracy: found tests whose value matches the truth
  - range accuracy: found tests whose printed range matches the truth
  - fully correct: name + value + range all correct (the main number for your report)
Use the same script later to compare the baseline with your fine-tuned model.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medilens.pipeline import extract_from_image  # noqa: E402


def close(a, b):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= max(0.011, abs(b) * 0.005)


def evaluate(folder: Path, limit=None):
    files = sorted(folder.glob("*.json"))[:limit]
    n_true = n_found = n_hit = n_value = n_range = n_full = 0
    errors = []
    for jf in files:
        truth = {t["code"]: t for t in json.load(open(jf, encoding="utf-8"))["tests"]}
        result = extract_from_image(open(jf.with_suffix(".jpg"), "rb").read())
        found = {r["code"]: r for r in result["tests"]}
        n_true += len(truth)
        n_found += len(found)
        for code, t in truth.items():
            r = found.get(code)
            if not r:
                errors.append(f"{jf.stem}: missed {code}")
                continue
            n_hit += 1
            v_ok = close(r["value"], t["value"])
            r_ok = close(r["printed_low"], t["printed_low"]) and close(r["printed_high"], t["printed_high"])
            n_value += v_ok
            n_range += r_ok
            n_full += v_ok and r_ok
            if not (v_ok and r_ok):
                errors.append(f"{jf.stem}: {code} read {r['value']} [{r['printed_low']}, {r['printed_high']}] "
                              f"truth {t['value']} [{t['printed_low']}, {t['printed_high']}]  line: {r['source_line']}")
    pct = lambda a, b: f"{100 * a / b:.1f}%" if b else "n/a"
    print(f"Reports evaluated : {len(files)}")
    print(f"Tests on reports  : {n_true}")
    print(f"Detection recall  : {pct(n_hit, n_true)}   precision: {pct(n_hit, n_found)}")
    print(f"Value accuracy    : {pct(n_value, n_true)}")
    print(f"Range accuracy    : {pct(n_range, n_true)}")
    print(f"Fully correct     : {pct(n_full, n_true)}")
    if errors:
        print("\nFirst errors to study:")
        for e in errors[:15]:
            print("  -", e)
    return {"recall": n_hit / n_true if n_true else 0, "fully_correct": n_full / n_true if n_true else 0}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="dataset/synthetic")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    evaluate(Path(args.data), args.limit)
