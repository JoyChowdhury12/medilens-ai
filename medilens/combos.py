"""Sentences about values that are abnormal TOGETHER in one report.

Each sentence is cautious ("may", "possible") and has to be checked by a medical reviewer before real use.
They are used (1) as extra facts the language model may mention and (2) as part of the training targets.
No medicine or dose is ever named.
"""
from typing import Iterable, List, Tuple

# (all of these (code, direction) pairs must be abnormal in the same report) -> sentence
COMBOS: List[Tuple[Tuple[Tuple[str, str], ...], str]] = [
    ((("hemoglobin", "low"), ("mcv", "low")),
     "হিমোগ্লোবিন ও MCV দুটোই কম হওয়ায় আয়রনের ঘাটতির সম্ভাবনা বেশি; প্রয়োজনে ডাক্তার আরও পরীক্ষা করতে বলতে পারেন।"),
    ((("hemoglobin", "low"), ("mcv", "high")),
     "হিমোগ্লোবিন কম আর MCV বেশি থাকলে ভিটামিন বি১২ বা ফোলেটের ঘাটতির সম্ভাবনা থাকতে পারে।"),
    ((("hemoglobin", "low"), ("rbc", "low")),
     "হিমোগ্লোবিন ও লোহিত রক্তকণিকা দুটোই কম, যা রক্তস্বল্পতার ইঙ্গিতকে আরও জোরালো করে।"),
    ((("cholesterol", "high"), ("ldl", "high")),
     "মোট কোলেস্টেরল ও LDL দুটোই বেশি, তাই হৃদরোগের ঝুঁকির দিকে নজর দেওয়া জরুরি।"),
    ((("ldl", "high"), ("triglycerides", "high")),
     "LDL ও ট্রাইগ্লিসারাইড দুটোই বেশি থাকলে রক্তনালির জন্য ঝুঁকি আরও বাড়তে পারে।"),
    ((("fbs", "high"), ("hba1c", "high")),
     "খালি পেটের শর্করা ও HbA1c দুটোই বেশি, যা কয়েক মাস ধরে শর্করা বেশি থাকার ইঙ্গিত দেয়।"),
    ((("alt", "high"), ("ast", "high")),
     "ALT ও AST দুটোই বেশি, যা লিভারে প্রদাহের ইঙ্গিতকে আরও জোরালো করে।"),
    ((("creatinine", "high"), ("urea", "high")),
     "ক্রিয়েটিনিন ও ইউরিয়া দুটোই বেশি, তাই কিডনির কাজ ভালোভাবে পরীক্ষা করানো দরকার।"),
    ((("wbc", "high"), ("neutrophils", "high")),
     "শ্বেত কণিকা ও নিউট্রোফিল দুটোই বেশি, যা ব্যাকটেরিয়াজনিত সংক্রমণের দিকে ইঙ্গিত করতে পারে।"),
    ((("hemoglobin", "high"), ("hematocrit", "high")),
     "হিমোগ্লোবিন ও হিমাটোক্রিট দুটোই বেশি; পানিশূন্যতা এর একটি সম্ভাব্য কারণ।"),
    ((("tsh", "high"), ("ft4", "low")),
     "TSH বেশি আর FT4 কম থাকলে থাইরয়েড কম কাজ করার সম্ভাবনা বেশি।"),
    ((("tsh", "low"), ("ft4", "high")),
     "TSH কম আর FT4 বেশি থাকলে থাইরয়েড বেশি কাজ করার সম্ভাবনা বেশি।"),
]

ALL_TEXTS = [text for _, text in COMBOS]


def combo_sentences(abnormal: Iterable[Tuple[str, str]]) -> List[str]:
    """abnormal: (test code, "high"/"low") pairs that are outside the range in this report."""
    have = set(abnormal)
    return [text for needed, text in COMBOS if all(n in have for n in needed)]
