# Fine-tuning our own model (next sprint)

Goal: a small open-source language model that we fine-tune ourselves to do two jobs better than our rules and templates:
1. **Extraction**: noisy OCR text → JSON list of tests (as printed on the report).
2. **Explanation**: one verified result → 2–3 sentences of safe, simple Bangla.

The training data comes from `dataset/prepare_finetune_data.py` (chat-format JSONL, one example per line).

## Plan

| Step | What to do | Where |
| --- | --- | --- |
| 1 | Generate 1,000 synthetic reports and build `train.jsonl` / `test.jsonl` | Your laptop (`dataset/` scripts) |
| 2 | Add real consented reports and varied, medically reviewed Bangla explanations | Your laptop |
| 3 | Pick a small open instruction model (about 1–3B parameters, from the Qwen, Llama or Gemma families; check which have good Bangla) | Hugging Face |
| 4 | Fine-tune with LoRA / QLoRA using Hugging Face PEFT (or Unsloth) on a free GPU | Google Colab or Kaggle |
| 5 | Evaluate: run the base model and the fine-tuned model on `test.jsonl`; compare with the 91.9% rule baseline using `dataset/evaluate.py` | Colab / laptop |
| 6 | Export the model to GGUF, quantise it, and serve it locally with Ollama | Your server |
| 7 | Switch it on: set `MEDILENS_MODEL_URL=http://localhost:11434` and `MEDILENS_MODEL_NAME=<your model>` | Your server |

When the model is on, the pipeline uses it first and **automatically falls back** to rules and templates if it
fails, times out, or writes anything unsafe. The rule engine still decides every status.

## Tips
- Save checkpoints to Google Drive often; free Colab sessions disconnect.
- Keep `test.jsonl` untouched during training. It is only for the final comparison.
- Record training settings (model name, epochs, learning rate, LoRA rank) for the report.
