# Fine-tuning our own model (Qwen3 4B, RTX 5070)

**Job of the model:** only to make the Bangla explanation of one already-decided result sound natural.
Our range engine still decides every status and the specialist; the model never extracts or decides anything.
Every model answer is checked by `medilens/guard.py` (right value, right direction, no medicine/dose, no diagnosis,
no invented numbers, doctor advice present). If anything fails, or the model is off, the template text is shown.

## Steps (run from the project root)

| # | Command | Result |
| --- | --- | --- |
| 1 | `python training/make_dataset.py --n 6000` | `training/data/train.jsonl`, `test.jsonl` |
| 2 | `ollama pull qwen3:4b` then `python training/eval_model.py --models qwen3:4b --n 200` | **baseline**: how the untouched model scores |
| 3 | `pip install torch --index-url https://download.pytorch.org/whl/cu128` then `pip install -r training/requirements-train.txt` | training libraries (use WSL2 Ubuntu on Windows) |
| 4 | `python training/train_lora.py --base Qwen/Qwen3-4B-Instruct-2507 --out training/out/qwen3-4b-lora` | LoRA adapter (about 1-2 hours) |
| 5 | `python training/merge_export.py --base Qwen/Qwen3-4B-Instruct-2507 --adapter training/out/qwen3-4b-lora --llama-cpp ~/llama.cpp --name medilens-qwen` | GGUF + Modelfile |
| 6 | `ollama create medilens-qwen -f training/out/medilens-qwen/Modelfile` | model in Ollama |
| 7 | `python training/eval_model.py --models qwen3:4b medilens-qwen --n 200` | table: templates vs base vs fine-tuned, plus `samples.csv` |
| 8 | set `MEDILENS_MODEL_URL=http://localhost:11434` and `MEDILENS_MODEL_NAME=medilens-qwen`, restart the AI service | model is used |

Comparison model: repeat steps 2-7 with `google/gemma-3-4b-it` (accept its license on Hugging Face first) and a different `--name`.
Out of memory in step 4? Use `--batch 2 --accum 8`.

## What to report
- Settings are saved in `training/out/<run>/train_config.json` (model, rank, learning rate, epochs, examples).
- `results.md` pass rate per system and the failure types (value_missing, direction_missing, extra_numbers, ...).
- `samples.csv`: 3 people rate naturalness 1-5 for template / base / fine-tuned; report the averages.
- Be honest: the training targets are built from reviewed template sentences, so the model learns to **combine and
  rephrase** them with variety. It does not learn new medical facts. A medical reviewer must check
  `medilens/explain_bn.py` and `medilens/combos.py` before real patients use the app.

## Files
`make_dataset.py` data builder | `train_lora.py` QLoRA training | `merge_export.py` merge + GGUF + Modelfile | `eval_model.py` comparison.
`dataset/prepare_finetune_data.py` is the older OCR-extraction data builder (not used for the explanation model).
