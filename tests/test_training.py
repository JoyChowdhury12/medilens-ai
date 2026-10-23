import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from medilens import guard
from medilens.local_model import build_explain_prompt
from training.make_dataset import build

V = dict(value=9.1, status="low", direction="low", allowed_numbers=[12, 15.5])
GOOD = "আপনার হিমোগ্লোবিন ৯.১ g/dL, যা স্বাভাবিকের চেয়ে কম। এটি রক্তস্বল্পতার ইঙ্গিত হতে পারে। এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।"


def test_guard_accepts_good_text():
    assert guard.check_explanation(GOOD, **V) == []


def test_guard_rejects_bad_texts():
    assert "unsafe" in guard.check_explanation(GOOD + " প্রতিদিন ১টি ট্যাবলেট খান।", **V)
    assert "value_missing" in guard.check_explanation(GOOD.replace("৯.১", "৮"), **V)
    assert "direction_missing" in guard.check_explanation(GOOD.replace("কম", "ঠিক"), **V)
    assert "no_doctor_advice" in guard.check_explanation(GOOD.replace("ডাক্তারের পরামর্শ নিন", "বিশ্রাম নিন"), **V)
    assert "extra_numbers" in guard.check_explanation(GOOD + " এটি ৪৭ দিনে ঠিক হবে।", **V)
    assert "diagnosis" in guard.check_explanation("আপনার ডায়াবেটিস আছে। ৯.১ কম। ডাক্তার দেখান।", **V)
    assert "not_bangla" in guard.check_explanation("Your hemoglobin 9.1 is low, see a doctor soon please.", **V)
    assert "false_alarm" in guard.check_explanation(GOOD + " আজই হাসপাতালে যান।", **V)


def test_dataset_is_consistent():
    rows = build(150, 1)
    assert len(rows) >= 100
    for r in rows:
        m = r["meta"]
        target = r["messages"][-1]["content"]
        assert guard.check_explanation(target, value=m["value"], status=m["status"], direction=m["direction"],
                                       allowed_numbers=m["allowed"]) == []
        assert m["status"] != "normal"
        assert len(r["messages"]) == 2 + 0 or len(r["messages"]) == 2  # user + assistant only


def test_prompt_has_all_facts():
    p = build_explain_prompt("Hemoglobin", "হিমোগ্লোবিন", 9.1, "g/dL", "low", "low", 12, 15.5, "female", 30,
                             [("MCV", "low/low", 70, "fL")])
    for s in ("Hemoglobin", "9.1", "12 - 15.5", "নারী", "30 বছর", "MCV"):
        assert s in p
