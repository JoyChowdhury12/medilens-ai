"""Build fine-tuning data for OUR language model from the synthetic reports.

For every report it creates two kinds of training examples (chat format, JSONL):
  1. extraction:  real OCR text of the image  ->  JSON list of tests exactly as printed
  2. explanation: a verified result           ->  reviewed Bangla explanation (from our templates)

The OCR text comes from actually running our OCR on the noisy images, so the model
learns to cope with real OCR mistakes.

Usage:
    python dataset/prepare_finetune_data.py --data dataset/synthetic --out dataset/finetune --test-share 0.15
Then upload the two .jsonl files to Google Colab / Kaggle for LoRA fine-tuning (see training/README.md).
"""
import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medilens.dictionary import get_test  # noqa: E402
from medilens.explain_bn import explain_one  # noqa: E402
from medilens.local_model import EXPLAIN_PROMPT, EXTRACT_PROMPT  # noqa: E402
from medilens.ocr import ocr_image_bytes  # noqa: E402
from medilens.range_engine import classify  # noqa: E402


def chat(prompt, answer):
    return {"messages": [{"role": "user", "content": prompt}, {"role": "assistant", "content": answer}]}


def build(data_dir: Path, out_dir: Path, test_share: float, seed: int = 1):
    files = sorted(data_dir.glob("*.json"))
    random.Random(seed).shuffle(files)
    n_test = max(1, int(len(files) * test_share))
    splits = {"test": files[:n_test], "train": files[n_test:]}
    out_dir.mkdir(parents=True, exist_ok=True)
    for split, group in splits.items():
        n = 0
        with open(out_dir / f"{split}.jsonl", "w", encoding="utf-8") as out:
            for jf in group:
                truth = json.load(open(jf, encoding="utf-8"))
                _, lines = ocr_image_bytes(jf.with_suffix(".jpg").read_bytes())
                ocr_text = "\n".join(l.text for l in lines)
                target = [t["as_printed"] for t in truth["tests"]]
                out.write(json.dumps(chat(EXTRACT_PROMPT.format(ocr_text=ocr_text),
                                          json.dumps(target, ensure_ascii=False)), ensure_ascii=False) + "\n")
                n += 1
                for t in truth["tests"]:
                    v = classify(t["code"], t["value"], truth["sex"], t["printed_low"], t["printed_high"])
                    if v.status == "normal":
                        continue
                    test = get_test(t["code"])
                    prompt = EXPLAIN_PROMPT.format(name=test["name"], value=v.value, unit=test["unit"],
                                                   status=v.status, direction=v.direction, reason=v.reason)
                    out.write(json.dumps(chat(prompt, explain_one(v)), ensure_ascii=False) + "\n")
                    n += 1
        print(f"{split}: {len(group)} reports -> {n} examples in {out_dir / (split + '.jsonl')}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="dataset/synthetic")
    ap.add_argument("--out", default="dataset/finetune")
    ap.add_argument("--test-share", type=float, default=0.15)
    args = ap.parse_args()
    build(Path(args.data), Path(args.out), args.test_share)
