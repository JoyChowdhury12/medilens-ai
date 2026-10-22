"""Step 2 (baseline): turn OCR lines into structured test records using rules.

This rule-based extractor is our BASELINE. Later, our fine-tuned language model
(see training/) will do the same job and must beat this baseline on the test set.
Both return the same record format, so the rest of the system does not change.
"""
import re
from typing import Optional

from .dictionary import get_test, match_test

NUM = r"\d+(?:[.,]\d+)*"

UNIT_PATTERNS = [
    (r"mmol\s*/\s*l", "mmol/L"), (r"mg\s*/\s*d\s*l", "mg/dL"), (r"g\s*/\s*d\s*l", "g/dL"),
    (r"u\s*/\s*l|iu\s*/\s*l", "U/L"), (r"miu\s*/\s*l|uiu\s*/\s*ml|µiu\s*/\s*ml", "mIU/L"),
    (r"ng\s*/\s*d\s*l", "ng/dL"), (r"pg\s*/\s*ml", "pg/mL"), (r"ng\s*/\s*ml", "ng/mL"),
    (r"mg\s*/\s*l", "mg/L"), (r"µmol\s*/\s*l|umol\s*/\s*l", "umol/L"),
    (r"x\s*10\s*\^?\s*9\s*/\s*l|10\^9/l|x10e9/l", "x10^9/L"), (r"x\s*10\s*\^?\s*12\s*/\s*l", "x10^12/L"),
    (r"mill(?:ion)?s?\s*/\s*c(?:u)?mm|mill(?:ion)?s?\s*/\s*(?:µl|ul|mcl)", "x10^12/L"),
    (r"/\s*cumm|/\s*cmm|/\s*µl|/\s*ul|/\s*mcl|/\s*mm3|\bcumm\b|\bcmm\b", "/cumm"),
    (r"\bfl\b", "fL"), (r"\bpg\b", "pg"), (r"mm\s*/\s*1st\s*h(?:ou)?r|mm/hr", "mm/1st hr"), (r"%", "%"),
]

# Convert other units to our standard unit: (code, unit_found) -> multiply factor
CONVERSIONS = {
    ("fbs", "mg/dL"): 1 / 18.0, ("rbs", "mg/dL"): 1 / 18.0, ("sugar_2h", "mg/dL"): 1 / 18.0,
    ("cholesterol", "mmol/L"): 38.67, ("ldl", "mmol/L"): 38.67, ("hdl", "mmol/L"): 38.67,
    ("triglycerides", "mmol/L"): 88.57, ("creatinine", "umol/L"): 1 / 88.4, ("urea", "mmol/L"): 6.006,
}


def to_float(text: str) -> Optional[float]:
    """'7.4' -> 7.4, '2,45,000' -> 245000, '7,4' -> 7.4 (comma used as decimal point)."""
    text = text.strip()
    if re.fullmatch(r"\d+,\d{1,2}", text):          # 7,4  -> 7.4
        text = text.replace(",", ".")
    text = text.replace(",", "")                    # 2,45,000 -> 245000
    try:
        return float(text)
    except ValueError:
        return None


def find_unit(text: str) -> Optional[str]:
    low = text.lower()
    for pattern, unit in UNIT_PATTERNS:
        if re.search(pattern, low):
            return unit
    return None


def find_range(text: str):
    """Return (low, high) from things like '3.9 - 6.1', '< 200', 'Up to 41', '> 40'."""
    m = re.search(rf"({NUM})\s*(?:-|–|to)\s*({NUM})", text, re.I)
    if m:
        return to_float(m.group(1)), to_float(m.group(2))
    m = re.search(rf"(?:<|less than|up\s*to|upto)\s*=?\s*({NUM})", text, re.I)
    if m:
        return None, to_float(m.group(1))
    m = re.search(rf"(?:>|more than|greater than)\s*=?\s*({NUM})", text, re.I)
    if m:
        return to_float(m.group(1)), None
    return None, None


def split_name(tokens: list):
    """Try the first 1..6 tokens as the test name; keep the best dictionary match.
    The token right after the name must contain a digit (that is where the value starts)."""
    best = (None, 0, 0)  # code, score, number of name tokens
    for k in range(1, min(6, len(tokens)) + 1):
        if k >= len(tokens) or not re.search(r"\d", tokens[k]):
            continue
        if re.fullmatch(r"\d+[.,]\d+\w*", tokens[k - 1]):  # a decimal number is a value, never part of a name
            break
        code, score = match_test(" ".join(tokens[:k]))
        if code and score > best[1]:  # strictly better: the shortest name with the best match wins
            best = (code, score, k)
    return best


def fix_ocr_digits(text: str) -> str:
    """Repair common OCR slips inside numbers: '©.40' -> '0.40', '3:5' -> '3.5', 'O.9' -> '0.9'."""
    text = re.sub(r"(?<![A-Za-z])[Oo©@](?=[.,]\d)", "0", text)
    text = re.sub(r"(\d):(\d)", r"\1.\2", text)
    return text


def parse_line(text: str, ocr_conf: float = 1.0) -> Optional[dict]:
    text = fix_ocr_digits(text)
    tokens = text.replace(":", " ").split()
    if len(tokens) < 2:
        return None
    code, name_score, k = split_name(tokens)
    if not code:
        return None
    rest = " ".join(tokens[k:])
    value_match = re.search(NUM, rest)
    if not value_match:
        return None
    value = to_float(value_match.group(0))
    if value is None:
        return None
    after_value = rest[value_match.end():]
    low, high = find_range(after_value)
    test = get_test(code)
    unit = find_unit(after_value) or find_unit(rest)
    unit_assumed = unit is None
    unit = unit or test["unit"]

    # Bangladeshi labs often write counts per cubic mm: 2,45,000 /cumm -> 245 x10^9/L
    if code in ("platelets", "wbc") and (unit == "/cumm" or value >= 1000):
        value, unit = value / 1000, "x10^9/L"
        low = low / 1000 if low and low >= 1000 else low
        high = high / 1000 if high and high >= 1000 else high

    factor = CONVERSIONS.get((code, unit))
    if factor:
        value = value * factor
        low = low * factor if low is not None else None
        high = high * factor if high is not None else None
        unit = test["unit"]

    confidence = round(min(ocr_conf, name_score / 100), 2)
    # Plausibility check: a value far outside the printed range is often an OCR slip
    # (for example a lost decimal point: "1.3" read as "13"). Ask the user to check it.
    implausible = (high is not None and value > high * 3) or (low and value < low / 3)
    if implausible:
        confidence = min(confidence, 0.5)
    return {
        "code": code,
        "name": test["name"],
        "raw_name": " ".join(tokens[:k]),
        "value": round(value, 2),
        "unit": unit,
        "printed_low": round(low, 2) if low is not None else None,
        "printed_high": round(high, 2) if high is not None else None,
        "confidence": confidence,
        "needs_check": confidence < 0.80 or unit_assumed,
        "source_line": text,
    }


def extract(lines: list) -> list:
    """lines: list of OcrLine (or objects with .text and .confidence). Keeps the first hit per test."""
    records, seen = [], set()
    for line in lines:
        rec = parse_line(line.text, getattr(line, "confidence", 1.0))
        if rec and rec["code"] not in seen:
            seen.add(rec["code"])
            records.append(rec)
    return records
