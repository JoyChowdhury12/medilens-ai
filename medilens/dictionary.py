"""Test dictionary: loads tests.json and matches raw test names to standard codes.

Different labs write the same test differently ("FBS", "Fasting Blood Sugar",
"S. Creatinine"). We clean the raw name and fuzzy-match it against every alias.
"""
import json
import re
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

DATA_FILE = Path(__file__).parent / "data" / "tests.json"
MATCH_THRESHOLD = 86  # 0-100; below this we treat the name as "unknown test"
FALLBACK_THRESHOLD = 74  # damaged-by-OCR names: allowed only when one test is clearly the closest ...
FALLBACK_MARGIN = 12     # ... by this many points over the best different test (the user is asked to check it)


def clean_name(text: str) -> str:
    """Lower-case, drop punctuation and extra spaces: 'S. Creatinine' -> 's creatinine'."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9%+\- ]", " ", text)
    text = text.replace("-", " ")
    return re.sub(r"\s+", " ", text).strip()


@lru_cache(maxsize=1)
def load_tests() -> dict:
    """Return {code: test_info} from tests.json."""
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return {t["code"]: t for t in data["tests"]}


@lru_cache(maxsize=1)
def _alias_table() -> dict:
    """Map every cleaned alias -> test code."""
    table = {}
    for code, test in load_tests().items():
        for alias in test["aliases"] + [test["name"]]:
            table[clean_name(alias)] = code
    return table


def match_test(raw_name: str):
    """Return (code, score 0-100) for a raw test name, or (None, score) if no good match.
    Also tries the name without its bracket part: 'Sodium (Na+)' -> 'Sodium'."""
    best = _match_one(raw_name)
    if best[0] is None or best[1] < 100:
        # Also try without the bracket part, and the bracket part alone: 'Packed Cell Volume (PCV)' -> 'PCV'
        variants = [re.sub(r"\(.*?\)", " ", raw_name)] + re.findall(r"\((.*?)\)", raw_name)
        for variant in variants:
            if variant.strip() and variant != raw_name:
                other = _match_one(variant)
                if other[0] and other[1] > best[1]:
                    best = other
    return best


def _match_one(raw_name: str):
    cleaned = clean_name(raw_name)
    if not cleaned:
        return None, 0
    table = _alias_table()
    if cleaned in table:  # exact alias match
        return table[cleaned], 100
    if _is_ratio(cleaned):   # "Total Cholesterol / HDL ratio" is a calculated value, not a test we judge
        return None, 0
    best = process.extractOne(cleaned, table.keys(), scorer=fuzz.ratio)
    if best and _confusable(cleaned, best[0]):
        return None, round(best[1])
    if best and best[1] >= MATCH_THRESHOLD:
        return table[best[0]], round(best[1])
    if best and best[1] >= FALLBACK_THRESHOLD and len(cleaned) >= 8:
        # OCR-damaged name ("Tnglycende" for "Triglyceride"): accept only if ONE test is clearly the closest.
        scored = process.extract(cleaned, table.keys(), scorer=fuzz.ratio, limit=6)
        others = [sc for alias, sc, _ in scored if table[alias] != table[best[0]]]
        if not others or best[1] - max(others) >= FALLBACK_MARGIN:
            return table[best[0]], round(best[1])
    return None, round(best[1]) if best else 0


def _is_ratio(cleaned: str) -> bool:
    return any(fuzz.ratio(w, "ratio") >= 70 for w in cleaned.split())


# Names that differ by one letter but mean different tests: never fuzzy-match one to the other.
CONFUSABLE = [("rbc", "wbc"), ("hdl", "ldl"), ("ft3", "ft4"), ("alt", "alp"), ("ast", "alt")]


def _confusable(cleaned: str, alias: str) -> bool:
    words, alias_words = set(cleaned.split()), set(alias.split())
    return any((a in words and b in alias_words) or (b in words and a in alias_words) for a, b in CONFUSABLE)


def get_test(code: str) -> dict:
    return load_tests()[code]
