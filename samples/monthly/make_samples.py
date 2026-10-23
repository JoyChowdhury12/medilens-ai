"""Five monthly sample lab reports for one FICTIONAL patient (for testing MediLens). Not real medical records."""
import asyncio, html
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent
OUT.mkdir(exist_ok=True)

def cbc(hb, rbc, hct, rdw, wbc, diff, plt, esr):
    n, l, m, e, b = diff
    return [("HAEMATOLOGY", None),
        ("Haemoglobin", hb, "g/dL", "12.0 - 15.5"),
        ("Total WBC Count", wbc, "K/µL", "4.0 - 11.0"),
        ("Neutrophils", n, "%", "40 - 75"), ("Lymphocytes", l, "%", "20 - 45"),
        ("Monocytes", m, "%", "2 - 10"), ("Eosinophils", e, "%", "1 - 6"), ("Basophils", b, "%", "0 - 1"),
        ("RBC Count", rbc, "M/µL", "4.0 - 5.2"),
        ("HCT (PCV)", hct, "%", "36 - 46"),
        ("MCV", round(hct / rbc * 10, 1), "fL", "80 - 100"),
        ("MCH", round(hb / rbc * 10, 1), "pg", "27 - 32"),
        ("MCHC", round(hb / hct * 100, 1), "g/dL", "32 - 36"),
        ("RDW-CV", rdw, "%", "11.5 - 14.5"),
        ("Platelet Count", plt, "K/µL", "150 - 450"),
        ("ESR", esr, "mm/1st hr", "0 - 20")]

def chem(fbs, a1c, tc, tg, hdl, creat, alt, ferr):
    rows = [("BIOCHEMISTRY", None), ("Fasting Blood Sugar", fbs, "mmol/L", "3.9 - 6.1")]
    if a1c is not None:
        rows.append(("HbA1c", a1c, "%", "4.0 - 5.6"))
    ldl = round(tc - hdl - tg / 5)
    rows += [("Total Cholesterol", tc, "mg/dL", "< 200"), ("Triglycerides", tg, "mg/dL", "< 150"),
             ("HDL Cholesterol", hdl, "mg/dL", "> 50"), ("LDL Cholesterol", ldl, "mg/dL", "< 130"),
             ("Non-HDL Cholesterol", tc - hdl, "mg/dL", "< 130"),
             ("Serum Creatinine", creat, "mg/dL", "0.5 - 1.1"), ("SGPT (ALT)", alt, "U/L", "< 33"),
             ("Serum Ferritin", ferr, "ng/mL", "15 - 150")]
    return rows

def low_high(value, ref):
    ref = ref.replace(" ", "")
    try:
        if ref.startswith("<"): return "H" if value >= float(ref[1:]) else ""
        if ref.startswith(">"): return "L" if value < float(ref[1:]) else ""
        lo, hi = map(float, ref.split("-"))
        return "L" if value < lo else "H" if value > hi else ""
    except ValueError:
        return ""

REPORTS = [  # (month label, collected, report id, cbc args, chem args)
    ("May 2026", "10/05/2026", "SD-260510-0412", (9.2, 3.90, 30.1, 17.2, 7.8, (62, 30, 5, 2, 1), 310, 28), (7.4, 6.9, 238, 210, 41, 0.8, 38, 8)),
    ("June 2026", "10/06/2026", "SD-260610-0388", (10.1, 4.05, 32.6, 16.4, 7.2, (60, 32, 5, 2, 1), 295, 22), (6.9, None, 226, 188, 43, 0.8, 34, 15)),
    ("July 2026", "10/07/2026", "SD-260710-0451", (11.0, 4.20, 34.6, 15.3, 7.0, (58, 34, 5, 2, 1), 280, 18), (6.4, 6.4, 212, 170, 45, 0.9, 30, 24)),
    ("August 2026", "10/08/2026", "SD-260810-0397", (11.8, 4.30, 36.4, 14.6, 6.8, (57, 35, 5, 2, 1), 268, 14), (6.0, None, 201, 158, 47, 0.8, 27, 32)),
    ("September 2026", "10/09/2026", "SD-260910-0420", (12.5, 4.40, 38.2, 13.9, 6.6, (56, 36, 5, 2, 1), 255, 11), (5.6, 5.9, 192, 146, 49, 0.8, 24, 41)),
]

