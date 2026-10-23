# Monthly sample reports (fictional, for testing)

Five lab reports for one **fictional** patient, Rahima Akter (42, female), from a **fictional** lab.
Each report is marked "SAMPLE REPORT — NOT A REAL MEDICAL RECORD". Use them to demo uploads, trends and reminders.

| File | Collected | Story |
| --- | --- | --- |
| month1_may_2026 | 10 May 2026 | Iron-deficiency anaemia (Hb 9.2, MCV 77, ferritin 8), high sugar (FBS 7.4, HbA1c 6.9), high cholesterol (238, LDL 155), ALT a little high |
| month2_june_2026 | 10 Jun 2026 | Starting to improve (Hb 10.1, FBS 6.9, cholesterol 226); no HbA1c this month |
| month3_july_2026 | 10 Jul 2026 | Better (Hb 11.0, HbA1c 6.4, cholesterol 212, ALT normal) |
| month4_august_2026 | 10 Aug 2026 | Almost normal (Hb 11.8, FBS 6.0, cholesterol 201) |
| month5_september_2026 | 10 Sep 2026 | Mostly normal (Hb 12.5, HbA1c 5.9, cholesterol 192); HDL still a little low |

Values are internally consistent (MCV = Hct/RBC, MCH = Hb/RBC, MCHC = Hb/Hct, LDL = TC − HDL − TG/5, Non-HDL = TC − HDL,
white-cell percentages add up to 100), so MediLens's cross-checks do not raise false warnings.

Each month comes as a PNG (like a photo/scan) and a PDF (digital, with a text layer).
Tested: MediLens reads all 24-25 values, every printed range, the collection date and the lab name correctly in all 10 files.

Upload them in order (May first) to the same family profile, then open Trends.
Regenerate with `python make_samples.py` (needs `pip install playwright` and `playwright install chromium`).
