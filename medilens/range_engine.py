"""Explainable reference-range engine.

This is OUR code, not the AI: it decides whether each value is normal,
borderline, low, high or critical, and explains why with the numbers.
The AI model only reads the report; it never decides a status.
"""
from dataclasses import dataclass, asdict
from typing import Optional

from .dictionary import get_test

NORMAL, BORDERLINE, LOW, HIGH, CRITICAL = "normal", "borderline", "low", "high", "critical"


@dataclass
class Verdict:
    code: str
    value: float
    status: str
    direction: str            # "high", "low" or "" (normal)
    low: Optional[float]
    high: Optional[float]
    range_source: str         # "report" (printed) or "standard" (our table)
    reason: str

    def to_dict(self):
        return asdict(self)


def fmt(x: float) -> str:
    """7.40 -> '7.4', 200.0 -> '200'."""
    return f"{x:.2f}".rstrip("0").rstrip(".")


def standard_range(test: dict, sex: Optional[str]):
    """Pick the range for this sex. If sex is unknown, use the widest range to avoid false alarms."""
    ranges = test["range"]
    if "any" in ranges:
        return ranges["any"]
    if sex in ("male", "female"):
        return ranges[sex]
    lows = [r[0] for r in ranges.values() if r[0] is not None]
    highs = [r[1] for r in ranges.values() if r[1] is not None]
    return [min(lows) if lows else None, max(highs) if highs else None]


def classify(code: str, value: float, sex: Optional[str] = None,
             printed_low: Optional[float] = None, printed_high: Optional[float] = None) -> Verdict:
    test = get_test(code)

    # 1. Which range? The range printed on the report wins; otherwise our standard table.
    if printed_low is not None or printed_high is not None:
        low, high, source = printed_low, printed_high, "report"
    else:
        low, high = standard_range(test, sex)
        source = "standard"
    where = "printed on your report" if source == "report" else "in the standard range for your age and sex"

    # 2. Critical limits come first: these need urgent care.
    crit = test.get("critical") or [None, None]
    if crit[0] is not None and value < crit[0]:
        return Verdict(code, value, CRITICAL, "low", low, high, source,
                       f"{fmt(value)} is below the critical limit {fmt(crit[0])}; seek medical care urgently")
    if crit[1] is not None and value > crit[1]:
        return Verdict(code, value, CRITICAL, "high", low, high, source,
                       f"{fmt(value)} is above the critical limit {fmt(crit[1])}; seek medical care urgently")

    # 3. Above the upper limit?
    if high is not None and value > high:
        band = test.get("borderline_to")
        if band is not None and value <= band:
            return Verdict(code, value, BORDERLINE, "high", low, high, source,
                           f"{fmt(value)} is slightly above the limit {fmt(high)} {where} (borderline zone up to {fmt(band)})")
        return Verdict(code, value, HIGH, "high", low, high, source,
                       f"{fmt(value)} is {fmt(value - high)} above the upper limit {fmt(high)} {where}")

    # 4. Below the lower limit?
    if low is not None and value < low:
        band = test.get("borderline_from")
        if band is not None and value >= band:
            return Verdict(code, value, BORDERLINE, "low", low, high, source,
                           f"{fmt(value)} is slightly below the limit {fmt(low)} {where} (borderline zone down to {fmt(band)})")
        return Verdict(code, value, LOW, "low", low, high, source,
                       f"{fmt(value)} is {fmt(low - value)} below the lower limit {fmt(low)} {where}")

    lo_txt = fmt(low) if low is not None else "-"
    hi_txt = fmt(high) if high is not None else "-"
    return Verdict(code, value, NORMAL, "", low, high, source,
                   f"{fmt(value)} is within the range {lo_txt} to {hi_txt} {where}")
