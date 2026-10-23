"""Builds the fine-tuning data for the Bangla explanation model.

Every example = (prompt built by medilens.local_model.build_explain_prompt) -> (safe Bangla explanation).
- The status of each value comes from OUR range engine, so the data is always consistent with the app.
- The explanation is assembled from reviewed sentences (explain_bn.MEANING, combos.COMBOS) with many different
  openers / endings, so the model learns natural variety but never invents medical facts.
- Every target is checked by medilens.guard; examples that fail are dropped.

Usage:  python training/make_dataset.py --n 6000 --out training/data
Output: train.jsonl (messages only)   test.jsonl (messages + meta, for evaluation)
"""
import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from medilens import guard                                    # noqa: E402
from medilens.combos import combo_sentences                    # noqa: E402
from medilens.dictionary import get_test, load_tests           # noqa: E402
from medilens.explain_bn import MEANING, bn_num                # noqa: E402
from medilens.local_model import build_explain_prompt          # noqa: E402
from medilens.range_engine import classify, standard_range     # noqa: E402

OPEN = {
    ("high", "high"): ["আপনার {n} {v} {u}, যা স্বাভাবিকের চেয়ে বেশি।", "{n} স্বাভাবিকের চেয়ে বেশি এসেছে: {v} {u}।",
                       "রিপোর্টে আপনার {n} বেশি দেখা যাচ্ছে ({v} {u})।", "আপনার {n}-এর মান {v} {u}, অর্থাৎ স্বাভাবিকের চেয়ে বেশি।"],
    ("low", "low"): ["আপনার {n} {v} {u}, যা স্বাভাবিকের চেয়ে কম।", "{n} স্বাভাবিকের চেয়ে কম এসেছে: {v} {u}।",
                     "রিপোর্টে আপনার {n} কম দেখা যাচ্ছে ({v} {u})।", "আপনার {n}-এর মান {v} {u}, অর্থাৎ স্বাভাবিকের চেয়ে কম।"],
    ("borderline", "high"): ["আপনার {n} {v} {u}, যা স্বাভাবিক সীমার সামান্য বেশি (বর্ডারলাইন)।",
                             "{n} বর্ডারলাইনে আছে, মান {v} {u} এবং সীমার একটু বেশি।"],
    ("borderline", "low"): ["আপনার {n} {v} {u}, যা স্বাভাবিক সীমার সামান্য কম (বর্ডারলাইন)।",
                            "{n} বর্ডারলাইনে আছে, মান {v} {u} এবং সীমার একটু কম।"],
    ("critical", "high"): ["আপনার {n} {v} {u}, যা বিপজ্জনক মাত্রায় বেশি।", "সতর্কতা: {n} বিপজ্জনকভাবে বেশি ({v} {u})।"],
    ("critical", "low"): ["আপনার {n} {v} {u}, যা বিপজ্জনক মাত্রায় কম।", "সতর্কতা: {n} বিপজ্জনকভাবে কম ({v} {u})।"],
}
RANGE_S = ["স্বাভাবিক সীমা {r}।", "সাধারণত এই মান {r}-এর মধ্যে থাকে।", "রেফারেন্স সীমা {r}।"]
ACTION = {
    "high": ["এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।", "ডাক্তারের সাথে কথা বলে কারণ জেনে নেওয়া ভালো।", "রিপোর্টটি ডাক্তারকে দেখান।"],
    "low": ["এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।", "ডাক্তারের সাথে কথা বলে কারণ জেনে নেওয়া ভালো।", "রিপোর্টটি ডাক্তারকে দেখান।"],
    "borderline": ["পরবর্তী চেকআপে ডাক্তারের সাথে বিষয়টি আলোচনা করুন।", "ভয়ের কিছু নেই, তবে ডাক্তারকে জানিয়ে রাখুন।"],
    "critical": ["দেরি না করে আজই হাসপাতালে বা ডাক্তারের কাছে যান।", "এখনই ডাক্তারের কাছে যাওয়া জরুরি, দেরি করবেন না।"],
}


def _fmt_range(low, high, unit):
    f = lambda x: bn_num(f"{x:.2f}".rstrip("0").rstrip("."))
    if low is not None and high is not None:
        return f"{f(low)} - {f(high)} {unit}"
    return None  # one-sided ranges are skipped in the sentence


