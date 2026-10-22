"""Synthetic lab report generator: our own dataset tool.

Creates realistic-looking report images with random tests, values, layouts and
photo noise, plus a ground-truth JSON for each image. We use these to:
  1. measure how accurately the pipeline reads reports (evaluate.py), and
  2. build training data for fine-tuning our language model (prepare_finetune_data.py).

Usage:
    python dataset/generate_reports.py --count 200 --out dataset/synthetic
"""
import argparse
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from medilens.dictionary import load_tests  # noqa: E402

# Fonts: first ones found on this computer are used (Windows, Linux or macOS).
FONT_CANDIDATES = [
    "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/times.ttf", "C:/Windows/Fonts/calibri.ttf",
    "C:/Windows/Fonts/cour.ttf", "C:/Windows/Fonts/tahoma.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf",
]
FONTS = [f for f in FONT_CANDIDATES if Path(f).exists()]

LABS = ["SYNTHETIC DIAGNOSTIC CENTRE A", "SYNTHETIC DIAGNOSTIC CENTRE B", "SYNTHETIC PATHOLOGY LAB C",
        "SYNTHETIC MEDICAL SERVICES D", "SYNTHETIC HEALTH LAB E"]
FIRST = ["Rahima", "Karim", "Nusrat", "Tanvir", "Shirin", "Habib", "Farzana", "Sabbir", "Mitu", "Rafiq"]
LAST = ["Begum", "Ahmed", "Hossain", "Islam", "Akter", "Rahman", "Khatun", "Uddin", "Chowdhury", "Sarker"]

# Popular test panels, so reports look like real orders.
PANELS = {
    "CBC": ["hemoglobin", "wbc", "platelets", "rbc", "hematocrit", "mcv", "mch", "mchc", "neutrophils", "lymphocytes", "eosinophils", "esr"],
    "Diabetes": ["fbs", "sugar_2h", "hba1c", "rbs"],
    "Lipid profile": ["cholesterol", "ldl", "hdl", "triglycerides"],
    "Kidney": ["creatinine", "urea", "uric_acid", "sodium", "potassium", "chloride"],
    "Liver": ["alt", "ast", "alp", "bilirubin", "albumin", "total_protein"],
    "Thyroid": ["tsh", "ft4", "ft3"],
    "Others": ["vitamin_d", "vitamin_b12", "ferritin", "crp", "calcium"],
}

# How each test's name is often written on reports (picked at random).
WRITTEN = {
    "hemoglobin": ["Hemoglobin", "Haemoglobin", "Hb"], "wbc": ["WBC (Total)", "Total WBC Count", "Total Count (TC)"],
    "platelets": ["Platelet Count", "Platelets"], "rbc": ["RBC Count", "Total RBC"], "hematocrit": ["PCV", "Hematocrit (PCV)"],
    "mcv": ["MCV"], "mch": ["MCH"], "mchc": ["MCHC"], "neutrophils": ["Neutrophils"], "lymphocytes": ["Lymphocytes"],
    "eosinophils": ["Eosinophils"], "esr": ["ESR"], "fbs": ["FBS", "Fasting Blood Sugar", "Blood Sugar (Fasting)"],
    "rbs": ["RBS", "Random Blood Sugar"], "sugar_2h": ["2 hrs ABF", "Blood Sugar 2 hrs ABF"], "hba1c": ["HbA1c", "Glycated Hemoglobin"],
    "cholesterol": ["Total Cholesterol", "S. Cholesterol"], "ldl": ["LDL Cholesterol", "LDL-C"], "hdl": ["HDL Cholesterol", "HDL-C"],
    "triglycerides": ["Triglycerides", "S. Triglyceride"], "creatinine": ["S. Creatinine", "Serum Creatinine", "Creatinine"],
    "urea": ["Blood Urea", "S. Urea"], "uric_acid": ["S. Uric Acid", "Uric Acid"], "sodium": ["Sodium (Na+)", "S. Sodium"],
    "potassium": ["Potassium (K+)", "S. Potassium"], "chloride": ["Chloride (Cl-)", "S. Chloride"], "alt": ["SGPT (ALT)", "ALT"],
    "ast": ["SGOT (AST)", "AST"], "alp": ["Alkaline Phosphatase"], "bilirubin": ["S. Bilirubin (Total)", "Total Bilirubin"],
    "albumin": ["S. Albumin", "Albumin"], "total_protein": ["Total Protein"], "tsh": ["TSH", "S. TSH"], "ft4": ["FT4", "Free T4"],
    "ft3": ["FT3", "Free T3"], "vitamin_d": ["25 OH Vitamin D", "Vitamin D"], "vitamin_b12": ["Vitamin B12"],
    "ferritin": ["S. Ferritin", "Ferritin"], "crp": ["CRP", "C-Reactive Protein"], "calcium": ["S. Calcium", "Calcium"],
}

