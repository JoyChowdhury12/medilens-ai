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


def enabled() -> bool:
    return MODEL_URL.startswith(("http://localhost", "http://127.0.0.1"))


def _generate(prompt: str, timeout: int = 60) -> Optional[str]:
    if not enabled():
        return None
    body = json.dumps({"model": MODEL_NAME, "prompt": prompt, "stream": False,
                       "options": {"temperature": 0.1}}).encode()
    req = urllib.request.Request(f"{MODEL_URL}/api/generate", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())["response"]
    except Exception:
        return None  # any problem -> caller falls back to rules/templates


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


def explain_with_model(name, value, unit, status, direction, reason) -> Optional[str]:
    out = _generate(EXPLAIN_PROMPT.format(name=name, value=value, unit=unit, status=status,
                                          direction=direction or "-", reason=reason))
    return out.strip() if out else None
