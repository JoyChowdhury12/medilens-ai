"""Unit tests. Run with:  pytest -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from medilens.dictionary import match_test
from medilens.explain_bn import explain_one, is_safe
from medilens.extract_rules import parse_line
from medilens.pipeline import extract_from_text, interpret
from medilens.range_engine import classify


# ---------- dictionary ----------
def test_match_common_names():
    assert match_test("FBS")[0] == "fbs"
    assert match_test("S. Creatinine")[0] == "creatinine"
    assert match_test("Haemoglobin")[0] == "hemoglobin"
    assert match_test("SGPT (ALT)")[0] == "alt"


def test_unknown_name_is_rejected():
    assert match_test("Patient Name")[0] is None


# ---------- range engine (boundary values) ----------
def test_printed_range_wins():
    v = classify("fbs", 7.4, printed_low=3.9, printed_high=6.1)
    assert v.status == "high" and v.range_source == "report"
    assert "1.3 above" in v.reason


def test_exact_limit_is_normal():
    assert classify("fbs", 6.1, printed_low=3.9, printed_high=6.1).status == "normal"
    assert classify("fbs", 3.9, printed_low=3.9, printed_high=6.1).status == "normal"


def test_sex_specific_range():
    assert classify("hemoglobin", 12.5, sex="female").status == "normal"
    assert classify("hemoglobin", 12.5, sex="male").status == "low"


def test_unknown_sex_uses_widest_range():
    assert classify("hemoglobin", 12.5).status == "normal"


def test_borderline_band():
    assert classify("cholesterol", 212).status == "borderline"
    assert classify("cholesterol", 250).status == "high"
    assert classify("vitamin_d", 25).status == "borderline"
    assert classify("vitamin_d", 12).status == "low"


def test_critical_beats_everything():
    v = classify("potassium", 7.0, printed_low=3.5, printed_high=5.1)
    assert v.status == "critical" and v.direction == "high"


# ---------- extraction ----------
def test_parse_bangladeshi_platelet_format():
    r = parse_line("Platelet count 2,45,000 /cumm 1,50,000 - 4,50,000")
    assert r["code"] == "platelets" and r["value"] == 245 and r["printed_low"] == 150


def test_parse_sugar_in_mg_dl_is_converted():
    r = parse_line("Fasting Blood Sugar 126 mg/dl 70-110")
    assert r["code"] == "fbs" and r["value"] == 7.0 and r["unit"] == "mmol/L"


def test_parse_less_than_range():
    r = parse_line("Total Cholesterol 212 mg/dL < 200")
    assert r["printed_low"] is None and r["printed_high"] == 200


def test_non_result_lines_are_ignored():
    out = extract_from_text("SYNTHETIC LAB\nName: Rahima Begum\nFBS 5.2 mmol/L 3.9-6.1")
    assert [t["code"] for t in out["tests"]] == ["fbs"]


def test_rbc_is_never_read_as_wbc():
    r = parse_line("Total RBC count 5.2 mill/cumm 4.5-5.5")
    assert r["code"] == "rbc" and r["value"] == 5.2
    assert match_test("Total RBC count")[0] == "rbc"
    assert match_test("HDL Cholesterol")[0] == "hdl" and match_test("LDL Cholesterol")[0] == "ldl"


def test_empty_result_has_message():
    out = extract_from_text("Diagnosis: skin, chest, punch biopsy\nGrover's disease")
    assert out["tests"] == []


# ---------- explanation and safety ----------
def test_bangla_explanation_mentions_value():
    text = explain_one(classify("hemoglobin", 10.8, sex="female"))
    assert "হিমোগ্লোবিন" in text and "১০.৮" in text


def test_safety_filter_blocks_medicine_advice():
    assert not is_safe("Take metformin 500 mg twice daily")
    assert not is_safe("প্রতিদিন একটি ট্যাবলেট খান")
    assert is_safe("এ বিষয়ে একজন ডাক্তারের পরামর্শ নিন।")


def test_interpret_full_report():
    out = interpret([
        {"code": "fbs", "value": 7.4, "printed_low": 3.9, "printed_high": 6.1},
        {"code": "hba1c", "value": 6.8},
        {"code": "tsh", "value": 2.1},
    ], sex="female")
    statuses = {r["code"]: r["status"] for r in out["results"]}
    assert statuses == {"fbs": "high", "hba1c": "high", "tsh": "normal"}
    assert out["next_step"]["specialist"] == "Endocrinologist"
    assert out["next_step"]["urgency"] == "soon"
    assert out["results"][-1]["code"] == "tsh"  # flagged results come first
