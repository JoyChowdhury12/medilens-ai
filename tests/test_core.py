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


# --- regression: a real Ibn Sina lipid report (photo, noisy OCR) ---
def test_damaged_triglyceride_name_is_matched():
    from medilens.dictionary import match_test
    assert match_test("S Tnglycende")[0] == "triglycerides"


def test_non_hdl_and_ratio_rows():
    from medilens.dictionary import match_test
    assert match_test("Non-HDL-Choiestero!")[0] == "non_hdl"
    assert match_test("T Cholestero-HDL Rabo")[0] is None          # calculated ratio: not judged


def test_misread_range_direction_is_not_trusted():
    from medilens.pipeline import extract_from_text
    bad = extract_from_text("S HDL Cholesterol 47 mg/dL <40")["tests"][0]     # HDL is only ever "at least X"
    assert bad["printed_low"] is None and bad["printed_high"] is None and bad["needs_check"]
    good = extract_from_text("S HDL Cholesterol 47 mg/dL >40")["tests"][0]
    assert good["printed_low"] == 40 and good["printed_high"] is None


# --- regression: Popular Diagnostic photo (K/uL units, damaged names and ranges) ---
def test_k_per_ul_is_thousands_not_per_cumm():
    from medilens.pipeline import extract_from_text
    t = {x["code"]: x for x in extract_from_text(
        "White Blood Cells 9.24 K/uL 4.00 - 10.00 K/uL\nPlatelets 226.00 K/uL 150.00 - 450.00 K/uL")["tests"]}
    assert t["wbc"]["value"] == 9.24 and t["platelets"]["value"] == 226


def test_value_is_the_number_before_the_unit():
    from medilens.pipeline import extract_from_text
    t = extract_from_text("Haemoglobin 4 12.70 g/dL 11.50-14.50 g/dl")["tests"][0]
    assert t["code"] == "hemoglobin" and t["value"] == 12.7


def test_absolute_differential_rows_are_skipped_percent_rows_used():
    from medilens.pipeline import extract_from_text
    t = extract_from_text("Neutrophil 5.45 K/uL 2.16 - 6.04 K/uL\nNeutrophil% 59.00 % 40.00 - 70.00 %")["tests"]
    assert len(t) == 1 and t[0]["value"] == 59 and t[0]["unit"] == "%"


def test_damaged_printed_range_is_repaired():
    from medilens.pipeline import extract_from_text
    t = extract_from_text("MCH 25.02 pg 2700 - 32.00 pg")["tests"][0]
    assert t["printed_low"] == 27 and t["printed_high"] == 32


def test_voting_between_reads_uses_the_relation_between_values():
    from medilens.extract_rules import merge_records

    def rec(code, value, conf=0.6):
        return {"code": code, "value": value, "confidence": conf, "needs_check": True, "unit_assumed": False}
    base = [rec("hemoglobin", 12.7), rec("hematocrit", 40.8)]
    out = {r["code"]: r for r in merge_records(base + [rec("mchc", 34.1)], base + [rec("mchc", 31.1)], base + [rec("mchc", 34.1)])}
    assert out["mchc"]["value"] == 31.1            # 12.7 / 40.8 x 100 = 31.1, so the odd one out is right


def test_line_with_only_a_range_gives_no_value():
    from medilens.pipeline import extract_from_text
    assert extract_from_text("PCV 4.50-5.50")["tests"] == []                       # the result is on another line
    assert extract_from_text("Lymphocyte% 33.00 20.00-45.00 0%")["tests"][0]["value"] == 33


def test_range_line_is_glued_to_its_row_but_a_new_result_is_not():
    from medilens.ocr import OcrLine, _join_range_lines
    out = _join_range_lines([OcrLine("TSH 0.68", .9), OcrLine("mIU/L 0.40 - 4.00", .9), OcrLine("HbA1c 4.5 %", .9),
                             OcrLine("6.4 mmol/L 3.9 to 7.8", .9)])
    assert [l.text for l in out] == ["TSH 0.68 mIU/L 0.40 - 4.00", "HbA1c 4.5 %", "6.4 mmol/L 3.9 to 7.8"]