DECIMALS = {"%": 1, "g/dL": 1, "mmol/L": 1, "mg/dL": 1, "x10^9/L": 1, "x10^12/L": 2, "fL": 0, "pg": 1,
            "U/L": 0, "mIU/L": 2, "ng/dL": 2, "pg/mL": 0, "ng/mL": 1, "mg/L": 1, "mm/1st hr": 0}


def nice(x, d):
    return f"{x:.{d}f}" if d else str(int(round(x)))


def pick_value(low, high, critical):
    """Mostly normal values, some high/low, a few far out of range."""
    lo = low if low is not None else 0
    hi = high if high is not None else lo * 2.5 + 1
    width = hi - lo if hi > lo else max(hi, 1)
    r = random.random()
    if r < 0.6:
        return random.uniform(lo + 0.05 * width, hi - 0.05 * width)
    if r < 0.82:
        return random.uniform(hi, hi + 0.5 * width)
    if lo > 0 and r < 0.97:
        return random.uniform(max(lo - 0.4 * width, lo * 0.4), lo)
    return random.uniform(hi + 0.5 * width, hi + 1.2 * width)


def make_record(code, sex):
    test = load_tests()[code]
    ranges = test["range"]
    low, high = ranges.get("any") or ranges[sex]
    value = pick_value(low, high, test.get("critical"))
    unit = test["unit"]
    d = DECIMALS.get(unit, 1)
    shown_value, shown_low, shown_high, shown_unit = value, low, high, unit

    # Some labs print sugar in mg/dL and counts per cubic mm.
    if code in ("fbs", "rbs", "sugar_2h") and random.random() < 0.35:
        shown_value, shown_low, shown_high, shown_unit, d = value * 18, low * 18, high * 18, "mg/dL", 0
    if code in ("platelets", "wbc") and random.random() < 0.5:
        shown_value, shown_low, shown_high, shown_unit, d = value * 1000, low * 1000, high * 1000, "/cumm", 0

    value_txt = nice(shown_value, d)
    if shown_unit == "/cumm":
        value_txt = f"{int(round(shown_value)):,}"
    # Printed range styles (ground truth uses the ROUNDED numbers that appear on paper)
    def shown(x):
        return None if x is None else (round(x) if shown_unit == "/cumm" else float(nice(x, d)))
    if low in (None, 0) and high is not None:
        range_txt = random.choice([f"< {nice(shown_high, d)}", f"Up to {nice(shown_high, d)}"])
        printed = (None, shown(shown_high))
    elif high is None:
        range_txt = f"> {nice(shown_low, d)}"
        printed = (shown(shown_low), None)
    else:
        sep = random.choice([" - ", "-", " to "])
        if shown_unit == "/cumm":
            range_txt = f"{int(shown_low):,}{sep}{int(shown_high):,}"
        else:
            range_txt = f"{nice(shown_low, d)}{sep}{nice(shown_high, d)}"
        printed = (shown(shown_low), shown(shown_high))

    # Ground truth in OUR standard units (what the extractor must output)
    std_value = float(value_txt.replace(",", ""))
    factor = 1.0
    if shown_unit == "mg/dL" and code in ("fbs", "rbs", "sugar_2h"):
        factor = 1 / 18
    if shown_unit == "/cumm":
        factor = 1 / 1000
    truth = {
        "code": code,
        "value": round(std_value * factor, 2),
        "unit": unit,
        "printed_low": round(printed[0] * factor, 2) if printed[0] is not None else None,
        "printed_high": round(printed[1] * factor, 2) if printed[1] is not None else None,
    }
    flag = ""
    if high is not None and value > high:
        flag = "H"
    elif low is not None and value < low:
        flag = "L"
    row = {"name": random.choice(WRITTEN[code]), "value": value_txt, "flag": flag,
           "unit": shown_unit, "range": range_txt}
    # Exactly what is on paper: this is the target our language model learns to read.
    truth["as_printed"] = {"test": row["name"], "value": float(value_txt.replace(",", "")),
                           "unit": shown_unit, "low": printed[0], "high": printed[1]}
    return row, truth


