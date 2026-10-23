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


HARD_TO_READ = ("Some values were hard to read. Please compare every value with the paper report, "
                "or retake the photo flat, in good light and without shaking.")
RAPID_WEIGHT = 1.5   # in a vote, one read by the deep-learning reader counts a bit more than one Tesseract read


def _disagreements(reads) -> int:
    """How many tests the reads do not agree on (a different value, or found by one read but not another)."""
    codes = {r["code"] for recs in reads for r in recs}
    n = 0
    for code in codes:
        values = [next((r["value"] for r in recs if r["code"] == code), None) for recs in reads]
        if None in values or len({round(v, 2) for v in values}) > 1:
            n += 1
    return n


def _read_photo(image_bytes: bytes):
    """Read a photo several ways and vote. Stops early when two reads agree on everything (clean photo, ~5 s);
    a blurry or damaged photo gets more reads (up to 6) so the vote has more to go on."""
    quality, passes = ocr_image_passes(image_bytes)
    reads, all_lines = [], []
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
        records = merge_records(*reads)
        mean_conf = sum(r["confidence"] for r in records) / len(records) if records else 0
        good = len(records) >= 1 and mean_conf >= 0.75
        allowed = 1 if len(records) >= 10 else 0          # a short report must agree completely
        if len(reads) >= 2 and good and _disagreements(reads) <= allowed:
            break
        if len(reads) >= 6:
            break
    merged = merge_records(*reads)
    for r in merged:
        r.pop("_w", None)
    # Many uncertain values: say so clearly, so the person compares every line or takes a better photo.
    if len(merged) >= 3 and sum(r["needs_check"] for r in merged) / len(merged) >= 0.4:
        quality = dict(quality or {})
        quality["problems"] = list(quality.get("problems", [])) + [HARD_TO_READ]
    return quality, all_lines, merged


def extract_from_image(image_bytes: bytes) -> dict:
    quality, lines, records_rules = _read_photo(image_bytes)
    ocr_text = "\n".join(l.text for l in lines)
    records, extractor = None, "rules"
    if local_model.extract_enabled():
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


def _verdicts(tests: list, sex: str = None):
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
    return verdicts, unknown


def _model_text(v, abnormal, sex, age):
    """The fine-tuned model's explanation for one value, or None if the model is off, slow, or fails a safety check."""
    test = get_test(v.code)
    related = [(get_test(o.code)["name"], f"{o.status}/{o.direction}", o.value, get_test(o.code)["unit"])
               for o in abnormal if o.code != v.code]
    prompt = local_model.build_explain_prompt(test["name"], test["bn"], v.value, test["unit"], v.status, v.direction,
                                              v.low, v.high, sex, age, related)
    generated = local_model.explain_with_model(test["name"], v.value, test["unit"], v.status, v.direction, v.reason,
                                               prompt=prompt)
    if not generated:
        return None
    allowed = [x for x in (v.low, v.high, age) if x is not None] + [o.value for o in abnormal]
    for o in abnormal:
        allowed += [x for x in (o.low, o.high) if x is not None]
    if guard.check_explanation(generated, value=v.value, status=v.status, direction=v.direction, allowed_numbers=allowed):
        return None
    return generated


def explain_with_ai(tests: list, sex: str = None, age: int = None, codes: list = None) -> dict:
    """Model-written explanations for the out-of-range values: {code: text}. Values whose text fails a check are left
    out (the template stays). Several values are written at the same time to save time."""
    if not local_model.enabled():
        return {}
    verdicts, _ = _verdicts(tests, sex)
    abnormal = [v for v in verdicts if v.status != "normal"]
    targets = [v for v in abnormal if codes is None or v.code in codes]      # the others are only context
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, min(local_model.PARALLEL, len(targets)))) as pool:
        texts = list(pool.map(lambda v: _model_text(v, abnormal, sex, age), targets))
    return {v.code: text for v, text in zip(targets, texts) if text}


def interpret(tests: list, sex: str = None, age: int = None, use_model: bool = True) -> dict:
    """tests: confirmed records, each with code (or raw name), value, printed_low, printed_high.
    use_model=False answers in about a second with the template text; the website then asks /explain separately."""
    verdicts, unknown = _verdicts(tests, sex)
    ai_texts = explain_with_ai(tests, sex, age) if use_model else {}
    results = []
    for v in verdicts:
        test = get_test(v.code)
        text_bn = ai_texts.get(v.code) or explain_one(v)
        source = "fine-tuned model" if v.code in ai_texts else "template"
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
        "model_available": local_model.enabled(),
    }