def test_merge_keeps_the_range_and_the_cleaner_line_from_the_better_read():
    from medilens.extract_rules import merge_records
    tess = {"code": "lymphocytes", "value": 33.0, "confidence": 0.9, "needs_check": False, "printed_low": None,
            "printed_high": None, "source_line": "Lymphocyte% 33.00 % es", "_w": 1.0}
    rapid = {"code": "lymphocytes", "value": 33.0, "confidence": 0.7, "needs_check": False, "printed_low": 20.0,
             "printed_high": 45.0, "source_line": "Lymphocyte% 33.00 20.00-45.00", "_w": 1.5}
    out = merge_records([tess], [rapid])[0]
    assert (out["printed_low"], out["printed_high"]) == (20.0, 45.0) and out["source_line"].endswith("20.00-45.00")


# --- report date and lab name from the header ---
def test_report_date_prefers_the_collection_date():
    from medilens.meta import find_report_date
    text = "BIOCHEMISTRY REPORT\nBill on :04/10/25, 07:41 AM Print. on : 05/10/25\nCollected on : 03/10/25, 07:45 AM"
    assert find_report_date(text) == "2025-10-03"
    assert find_report_date("Date Received:20/07/2013Date Delivered:20/07/2013") == "2013-07-20"
    assert find_report_date("Sample collected 4 Oct 2025") == "2025-10-04"
    assert find_report_date("Collected on 31/02/25") is None            # not a real date
    assert find_report_date("Collected on 01/01/2099") is None          # in the future


def test_lab_name_from_the_header():
    from medilens.meta import find_lab_name
    text = "POPULAR DIAGNOSTIC CENTRE LTD\nThanthania, Sherpur Road, Bogra.\nTel: 051-69500"
    assert find_lab_name(text) == "Popular Diagnostic Centre Ltd"
    assert find_lab_name("Name: Mrs Touhida\nPhone 0171") is None


def test_flipped_sign_on_a_one_sided_test_is_not_trusted():
    from medilens.pipeline import extract_from_text
    ldl = extract_from_text("S. LDL Cholesterol 69 mg/dL > 100")["tests"][0]       # LDL limits are "under X"; ">" is a misread "<"
    assert ldl["printed_low"] is None and ldl["printed_high"] is None and ldl["needs_check"]
    ok = extract_from_text("S. LDL Cholesterol 69 mg/dL < 100")["tests"][0]
    assert ok["printed_high"] == 100 and ok["printed_low"] is None


def test_non_hdl_must_equal_total_minus_hdl():
    from medilens.extract_rules import merge_records
    from medilens import consistency

    def rec(code, value, conf=0.8):
        return {"code": code, "value": value, "confidence": conf, "needs_check": False, "printed_low": None, "printed_high": None}
    base = [rec("cholesterol", 155), rec("hdl", 27)]
    out = {r["code"]: r for r in merge_records(base + [rec("non_hdl", 428, .9)], base + [rec("non_hdl", 128, .7)])}
    assert out["non_hdl"]["value"] == 128                                            # 155 - 27
    only_wrong = {r["code"]: r for r in merge_records(base + [rec("non_hdl", 428)])}
    assert only_wrong["non_hdl"]["needs_check"]
    assert consistency.check({"cholesterol": 155, "hdl": 27, "non_hdl": 428})
    assert not consistency.check({"cholesterol": 155, "hdl": 27, "non_hdl": 128})


# --- regression: Ibn Sina lipid photo where "<" was read as ">" and 128 as 428 ---
def test_upper_limit_misread_as_lower_limit_for_ldl():
    from medilens.pipeline import extract_from_text
    t = extract_from_text("S. LDL Cholesterol 69 mg/dL > 100")["tests"][0]
    assert t["printed_low"] is None and t["printed_high"] is None and t["needs_check"]


