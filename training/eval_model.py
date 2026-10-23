"""Compares the template baseline, the base model and the fine-tuned model on training/data/test.jsonl.

  python training/eval_model.py --models qwen3:4b medilens-qwen --n 200 --out training/out/eval

For each model it asks Ollama (temperature 0.1) and scores every answer with medilens.guard.check_explanation:
  pass rate (all safety/accuracy checks), and the rate of each failed check.
It also writes samples.csv (prompt, template, each model) so 3 people can rate naturalness 1-5 by hand.
Models with a low pass rate are not allowed to replace the templates.
"""
import argparse
import csv
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from medilens import guard                      # noqa: E402
from medilens.explain_bn import explain_one      # noqa: E402
from medilens.range_engine import classify       # noqa: E402


def ask(url, model, prompt, timeout=180):
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False, "think": False,
                       "options": {"temperature": 0.1, "num_predict": 400}}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/api/chat", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = json.load(r)["message"]["content"]
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def score(rows, texts):
    fails, passed = Counter(), 0
    for row, text in zip(rows, texts):
        m = row["meta"]
        f = guard.check_explanation(text, value=m["value"], status=m["status"], direction=m["direction"], allowed_numbers=m["allowed"])
        passed += not f
        fails.update(f)
    return passed / len(rows), fails


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="+", required=True)
    ap.add_argument("--test", default="training/data/test.jsonl")
    ap.add_argument("--url", default="http://localhost:11434")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--out", default="training/out/eval")
    a = ap.parse_args()

    rows = [json.loads(l) for l in open(a.test, encoding="utf-8")][: a.n]
    prompts = [r["messages"][0]["content"] for r in rows]
    answers = {"template": [explain_one(classify(r["meta"]["code"], r["meta"]["value"], _sex(r))) for r in rows]}
    for m in a.models:
        outs = []
        for i, p in enumerate(prompts):
            try:
                outs.append(ask(a.url, m, p))
            except Exception as e:  # a failed call counts as a failed answer
                outs.append("")
            if (i + 1) % 20 == 0:
                print(f"{m}: {i + 1}/{len(prompts)}", flush=True)
        answers[m] = outs

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    lines = ["| system | pass rate | top failures |", "| --- | --- | --- |"]
    for name, texts in answers.items():
        rate, fails = score(rows, texts)
        lines.append(f"| {name} | {rate:.1%} | {', '.join(f'{k}:{v}' for k, v in fails.most_common(4)) or '-'} |")
    (out / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))

    with open(out / "samples.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "test", "value", "status", *answers.keys(), *[f"rating_{k}(1-5)" for k in answers]])
        for i, r in enumerate(rows[:20]):
            m = r["meta"]
            w.writerow([i, m["code"], m["value"], m["status"], *[answers[k][i] for k in answers], *[""] * len(answers)])
    print("wrote", out / "results.md", "and", out / "samples.csv")


def _sex(row):
    p = row["messages"][0]["content"]
    return "male" if "পুরুষ" in p else "female" if "নারী" in p else None


if __name__ == "__main__":
    main()
