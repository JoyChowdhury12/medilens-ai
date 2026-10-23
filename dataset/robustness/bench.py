"""Accuracy of MediLens on the degraded images: share of test values read exactly right, per kind of damage."""
import sys, json, time
from pathlib import Path
from collections import defaultdict
D = Path(__file__).parent
sys.path.insert(0, str(D.parent.parent))
src = (D.parent.parent / "samples" / "monthly" / "make_samples.py").read_text().split("async def main")[0]
ns = {"__file__": str(D.parent.parent / "samples" / "monthly" / "make_samples.py")}; exec(src, ns)
from medilens import pipeline
CODES = {"Haemoglobin":"hemoglobin","Total WBC Count":"wbc","Neutrophils":"neutrophils","Lymphocytes":"lymphocytes","Monocytes":"monocytes","Eosinophils":"eosinophils","Basophils":"basophils","RBC Count":"rbc","HCT (PCV)":"hematocrit","MCV":"mcv","MCH":"mch","MCHC":"mchc","RDW-CV":"rdw","Platelet Count":"platelets","ESR":"esr","Fasting Blood Sugar":"fbs","HbA1c":"hba1c","Total Cholesterol":"cholesterol","Triglycerides":"triglycerides","HDL Cholesterol":"hdl","LDL Cholesterol":"ldl","Non-HDL Cholesterol":"non_hdl","Serum Creatinine":"creatinine","SGPT (ALT)":"alt","Serum Ferritin":"ferritin"}
truths = {}
for i, rep in enumerate(ns["REPORTS"], 1):
    truths[i] = {CODES[r[0]]: (r[1], r[3]) for r in ns["cbc"](*rep[3]) + ns["chem"](*rep[4]) if r[1] is not None}
def rng_ok(rec, ref):
    ref = ref.replace(" ", "")
    if ref.startswith("<"): return rec["printed_low"] is None and rec["printed_high"] == float(ref[1:])
    if ref.startswith(">"): return rec["printed_high"] is None and rec["printed_low"] == float(ref[1:])
    lo, hi = map(float, ref.split("-")); return rec["printed_low"] == lo and rec["printed_high"] == hi
tag = sys.argv[1] if len(sys.argv) > 1 else "run"
only = sys.argv[2:] 
stats = defaultdict(lambda: [0, 0, 0, 0, 0.0])   # values ok, ranges ok, wrong values, total, seconds
for img in sorted((D / "imgs").glob("*.jpg")):
    m, case = img.stem.split("_", 1); m = int(m[1:])
    if only and case not in only: continue
    t = time.time(); r = pipeline.extract_from_image(img.read_bytes()); dt = time.time() - t
    recs = {x["code"]: x for x in r["tests"]}
    s = stats[case]
    for code, (v, ref) in truths[m].items():
        s[3] += 1
        if code in recs:
            if abs(recs[code]["value"] - v) < 0.011: s[0] += 1; s[1] += rng_ok(recs[code], ref)
            else: s[2] += 1
    s[4] += dt
    print(f"{img.stem:20s} values {sum(1 for c,(v,_) in truths[m].items() if c in recs and abs(recs[c]['value']-v)<.011)}/{len(truths[m])}  {dt:.0f}s", flush=True)
rows = {c: {"values": round(100 * s[0] / s[3], 1), "ranges": round(100 * s[1] / s[3], 1), "wrong": s[2], "sec": round(s[4] / 3, 1)} for c, s in stats.items()}
(D / f"result_{tag}.json").write_text(json.dumps(rows, indent=1))
print(json.dumps(rows))