def sample_value(rng, test, sex, want):
    """A value of roughly the wanted status (the range engine decides the real status afterwards)."""
    low, high = standard_range(test, sex)
    crit = test.get("critical") or [None, None]
    d = rng.choice(["high", "low"])
    if d == "high" and high is None:
        d = "low"
    if d == "low" and low is None:
        d = "high"
    if want == "critical":
        edge = crit[1] if d == "high" else crit[0]
        if edge is None:
            return None
        v = edge * (1.05 if d == "high" else 0.9)
    elif want == "borderline":
        band = test.get("borderline_to") if d == "high" else test.get("borderline_from")
        edge = high if d == "high" else low
        if band is None or edge is None:
            return None
        v = edge + rng.uniform(0.15, 0.9) * (band - edge)
    else:
        edge = high if d == "high" else low
        v = edge * (1 + rng.uniform(0.05, 0.6)) if d == "high" else edge * (1 - rng.uniform(0.05, 0.5))
    return round(v, 2 if abs(v) < 10 else 1 if abs(v) < 200 else 0)


def make_target(rng, test, verdict, abnormal_pairs):
    key = (verdict.status, verdict.direction)
    parts = [rng.choice(OPEN[key]).format(n=test["bn"], v=bn_num(verdict.value), u=test["unit"])]
    rs = _fmt_range(verdict.low, verdict.high, test["unit"])
    if rs and rng.random() < 0.5:
        parts.append(rng.choice(RANGE_S).format(r=rs))
    meaning = MEANING.get(verdict.code, {}).get(verdict.direction)
    if meaning and verdict.status != "critical" or (meaning and rng.random() < 0.5):
        parts.append(meaning)
    combos = combo_sentences(abnormal_pairs)
    if combos and rng.random() < 0.85:
        parts.append(rng.choice(combos))
    parts.append(rng.choice(ACTION[verdict.status]))
    return " ".join(parts)


def build(n, seed):
    rng = random.Random(seed)
    codes = [c for c in load_tests() if c in MEANING]
    seen, rows = set(), []
    tries = 0
    while len(rows) < n and tries < n * 30:
        tries += 1
        code = rng.choice(codes)
        test = get_test(code)
        sex = rng.choice(["male", "female", None])
        age = rng.choice([None, rng.randint(5, 85)])
        want = rng.choices(["high_low", "borderline", "critical"], [0.65, 0.2, 0.15])[0]
        v = sample_value(rng, test, sex, want)
        if v is None:
            continue
        verdict = classify(code, v, sex)
        if verdict.status == "normal":
            continue
        # a few other abnormal values from the same (imaginary) report
        related, pairs = [], [(code, verdict.direction)]
        for _ in range(rng.choice([0, 0, 1, 2, 3])):
            oc = rng.choice(codes)
            if oc == code or any(oc == r[0] for r in related):
                continue
            ot = get_test(oc)
            ov = sample_value(rng, ot, sex, "high_low")
            if ov is None:
                continue
            ovd = classify(oc, ov, sex)
            if ovd.status == "normal":
                continue
            related.append((oc, ovd))
            pairs.append((oc, ovd.direction))
        # bias towards realistic combinations sometimes, so the combo sentences are actually learned
        rel_prompt = [(get_test(c)["name"], f"{o.status}/{o.direction}", o.value, get_test(c)["unit"]) for c, o in related]
        prompt = build_explain_prompt(test["name"], test["bn"], verdict.value, test["unit"], verdict.status, verdict.direction,
                                      verdict.low, verdict.high, sex, age, rel_prompt)
        if prompt in seen:
            continue
        target = make_target(rng, test, verdict, pairs)
        allowed = [x for x in (verdict.low, verdict.high, age) if x is not None] + [o.value for _, o in related]
        fails = guard.check_explanation(target, value=verdict.value, status=verdict.status, direction=verdict.direction,
                                        allowed_numbers=allowed)
        if fails:
            continue
        seen.add(prompt)
        rows.append({"messages": [{"role": "user", "content": prompt}, {"role": "assistant", "content": target}],
                     "meta": {"code": code, "value": verdict.value, "status": verdict.status, "direction": verdict.direction,
                              "allowed": allowed, "pairs": pairs}})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=6000)
    ap.add_argument("--test-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="training/data")
    a = ap.parse_args()
    rows = build(a.n, a.seed)
    k = int(len(rows) * a.test_frac)
    test, train = rows[:k], rows[k:]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "train.jsonl", "w", encoding="utf-8") as f:
        for r in train:
            f.write(json.dumps({"messages": r["messages"]}, ensure_ascii=False) + "\n")
    with open(out / "test.jsonl", "w", encoding="utf-8") as f:
        for r in test:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"train={len(train)} test={len(test)} -> {out}")


if __name__ == "__main__":
    main()
