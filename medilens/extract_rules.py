"""Step 2 (baseline): turn OCR lines into structured test records using rules.

This rule-based extractor is our BASELINE. Later, our fine-tuned language model
(see training/) will do the same job and must beat this baseline on the test set.
Both return the same record format, so the rest of the system does not change.
"""
import re
from typing import Optional

from .dictionary import get_test, match_test
from .range_engine import standard_range

NUM = r"\d+(?:[.,]\d+)*"

UNIT_PATTERNS = [
    (r"mmol\s*/\s*l", "mmol/L"), (r"mg\s*/\s*d\s*l", "mg/dL"), (r"g\s*/\s*d\s*l", "g/dL"),
    (r"u\s*/\s*l|iu\s*/\s*l", "U/L"), (r"miu\s*/\s*l|uiu\s*/\s*ml|µiu\s*/\s*ml", "mIU/L"),
    (r"ng\s*/\s*d\s*l", "ng/dL"), (r"pg\s*/\s*ml", "pg/mL"), (r"ng\s*/\s*ml", "ng/mL"),
    (r"mg\s*/\s*l", "mg/L"), (r"µmol\s*/\s*l|umol\s*/\s*l", "umol/L"),
    (r"x\s*10\s*\^?\s*9\s*/\s*l|10\^9/l|x10e9/l", "x10^9/L"), (r"x\s*10\s*\^?\s*12\s*/\s*l", "x10^12/L"),
    (r"mill(?:ion)?s?\s*/\s*c(?:u)?mm|mill(?:ion)?s?\s*/\s*(?:µl|ul|mcl)", "x10^12/L"),
    # "K/uL" = thousands per microlitre = x10^9/L ; "M/uL" = millions per microlitre = x10^12/L (checked BEFORE "/ul")
    (r"\bk\s*/\s*(?:µl|ul|mcl)|x?\s*10\s*\^?\s*3\s*/\s*(?:µl|ul|mcl)|thou\w*\s*/\s*(?:µl|ul|mcl|cumm)", "x10^9/L"),
    (r"\bm\s*/\s*(?:µl|ul|mcl)", "x10^12/L"),
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


def unit_position(text: str) -> Optional[int]:
    """Where the first unit starts in the text (None if no unit)."""
    low = text.lower()
    spots = [m.start() for pattern, _ in UNIT_PATTERNS for m in [re.search(pattern, low)] if m]
    return min(spots) if spots else None


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
    text = re.sub(r"(?<![A-Za-z0-9])[!|](?=\d)", "1", text)       # "!1.60" -> "11.60" 
    text = re.sub(r"(\d):(\d)", r"\1.\2", text)
    return text


DIFFERENTIAL = ("neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils")


def repair_range(test: dict, low, high):
    """OCR often damages the printed range ("27 00" -> 2700, "36.00" -> 3600). Repair a bound that is 10x or 100x
    too large when the smaller number matches our standard table; drop a printed range that makes no sense.
    Returns (low, high, was_changed)."""
    std = [b for pair in test["range"].values() for b in pair if b]
    changed = False

    def fix(b):
        nonlocal changed
        if b is None or not std:
            return b
        if any(abs(b - s) <= 0.5 * s for s in std):
            return b
        for div in (10, 100, 1000):
            if any(abs(b / div - s) <= 0.15 * s for s in std):
                changed = True
                return round(b / div, 2)
        return b
    low, high = fix(low), fix(high)
    if low is not None and high is not None and low >= high:   # still impossible: use the standard range instead
        return None, None, True
    return low, high, changed


def parse_line(text: str, ocr_conf: float = 1.0) -> Optional[dict]:
    text = fix_ocr_digits(text)
    tokens = text.replace(":", " ").split()
    if len(tokens) < 2:
        return None
    code, name_score, k = split_name(tokens)
    if not code:
        return None
    rest = " ".join(tokens[k:])
    # The value comes BEFORE the printed range ("33.00 20.00-45.00 0%": the trailing "0%" is noise).
    range_start = re.search(rf"{NUM}\s*(?:-|–|to)\s*{NUM}|[<>]\s*=?\s*{NUM}|up\s*to|less than|more than|greater than", rest, re.I)
    if range_start and not re.search(NUM, rest[:range_start.start()]):
        return None          # only a reference range on this line ("PCV 4.50-5.50"): the result is somewhere else
    head = rest[:range_start.start()] if range_start else rest
    value_match = re.search(NUM, head)
    if value_match:
        # Stray digits can sit between a damaged name and the result ("riaemoglopin 4 12.70 g/dL"):
        # the value is the number right before the unit.
        pos = unit_position(head)
        if pos is not None:
            before = [m for m in re.finditer(NUM, head) if m.end() <= pos]
            if before:
                value_match = before[-1]
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

    # The standard table holds differential counts as PERCENT. Rows in absolute counts (K/uL) are skipped,
    # the percent rows of the same report are used instead.
    if code in DIFFERENTIAL:
        absolute = unit in ("x10^9/L", "/cumm") or (
            unit_assumed and code in ("neutrophils", "lymphocytes") and high is not None and high <= 10)
        if absolute:
            return None
    low, high, repaired = repair_range(test, low, high)

    confidence = round(min(ocr_conf, name_score / 100), 2)
    if repaired:
        confidence = min(confidence, 0.7)
    # Direction check: e.g. HDL is only ever "at least X". A printed "< 40" is a misread ">" -> do not trust it.
    std_low, std_high = standard_range(test, None)
    std_low = std_low or None            # a lower limit of 0 means "no lower limit" (LDL, cholesterol ...)
    # (a standard lower limit of 0 means "no lower limit": LDL "< 130" printed as "> 100" is a misread sign)
    range_conflict = ((low is None and high is not None and std_high is None and bool(std_low)) or
                      (high is None and low is not None and not std_low and std_high is not None))
    if range_conflict:
        low = high = None
        confidence = min(confidence, 0.5)
    # Plausibility check: a value far outside the printed range is often an OCR slip
    # (for example a lost decimal point: "1.3" read as "13"). Ask the user to check it.
    ref_low, ref_high = (low, high) if (low is not None or high is not None) else (std_low, std_high)
    implausible = (ref_high is not None and value > ref_high * 3) or (ref_low and value < ref_low / 3)
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
        "needs_check": confidence < 0.70 or (unit_assumed and low is None and high is None),
        "range_conflict": range_conflict,
        "unit_assumed": unit_assumed,
        "implausible": bool(implausible),
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


def merge_records(*record_lists) -> list:
    """Combine several reads of the same photo into one record per test by VOTING on the value.
    - the value most reads agree on wins (ties: the more confident read);
    - if the winner breaks a known relation between red-cell values (MCHC = Hb/Hct x 100, MCV = Hct/RBC x 10,
      MCH = Hb/RBC x 10) and another read fits the relation, that read is used;
    - a test whose reads disagree stays "needs check"; one that two or more reads agree on loses that flag."""
    from collections import defaultdict
    groups = defaultdict(list)
    for records in record_lists:
        for r in records:
            groups[r["code"]].append(r)
    merged, candidates = {}, {}
    for code, recs in groups.items():
        votes = defaultdict(list)
        for r in recs:
            votes[round(r["value"], 2)].append(r)
        candidates[code] = votes
        weight = lambda g: sum(x.get("_w", 1.0) for x in g)
        # A value far outside its range in one read but normal-looking in another is usually an OCR slip
        # (a pen mark read as a digit: "7296" for "296"), so plausible readings come first.
        plausible = lambda g: not all(x.get("implausible") for x in g)
        ranked = sorted(votes.values(), key=lambda g: (plausible(g), weight(g), max(x["confidence"] for x in g)), reverse=True)
        winner = dict(max(ranked[0], key=lambda x: (x.get("_w", 1.0), x["confidence"])))   # deep-learning read first
        if winner.get("printed_low") is None and winner.get("printed_high") is None:      # take a range another read found
            for other in ranked[0]:
                if other.get("printed_low") is not None or other.get("printed_high") is not None:
                    winner["printed_low"], winner["printed_high"] = other.get("printed_low"), other.get("printed_high")
                    break
        if len(ranked) > 1 and (weight(ranked[0]) <= weight(ranked[1]) or not plausible(ranked[1])):
            winner["needs_check"] = True                      # tie between different readings
        elif len(ranked[0]) >= 2:
            winner["confidence"] = round(min(1.0, winner["confidence"] + 0.1), 2)
            if len(ranked) == 1 and not winner.get("unit_assumed") and not winner.get("range_conflict"):
                winner["needs_check"] = False                 # several reads agree
        merged[code] = winner

    def val(c):
        return merged[c]["value"] if c in merged else None
    hb, hct, rbc = val("hemoglobin"), val("hematocrit"), val("rbc")
    chol, hdl = val("cholesterol"), val("hdl")
    for code, expected, tol in (("mchc", hb / hct * 100 if hb and hct else None, 0.08),
                                ("mcv", hct / rbc * 10 if hct and rbc else None, 0.08),
                                ("mch", hb / rbc * 10 if hb and rbc else None, 0.08),
                                ("non_hdl", chol - hdl if chol and hdl and chol > hdl else None, 0.06)):
        if expected is None or code not in merged:
            continue
        if abs(merged[code]["value"] - expected) / expected > tol:
            fits = [v for v in candidates[code] if abs(v - expected) / expected <= 0.04]
            if fits:
                chosen = dict(max(candidates[code][fits[0]], key=lambda x: x["confidence"]))
                merged[code] = chosen
            merged[code]["needs_check"] = True              # a value that does not fit its relatives: ask the person
    return list(merged.values())