def test_non_hdl_is_checked_against_total_minus_hdl():
    from medilens.consistency import check
    assert check({"cholesterol": 155, "hdl": 27, "non_hdl": 428})
    assert not check({"cholesterol": 155, "hdl": 27, "non_hdl": 128})


def test_lab_name_repeated_words_removed():
    from medilens.meta import find_lab_name
    assert find_lab_name("Ibn Sina Ibn Sina Diagnostic & Consultation Center,Bogura").startswith("Ibn Sina Diagnostic")


def test_fast_interpret_does_not_call_the_model(monkeypatch):
    from medilens import local_model, pipeline
    monkeypatch.setattr(local_model, "enabled", lambda: True)
    called = []
    monkeypatch.setattr(local_model, "explain_with_model", lambda *a, **k: called.append(1) or None)
    out = pipeline.interpret([{"code": "hemoglobin", "value": 9.1}], "female", 30, use_model=False)
    assert not called and out["model_available"] and out["results"][0]["explanation_source"] == "template"


def test_background_explanations_keep_only_safe_texts(monkeypatch):
    from medilens import local_model, pipeline
    monkeypatch.setattr(local_model, "enabled", lambda: True)
    good = "আপনার হিমোগ্লোবিন ৯.১, যা স্বাভাবিকের চেয়ে কম। এটি রক্তস্বল্পতার ইঙ্গিত হতে পারে। একজন ডাক্তারের পরামর্শ নিন।"
    monkeypatch.setattr(local_model, "explain_with_model",
                        lambda name, *a, **k: good if name == "Hemoglobin" else "Take 2 tablets of iron daily.")
    out = pipeline.explain_with_ai([{"code": "hemoglobin", "value": 9.1}, {"code": "ferritin", "value": 8}], "female", 30)
    assert out == {"hemoglobin": good}


# --- robustness: blurred photos ---
def test_digits_inside_units_are_not_values():
    from medilens.pipeline import extract_from_text
    assert extract_from_text("ESR mm/1st hr 0 - 20")["tests"] == []          # the result itself was not readable
    assert extract_from_text("ESR 11 mm/1st hr 0 - 20")["tests"][0]["value"] == 11


def test_lost_decimal_point_is_repaired_and_flagged():
    from medilens.pipeline import extract_from_text
    t = extract_from_text("Total WBCCount 78 KUL 40-11.0")["tests"][0]
    assert t["value"] == 7.8 and (t["printed_low"], t["printed_high"]) == (4.0, 11.0) and t["needs_check"]


def test_impossible_value_stays_flagged_even_when_reads_agree():
    from medilens.extract_rules import merge_records, parse_line
    a = parse_line("HCT (PCV) 301 % 36 - 46")
    assert a["implausible"] and a["needs_check"]
    out = merge_records([dict(a)], [dict(a)], [dict(a)])[0]
    assert out["needs_check"]


def test_barcode_text_is_not_a_test():
    from medilens.pipeline import extract_from_text
    assert extract_from_text("K 4658")["tests"] == []
    assert extract_from_text("K 4.2 mmol/L 3.5 - 5.1")["tests"][0]["value"] == 4.2


def test_each_value_keeps_where_it_was_on_the_photo():
    from medilens.extract_rules import extract, merge_records
    from medilens.ocr import OcrLine
    line = OcrLine("Haemoglobin 9.2 g/dL 12.0 - 15.5", 0.95, box=(0.06, 0.23, 0.77, 0.25),
                   words=[("Haemoglobin", (0.06, 0.23, 0.2, 0.25)), ("9.2", (0.38, 0.23, 0.41, 0.25)), ("g/dL", (0.5, 0.23, 0.55, 0.25))])
    rec = extract([line])[0]
    assert rec["box"] == [0.06, 0.23, 0.77, 0.25] and rec["value_box"] == [0.38, 0.23, 0.41, 0.25]
    merged = merge_records([dict(rec)], [dict(rec)])[0]
    assert merged["reads_agree"] == 2 and merged["reads_found"] == 2 and merged["box"]