def render(rows, meta, font_path, size=(1240, 1754)):
    W, H = size
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    try:
        big = ImageFont.truetype(font_path, 40)
        mid = ImageFont.truetype(font_path, 26)
        small = ImageFont.truetype(font_path, 24)
    except Exception:
        big = mid = small = ImageFont.load_default()
    y = 70
    d.text((80, y), meta["lab"], font=big, fill="black"); y += 60
    d.text((80, y), "Department of Pathology", font=small, fill=(60, 60, 60)); y += 50
    d.line((80, y, W - 80, y), fill="black", width=3); y += 25
    d.text((80, y), f"Name: {meta['name']}", font=small, fill="black")
    d.text((700, y), f"Age/Sex: {meta['age']} Y / {meta['sex'][0].upper()}", font=small, fill="black"); y += 40
    d.text((80, y), f"Report Date: {meta['date']}", font=small, fill="black"); y += 60
    cols = [80, 520, 680, 860] if meta["layout"] == 0 else [80, 470, 640, 830]
    for x, h in zip(cols, ["Test", "Result", "Unit", "Reference Range"]):
        d.text((x, y), h, font=mid, fill="black")
    y += 42
    d.line((80, y, W - 80, y), fill="black", width=2); y += 18
    for row in rows:
        if row.get("section"):
            y += 10
            d.text((80, y), row["section"], font=mid, fill="black"); y += 44
            continue
        value = f"{row['value']} {row['flag']}".strip()
        d.text((cols[0], y), row["name"], font=small, fill="black")
        d.text((cols[1], y), value, font=small, fill="black")
        d.text((cols[2], y), row["unit"], font=small, fill="black")
        d.text((cols[3], y), row["range"], font=small, fill="black")
        y += 44
        if y > H - 120:
            break
    d.text((80, H - 90), "This is a synthetic report generated for testing. Not a real patient.", font=small, fill=(90, 90, 90))
    return img


def add_photo_noise(img):
    """Make it look like a phone photo: slight rotation, blur, darker light."""
    img = img.rotate(random.uniform(-2.0, 2.0), expand=True, fillcolor="white")
    if random.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.3, 1.0)))
    if random.random() < 0.5:
        shade = random.randint(200, 245)
        overlay = Image.new("RGB", img.size, (shade, shade, shade - 10))
        img = Image.blend(img, overlay, 0.15)
    return img


def generate(count, out_dir, seed=42):
    random.seed(seed)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        sex = random.choice(["male", "female"])
        meta = {"lab": random.choice(LABS), "name": f"{random.choice(FIRST)} {random.choice(LAST)}",
                "age": random.randint(18, 80), "sex": sex, "date": f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/2026",
                "layout": random.randint(0, 1)}
        panels = random.sample(list(PANELS), k=random.randint(1, 3))
        rows, truths = [], []
        for panel in panels:
            codes = PANELS[panel]
            chosen = codes if len(codes) <= 6 else random.sample(codes, k=random.randint(4, len(codes)))
            if len(rows) >= 24:  # keep everything on one page
                break
            rows.append({"section": panel.upper()})
            for code in chosen:
                if len(rows) >= 28:
                    break
                row, truth = make_record(code, sex)
                rows.append(row)
                truths.append(truth)
        font = random.choice(FONTS) if FONTS else None
        img = render(rows, meta, font)
        img = add_photo_noise(img)
        name = f"report_{i:04d}"
        img.save(out / f"{name}.jpg", quality=random.randint(70, 92))
        with open(out / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump({"sex": sex, "age": meta["age"], "tests": truths}, f, indent=1)
    print(f"Created {count} synthetic reports in {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=50)
    ap.add_argument("--out", default="dataset/synthetic")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    generate(args.count, args.out, args.seed)
