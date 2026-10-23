"""Cross-checks between related values. A mismatch usually means a typing or OCR mistake,
so the person is asked to double-check. It never changes a status."""
from typing import Dict, List


def _off(reported: float, expected: float, tol: float) -> bool:
    return expected > 0 and abs(reported - expected) / expected > tol


def check(values: Dict[str, float]) -> List[dict]:
    v, out = values, []

    def warn(codes, en, bn):
        out.append({"codes": codes, "text": en, "text_bn": bn})

    hb, hct, rbc = v.get("hemoglobin"), v.get("hematocrit"), v.get("rbc")
    mcv, mch, mchc = v.get("mcv"), v.get("mch"), v.get("mchc")

    if hb and hct and mchc and _off(mchc, hb / hct * 100, 0.12):
        warn(["hemoglobin", "hematocrit", "mchc"],
             f"Hemoglobin, hematocrit and MCHC do not fit together (MCHC should be about {hb / hct * 100:.1f}). "
             "One of these three may be misread; please check them against the paper report.",
             f"হিমোগ্লোবিন, হিমাটোক্রিট ও MCHC-এর মান একটির সাথে আরেকটি মিলছে না (MCHC প্রায় {hb / hct * 100:.1f} হওয়ার কথা)। "
             "এর কোনো একটি ভুল পড়া হতে পারে, কাগজের রিপোর্টের সাথে মিলিয়ে দেখুন।")
    elif hct and rbc and mcv and _off(mcv, hct / rbc * 10, 0.12):
        warn(["hematocrit", "rbc", "mcv"],
             f"Hematocrit, RBC and MCV do not fit together (MCV should be about {hct / rbc * 10:.0f}). "
             "Please check these values against the paper report.",
             f"হিমাটোক্রিট, RBC ও MCV-এর মান একটির সাথে আরেকটি মিলছে না (MCV প্রায় {hct / rbc * 10:.0f} হওয়ার কথা)। "
             "কাগজের রিপোর্টের সাথে মিলিয়ে দেখুন।")
    elif hb and rbc and mch and _off(mch, hb / rbc * 10, 0.12):
        warn(["hemoglobin", "rbc", "mch"],
             f"Hemoglobin, RBC and MCH do not fit together (MCH should be about {hb / rbc * 10:.1f}). "
             "Please check these values against the paper report.",
             f"হিমোগ্লোবিন, RBC ও MCH-এর মান একটির সাথে আরেকটি মিলছে না (MCH প্রায় {hb / rbc * 10:.1f} হওয়ার কথা)। "
             "কাগজের রিপোর্টের সাথে মিলিয়ে দেখুন।")

    chol, hdl, nonhdl = v.get("cholesterol"), v.get("hdl"), v.get("non_hdl")
    if chol and hdl and nonhdl and chol > hdl and _off(nonhdl, chol - hdl, 0.08):
        warn(["cholesterol", "hdl", "non_hdl"],
             f"Total cholesterol, HDL and Non-HDL do not fit together (Non-HDL should be about {chol - hdl:.0f}). "
             "Please check these values against the paper report.",
             f"মোট কোলেস্টেরল, HDL ও Non-HDL-এর মান একটির সাথে আরেকটি মিলছে না (Non-HDL প্রায় {chol - hdl:.0f} হওয়ার কথা)। "
             "কাগজের রিপোর্টের সাথে মিলিয়ে দেখুন।")

    diff = [v.get(c) for c in ("neutrophils", "lymphocytes", "eosinophils", "monocytes", "basophils")]
    if all(x is not None for x in diff) and not 95 <= sum(diff) <= 105:
        warn(["neutrophils", "lymphocytes", "eosinophils", "monocytes", "basophils"],
             f"The white cell percentages add up to {sum(diff):.0f}, but they should add up to about 100. Please check them.",
             f"শ্বেত কণিকার শতকরা মানগুলো যোগ করলে {sum(diff):.0f} হয়, কিন্তু প্রায় ১০০ হওয়ার কথা। মানগুলো আবার দেখে নিন।")
    return out
