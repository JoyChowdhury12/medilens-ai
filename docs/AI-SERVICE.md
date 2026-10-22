# MediLens AI Service

The AI part of MediLens: it reads a photo of an **English lab report** and explains the results in **simple Bangla**.
Everything runs on your own computer or server. **No external AI API is used.**

```
Photo ──► OpenCV cleanup ──► Tesseract OCR ──► Extractor ──► (user confirms) ──► Range engine ──► Bangla explanation
          (ocr.py)           (ocr.py)          (extract_rules.py,               (range_engine.py)  (explain_bn.py)
                                                later: fine-tuned model)          + specialist.py
```

## What is inside

| Folder / file | What it does |
| --- | --- |
| `medilens/ocr.py` | Cleans the photo (straighten, denoise) and reads text with Tesseract OCR |
| `medilens/extract_rules.py` | Turns OCR lines into tests: name, value, unit, printed range. Handles BD formats like `2,45,000 /cumm` and sugar in mg/dL |
| `medilens/dictionary.py` + `data/tests.json` | Our test dictionary: 40 common tests, their many spellings, units and reference ranges |
| `medilens/range_engine.py` | **Our own rule engine**: decides normal / borderline / low / high / critical and explains why with numbers |
| `medilens/specialist.py` | Suggests which specialist to see and how urgently |
| `medilens/explain_bn.py` | Bangla explanations (templates) + safety filter that blocks medicine/dose advice |
| `medilens/local_model.py` | Hook for **our fine-tuned model** (switched off until we train it) |
| `medilens/pipeline.py` | Connects all steps |
| `api/main.py` | FastAPI web service the website will call |
| `dataset/generate_reports.py` | **Our dataset tool**: makes synthetic report images + correct answers |
| `dataset/evaluate.py` | Measures accuracy against the correct answers |
| `dataset/prepare_finetune_data.py` | Builds training data (JSONL) for fine-tuning our model |
| `tests/` | Automated tests (`pytest`) |

## Setup (Windows)

1. **Install Python 3.11 or newer** from python.org. During install, tick **"Add Python to PATH"**.
2. **Install Tesseract OCR**: download the Windows installer from the UB Mannheim Tesseract page
   (search "tesseract ocr windows ub mannheim"). Install with default options.
3. Open **Command Prompt** in this folder and run:
   ```bat
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   set TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
   ```
   (On macOS/Linux: `python3 -m venv venv`, `source venv/bin/activate`, and install Tesseract with
   `brew install tesseract` or `sudo apt install tesseract-ocr`; no `TESSERACT_CMD` needed.)

## Run it

**1. Run the tests** (should say `19 passed`):
```bat
pytest -q
```

**2. Start the API:**
```bat
uvicorn api.main:app --reload --port 8000
```
Open **http://localhost:8000/docs** in your browser. You can try every endpoint there:
- `POST /extract` – upload `samples/sample_report.jpg`. You get the tests found. Values with `"needs_check": true`
  should be highlighted on the website's confirm screen.
- `POST /interpret` – send the confirmed tests (copy the `tests` list from `/extract`) plus `"sex": "female"`.
  You get each status, the reason, Bangla explanations, a summary and the specialist suggestion.

**3. Make a dataset and measure accuracy:**
```bat
python dataset/generate_reports.py --count 100 --out dataset/synthetic
python dataset/evaluate.py --data dataset/synthetic
```

## Current results (baseline, no fine-tuned model yet)

Measured on 100 synthetic report photos (998 tests) with `dataset/evaluate.py`:

| Measure | Result |
| --- | --- |
| Tests found (recall) | 98.4% |
| Found tests that were real (precision) | 100% |
| Value read correctly | 95.0% |
| Printed range read correctly | 95.1% |
| **Name + value + range all correct** | **91.9%** |

Most remaining errors are OCR slips such as a lost decimal point ("1.3" read as "13").
Suspicious values are marked `needs_check` so the user fixes them on the confirm screen,
and the rule engine never trusts a value the user has not confirmed.
**Our fine-tuned model must beat 91.9% on the same test set**; that comparison goes in the final report.

Processing time: about 5 seconds per report on a normal laptop CPU.

## Next steps

1. **Real reports:** collect about 50 real reports with written consent, blur names, write the correct answers
   in the same JSON format as `samples/sample_report_truth.json`, and evaluate on them too.
2. **Medical review:** ask a doctor or medical student to check `data/tests.json` ranges and all Bangla
   sentences in `explain_bn.py`. Write 2–3 different reviewed explanations per test so the model learns varied Bangla.
3. **Fine-tuning:** run `dataset/prepare_finetune_data.py` on 800–1,000 reports, then follow `training/README.md`.
4. **Website:** the NestJS backend calls `/extract` and `/interpret` of this service.

## Important

- Reference ranges in `tests.json` are common adult values. The range **printed on the report always wins**.
- MediLens explains reports; it does not diagnose or suggest medicines. Keep the disclaimer on every result page.
- Synthetic reports are clearly marked "not a real patient". Never commit real patient reports to GitHub.