CSS = """
* { box-sizing: border-box; } body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
.page { width: 1240px; min-height: 1754px; padding: 60px 70px; position: relative; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1d5c7a; padding-bottom: 14px; }
.lab { font-size: 34px; font-weight: bold; color: #1d5c7a; letter-spacing: .5px; }
.addr { font-size: 16px; color: #444; margin-top: 4px; }
.tag { font-size: 15px; font-weight: bold; color: #b42318; border: 2px solid #b42318; padding: 6px 10px; border-radius: 4px; }
h2 { text-align: center; font-size: 24px; margin: 22px 0 14px; letter-spacing: 2px; }
.info { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 40px; font-size: 18px; border: 1.5px solid #999; border-radius: 6px; padding: 14px 18px; }
.info b { display: inline-block; width: 150px; font-weight: normal; color: #444; }
table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 20px; }
th { text-align: left; border-top: 2px solid #333; border-bottom: 2px solid #333; padding: 9px 8px; font-size: 18px; }
td { padding: 7px 8px; border-bottom: 1px solid #e3e3e3; }
td.v { font-weight: bold; } td.f { color: #b42318; font-weight: bold; width: 40px; }
tr.sec td { font-weight: bold; background: #eef4f7; color: #1d5c7a; padding-top: 10px; border-bottom: none; }
.sign { display: flex; justify-content: space-between; margin-top: 70px; font-size: 17px; }
.sign div { border-top: 1px solid #333; padding-top: 6px; width: 300px; }
.foot { position: absolute; bottom: 40px; left: 70px; right: 70px; font-size: 14px; color: #666; border-top: 1px solid #ccc; padding-top: 8px; display: flex; justify-content: space-between; }
"""

def page(label, collected, rid, cbc_args, chem_args):
    rows = cbc(*cbc_args) + chem(*chem_args)
    body = []
    for r in rows:
        if r[1] is None:
            body.append(f'<tr class="sec"><td colspan="5">{r[0]}</td></tr>'); continue
        name, val, unit, ref = r
        flag = low_high(val, ref)
        shown = f"{val:.2f}" if isinstance(val, float) and val < 10 and unit in ("M/µL", "mg/dL") and name != "Total Cholesterol" else f"{val:g}"
        body.append(f'<tr><td>{html.escape(name)}</td><td class="v">{shown}</td><td class="f">{flag}</td><td>{html.escape(unit)}</td><td>{html.escape(ref)}</td></tr>')
    d, m, y = collected.split("/")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="page">
<div class="head"><div><div class="lab">SAMPLE DIAGNOSTIC CENTRE</div>
<div class="addr">12 Demo Road, Sample Town &nbsp;·&nbsp; Fictional lab for software testing</div></div>
<div class="tag">SAMPLE REPORT — NOT A REAL MEDICAL RECORD</div></div>
<h2>LABORATORY REPORT</h2>
<div class="info">
<div><b>Patient</b>: Rahima Akter (sample)</div><div><b>Report ID</b>: {rid}</div>
<div><b>Age / Sex</b>: 42 Y / Female</div><div><b>Collected on</b>: {collected}, 08:30 AM</div>
<div><b>Referred by</b>: Self</div><div><b>Reported on</b>: {d}/{m}/{y}, 04:00 PM</div>
</div>
<table><thead><tr><th>Test</th><th>Result</th><th></th><th>Unit</th><th>Reference Range</th></tr></thead><tbody>
{''.join(body)}
</tbody></table>
<div class="sign"><div>Lab Technologist</div><div>Consultant Pathologist</div></div>
<div class="foot"><span>Sample report {label} · for testing MediLens only</span><span>Page 1 of 1</span></div>
</div></body></html>"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1240, "height": 1754})
        for i, rep in enumerate(REPORTS, 1):
            name = f"month{i}_{rep[0].split()[0].lower()}_2026"
            await pg.set_content(page(*rep)); await pg.wait_for_timeout(200)
            await pg.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
            await pg.pdf(path=str(OUT / f"{name}.pdf"), width="1240px", height="1754px", print_background=True)
            print("made", name)
        await b.close()

asyncio.run(main())
