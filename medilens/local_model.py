"""Hook for OUR fine-tuned language model, served locally (no external API).

Until the model is trained, this stays switched off and the system uses the
rule-based extractor and Bangla templates. To switch it on later:
  1. Serve your fine-tuned model locally with Ollama (see training/README.md).
  2. Set environment variables, for example:
       MEDILENS_MODEL_URL=http://localhost:11434
       MEDILENS_MODEL_NAME=medilens-v1
The model is only ever called on localhost; report data never leaves your server.
"""
import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional

MODEL_URL = os.getenv("MEDILENS_MODEL_URL", "")
MODEL_NAME = os.getenv("MEDILENS_MODEL_NAME", "medilens-v1")

EXTRACT_PROMPT = """You read OCR text from an English lab report.
Return ONLY a JSON list. Each item: {{"test": raw test name, "value": number, "unit": text or null,
"low": number or null, "high": number or null}}. Skip lines that are not test results.

OCR text:
{ocr_text}
"""

EXPLAIN_PROMPT = """নিচের যাচাই করা ল্যাব ফলাফলটি সহজ বাংলায় ২-৩ বাক্যে ব্যাখ্যা করো।
কোনো ওষুধ বা ডোজের নাম বলবে না। রোগ নির্ণয় করবে না। "হতে পারে" ধরনের সতর্ক ভাষা ব্যবহার করো।

পরীক্ষা: {name}
মান: {value} {unit}
অবস্থা: {status} ({direction})
কারণ: {reason}
"""


# Used by the fine-tuned model. The training data uses EXACTLY this prompt (training/make_dataset.py).
EXPLAIN_PROMPT_V2 = """তুমি MediLens-এর সহায়ক। নিচের যাচাই করা ল্যাব ফলাফলটি সাধারণ মানুষের জন্য সহজ বাংলায় ২-৪ বাক্যে ব্যাখ্যা করো।
নিয়ম: অবস্থা (বেশি/কম) ও সংখ্যা বদলাবে না; কোনো ওষুধ বা ডোজের নাম বলবে না; রোগ নির্ণয় করবে না; সতর্ক ভাষা ("হতে পারে") ব্যবহার করবে; শেষে ডাক্তারের পরামর্শের কথা বলবে।

পরীক্ষা: {name} ({name_bn})
মান: {value} {unit}
অবস্থা: {status_bn} ({status})
স্বাভাবিক সীমা: {range}
রোগীর লিঙ্গ ও বয়স: {who}
রিপোর্টের অন্যান্য অস্বাভাবিক মান: {related}
"""

_STATUS_BN = {"high": "স্বাভাবিকের চেয়ে বেশি", "low": "স্বাভাবিকের চেয়ে কম",
              "borderline": "সীমার সামান্য বাইরে (বর্ডারলাইন)", "critical": "বিপজ্জনক মাত্রা"}
_SEX_BN = {"male": "পুরুষ", "female": "নারী"}


def _num(x) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)


def build_explain_prompt(name, name_bn, value, unit, status, direction, low, high, sex=None, age=None, related=None) -> str:
    """related: list of (name, status, value, unit) for the OTHER abnormal values in the same report."""
    if low is not None and high is not None:
        rng = f"{_num(low)} - {_num(high)} {unit}"
    elif high is not None:
        rng = f"{_num(high)} {unit}-এর নিচে"
    elif low is not None:
        rng = f"{_num(low)} {unit}-এর উপরে"
    else:
        rng = "জানা নেই"
    who = ", ".join(x for x in (_SEX_BN.get(sex), f"{age} বছর" if age else None) if x) or "জানা নেই"
    status_bn = _STATUS_BN.get(status, status)
    if status in ("borderline", "critical") and direction:
        status_bn += " - " + ("বেশি" if direction == "high" else "কম")
    rel = "; ".join(f"{n}: {s_} ({_num(v)} {u})" for n, s_, v, u in (related or [])) or "নেই"
    return EXPLAIN_PROMPT_V2.format(name=name, name_bn=name_bn, value=_num(value), unit=unit, status_bn=status_bn,
                                    status=f"{status}/{direction}" if direction else status, range=rng, who=who, related=rel)


# How many explanations to write at the same time. Ollama must allow it: set OLLAMA_NUM_PARALLEL to the same number.
PARALLEL = max(1, int(os.getenv("MEDILENS_MODEL_PARALLEL", "4")))


def extract_enabled() -> bool:
    """Reading the report with the language model is OFF unless asked: our model is fine-tuned for explanations,
    and the OCR + rules extractor is faster and tested (MEDILENS_MODEL_EXTRACT=1 turns it on)."""
    return enabled() and os.getenv("MEDILENS_MODEL_EXTRACT") == "1"


def enabled() -> bool:
    return MODEL_URL.startswith(("http://localhost", "http://127.0.0.1"))


def _generate(prompt: str, timeout: int = 60) -> Optional[str]:
    if not enabled():
        return None
    for think in (False, None):   # some models (e.g. Gemma) reject the "think" option: retry without it
        payload = {"model": MODEL_NAME, "prompt": prompt, "stream": False, "keep_alive": "30m",   # stay loaded
                   "options": {"temperature": 0.1, "num_predict": 260}}                                # 2-4 sentences
        if think is not None:
            payload["think"] = think
        req = urllib.request.Request(f"{MODEL_URL}/api/generate", data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())["response"]
        except urllib.error.HTTPError as e:
            if e.code != 400 or think is None:
                return None
        except Exception:
            return None  # any problem -> caller falls back to rules/templates
    return None


def extract_with_model(ocr_text: str) -> Optional[list]:
    out = _generate(EXTRACT_PROMPT.format(ocr_text=ocr_text))
    if not out:
        return None
    try:
        start, end = out.index("["), out.rindex("]") + 1
        items = json.loads(out[start:end])
        return [i for i in items if isinstance(i, dict) and "test" in i and "value" in i]
    except (ValueError, json.JSONDecodeError):
        return None


def explain_with_model(name, value, unit, status, direction, reason, *, prompt: Optional[str] = None) -> Optional[str]:
    """prompt: built with build_explain_prompt (the fine-tuned model). Without it the old prompt is used."""
    out = _generate(prompt or EXPLAIN_PROMPT.format(name=name, value=value, unit=unit, status=status,
                                                    direction=direction or "-", reason=reason))
    if not out:
        return None
    out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()   # some models print their reasoning
    return out or None
