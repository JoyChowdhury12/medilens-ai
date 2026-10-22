"""Specialist suggestion and urgency, decided by simple, testable rules."""
from .dictionary import get_test
from .range_engine import CRITICAL, HIGH, LOW, BORDERLINE

# Which specialist looks after each test group.
SPECIALIST_BY_GROUP = {
    "diabetes":     ("Endocrinologist", "এন্ডোক্রিনোলজিস্ট (ডায়াবেটিস ও হরমোন বিশেষজ্ঞ)"),
    "thyroid":      ("Endocrinologist", "এন্ডোক্রিনোলজিস্ট (ডায়াবেটিস ও হরমোন বিশেষজ্ঞ)"),
    "kidney":       ("Nephrologist", "নেফ্রোলজিস্ট (কিডনি বিশেষজ্ঞ)"),
    "liver":        ("Hepatologist or gastroenterologist", "হেপাটোলজিস্ট বা গ্যাস্ট্রোএন্টারোলজিস্ট (লিভার বিশেষজ্ঞ)"),
    "lipid":        ("Medicine specialist or cardiologist", "মেডিসিন বিশেষজ্ঞ বা কার্ডিওলজিস্ট (হৃদরোগ বিশেষজ্ঞ)"),
    "blood":        ("Medicine specialist", "মেডিসিন বিশেষজ্ঞ"),
    "electrolyte":  ("Medicine specialist", "মেডিসিন বিশেষজ্ঞ"),
    "vitamin":      ("Medicine specialist", "মেডিসিন বিশেষজ্ঞ"),
    "inflammation": ("Medicine specialist", "মেডিসিন বিশেষজ্ঞ"),
}

URGENCY_TEXT = {
    "urgent":  ("Go to a hospital or doctor today", "আজই হাসপাতালে বা ডাক্তারের কাছে যান"),
    "soon":    ("See a doctor within 2-4 weeks", "২-৪ সপ্তাহের মধ্যে ডাক্তার দেখান"),
    "routine": ("Discuss at your next routine check-up", "পরবর্তী নিয়মিত চেকআপে আলোচনা করুন"),
    "none":    ("No follow-up needed for these results", "এই ফলাফলের জন্য আলাদা করে ডাক্তার দেখানোর প্রয়োজন নেই"),
}


def suggest(verdicts: list) -> dict:
    """verdicts: list of Verdict. Returns specialist + urgency for the whole report."""
    flagged = [v for v in verdicts if v.status in (CRITICAL, HIGH, LOW, BORDERLINE)]
    if not flagged:
        urgency = "none"
    elif any(v.status == CRITICAL for v in flagged):
        urgency = "urgent"
    elif any(v.status in (HIGH, LOW) for v in flagged):
        urgency = "soon"
    else:
        urgency = "routine"

    # Count the most serious flags per group; the group with the most decides the specialist.
    weight = {CRITICAL: 3, HIGH: 2, LOW: 2, BORDERLINE: 1}
    score = {}
    for v in flagged:
        group = get_test(v.code)["group"]
        score[group] = score.get(group, 0) + weight[v.status]
    specialist_en = specialist_bn = None
    if score:
        top_group = max(score, key=score.get)
        specialist_en, specialist_bn = SPECIALIST_BY_GROUP.get(top_group, SPECIALIST_BY_GROUP["blood"])

    return {
        "urgency": urgency,
        "urgency_text": URGENCY_TEXT[urgency][0],
        "urgency_text_bn": URGENCY_TEXT[urgency][1],
        "specialist": specialist_en,
        "specialist_bn": specialist_bn,
    }
