"""The full MediLens AI pipeline in two steps, matching the website flow:

  extract_from_image()  photo -> cleaned image -> OCR -> test records   (user then confirms values)
  interpret()           confirmed records -> verified status -> Bangla explanations -> specialist
"""
from . import consistency, guard, local_model
from .dictionary import get_test, match_test
from .explain_bn import DISCLAIMER_BN, explain_one, is_safe, summary
from .meta import find_meta
from .extract_rules import extract, merge_records, parse_line
from .ocr import OcrLine, ocr_image_bytes, ocr_image_passes
from .range_engine import classify
from .specialist import suggest


_NO_TESTS_MSG = ("No blood test values were found. MediLens supports lab reports with numeric results, "
                 "such as CBC, blood sugar, HbA1c, lipid, kidney, liver and thyroid tests.")


def _records_from_model(items, lines):
    """Turn the model's JSON into the same record format, re-using our parser for units and conversions."""
    avg_conf = sum(l.confidence for l in lines) / len(lines) if lines else 1.0
    records, seen = [], set()
    for it in items:
        rng = ""
        if it.get("low") is not None and it.get("high") is not None:
            rng = f"{it['low']} - {it['high']}"
        elif it.get("high") is not None:
            rng = f"< {it['high']}"
        elif it.get("low") is not None:
            rng = f"> {it['low']}"
        line = f"{it['test']} {it['value']} {it.get('unit') or ''} {rng}"
        rec = parse_line(line, avg_conf)
        if rec and rec["code"] not in seen:
            seen.add(rec["code"])
            records.append(rec)
    return records


RAPID_WEIGHT = 1.5   # in a vote, one read by the deep-learning reader counts a bit more than one Tesseract read


def _read_photo(image_bytes: bytes):
    """Read a photo with the deep-learning OCR AND Tesseract and vote between the reads (more reads if still shaky).
    The 2nd reader fills tests/ranges the first one lost; where they disagree on a value the vote decides."""
    quality, passes = ocr_image_passes(image_bytes)
    reads, all_lines = [], []
    min_reads = 1
    while True:
        item = next(passes, None)
        if item is None:
            break
        engine, lines = item
        all_lines += lines
        recs = extract(lines)
        for r in recs:
            r["_w"] = RAPID_WEIGHT if engine == "rapid" else 1.0
        reads.append(recs)
        if engine == "rapid":
            min_reads = 2                                    # always get a second opinion after the deep-learning read
        records = merge_records(*reads)
        mean_conf = sum(r["confidence"] for r in records) / len(records) if records else 0
        good = len(records) >= 5 and mean_conf >= 0.75
        if (len(reads) >= min_reads and good) or (len(reads) >= 3 and len(records) >= 12) or len(reads) >= 4:
            break
    for r in (merged := merge_records(*reads)):
        r.pop("_w", None)
    return quality, all_lines, merged


def extract_from_image(image_bytes: bytes) -> dict:
    quality, lines, records_rules = _read_photo(image_bytes)
    ocr_text = "\n".join(l.text for l in lines)
    records, extractor = None, "rules"
    if local_model.enabled():
        items = local_model.extract_with_model(ocr_text)
        if items:
            records, extractor = _records_from_model(items, lines), "fine-tuned model"
    if not records:
        records = records_rules
    message = None if records else _NO_TESTS_MSG
    return {"quality": quality, "extractor": extractor, "tests": records, "message": message, "ocr_text": ocr_text,
            "meta": find_meta(ocr_text)}


def extract_from_pdf(pdf_bytes: bytes) -> dict:
    """PDF reports: use the text layer when there is one, otherwise render each page and OCR it."""
    import io
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(pdf_bytes)
    if len(pdf) > 10:
        raise ValueError("PDF has more than 10 pages.")
    text = "\n".join(pdf[i].get_textpage().get_text_range() for i in range(len(pdf)))
    if len(text.strip()) > 80:  # digital PDF: no OCR needed
        out = extract_from_text(text)
        out["message"] = None if out["tests"] else _NO_TESTS_MSG
        return out
    all_lines, quality, page_records = [], None, []
    for i in range(len(pdf)):
        buf = io.BytesIO()
        pdf[i].render(scale=3).to_pil().convert("RGB").save(buf, format="PNG")
        q, lines, recs = _read_photo(buf.getvalue())
        quality = quality or q
        all_lines += lines
        page_records.append(recs)
    records = merge_records(*page_records)
    ocr_text = "\n".join(l.text for l in all_lines)
    return {"quality": quality, "extractor": "rules", "tests": records,
            "message": None if records else _NO_TESTS_MSG, "ocr_text": ocr_text, "meta": find_meta(ocr_text)}


def extract_from_text(text: str) -> dict:
    """Same as extract_from_image but for text (useful for tests and PDFs with a text layer)."""
    lines = [OcrLine(t, 1.0) for t in text.splitlines() if t.strip()]
    return {"quality": None, "extractor": "rules", "tests": extract(lines), "ocr_text": text, "meta": find_meta(text)}


def interpret(tests: list, sex: str = None, age: int = None) -> dict:
    """tests: confirmed records, each with code (or raw name), value, printed_low, printed_high."""
    verdicts, unknown = [], []
    for t in tests:
        code = t.get("code")
        if not code:
            code, _ = match_test(t.get("name", ""))
        try:
            get_test(code) if code else None
        except KeyError:
            code = None
        if not code:
            unknown.append(t.get("name") or t.get("code"))
            continue
        verdicts.append(classify(code, float(t["value"]), sex, t.get("printed_low"), t.get("printed_high")))

    abnormal = [v for v in verdicts if v.status != "normal"]
    results = []
    for v in verdicts:
        test = get_test(v.code)
        text_bn, source = explain_one(v), "template"
        if v.status != "normal" and local_model.enabled():
            related = [(get_test(o.code)["name"], f"{o.status}/{o.direction}", o.value, get_test(o.code)["unit"])
                       for o in abnormal if o.code != v.code]
            prompt = local_model.build_explain_prompt(test["name"], test["bn"], v.value, test["unit"], v.status, v.direction,
                                                      v.low, v.high, sex, age, related)
            generated = local_model.explain_with_model(test["name"], v.value, test["unit"], v.status, v.direction, v.reason,
                                                       prompt=prompt)
            if generated:
                allowed = [x for x in (v.low, v.high, age) if x is not None] + [o.value for o in abnormal]
                for o in abnormal:
                    allowed += [x for x in (o.low, o.high) if x is not None]
                if not guard.check_explanation(generated, value=v.value, status=v.status, direction=v.direction,
                                               allowed_numbers=allowed):
                    text_bn, source = generated, "fine-tuned model"
        results.append({**v.to_dict(), "name": test["name"], "name_bn": test["bn"], "unit": test["unit"],
                        "explanation_bn": text_bn, "explanation_source": source})

    warnings = consistency.check({v.code: v.value for v in verdicts})

    order = {"critical": 0, "high": 1, "low": 1, "borderline": 2, "normal": 3}
    results.sort(key=lambda r: order[r["status"]])
    return {
        "results": results,
        "unknown_tests": unknown,
        "warnings": warnings,
        "next_step": suggest(verdicts),
        "summary_bn": summary(verdicts),
        "disclaimer_bn": DISCLAIMER_BN,
    }
