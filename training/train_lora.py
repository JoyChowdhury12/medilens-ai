"""LoRA / QLoRA fine-tuning for the Bangla explanation model (RTX 5070, 12 GB).

  python training/train_lora.py --base Qwen/Qwen3-4B-Instruct-2507 --out training/out/qwen3-4b-lora
  python training/train_lora.py --base google/gemma-3-4b-it       --out training/out/gemma3-4b-lora

Only the answer part (the Bangla explanation) is trained; the prompt tokens are masked.
Training settings are saved to <out>/train_config.json for the project report.
"""
import argparse
import json
import math
import random
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, DataCollatorForSeq2Seq, Trainer,
                          TrainingArguments)


def render(tok, messages, add_generation_prompt):
    kw = {"enable_thinking": False}  # ignored by templates that do not know it
    return tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=add_generation_prompt, **kw)


def encode(tok, row, max_len):
    msgs = row["messages"]
    prompt = render(tok, msgs[:-1], True)
    full = prompt + msgs[-1]["content"] + (tok.eos_token or "")
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    f_ids = tok(full, add_special_tokens=False)["input_ids"][:max_len]
    labels = [-100] * min(len(p_ids), len(f_ids)) + f_ids[len(p_ids):]
    return {"input_ids": f_ids, "attention_mask": [1] * len(f_ids), "labels": labels}


class DS(torch.utils.data.Dataset):
    def __init__(self, items):
        self.items = items

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        return self.items[i]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen3-4B-Instruct-2507")
    ap.add_argument("--data", default="training/data/train.jsonl")
    ap.add_argument("--out", default="training/out/lora")
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--accum", type=int, default=4)
    ap.add_argument("--max-len", type=int, default=768)
    ap.add_argument("--no-4bit", action="store_true", help="use bf16 instead of 4-bit (needs more VRAM)")
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    random.seed(a.seed)

    tok = AutoTokenizer.from_pretrained(a.base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    quant = None if a.no_4bit else BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                                                      bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
    model = AutoModelForCausalLM.from_pretrained(a.base, quantization_config=quant, torch_dtype=torch.bfloat16, device_map={"": 0})
    if quant:
        model = prepare_model_for_kbit_training(model)
    model.gradient_checkpointing_enable()
    model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05, task_type="CAUSAL_LM",
                                             target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
    model.print_trainable_parameters()

    rows = [json.loads(l) for l in open(a.data, encoding="utf-8")]
    random.shuffle(rows)
    ds = DS([encode(tok, r, a.max_len) for r in rows])
    print(f"{len(ds)} training examples")

    # 5% warmup as a step count (warmup_ratio was removed in transformers 5)
    warmup = int(0.05 * math.ceil(len(ds) / (a.batch * a.accum)) * a.epochs)
    args = TrainingArguments(output_dir=a.out, per_device_train_batch_size=a.batch, gradient_accumulation_steps=a.accum,
                             num_train_epochs=a.epochs, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=warmup,
                             logging_steps=10, save_strategy="epoch", save_total_limit=2, bf16=True, optim="paged_adamw_8bit",
                             report_to="none", seed=a.seed, remove_unused_columns=False)
    Trainer(model=model, args=args, train_dataset=ds,
            data_collator=DataCollatorForSeq2Seq(tok, padding=True, label_pad_token_id=-100)).train()

    Path(a.out).mkdir(parents=True, exist_ok=True)
    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    json.dump({**vars(a), "examples": len(ds)}, open(Path(a.out) / "train_config.json", "w"), indent=2)
    print("saved adapter to", a.out)


if __name__ == "__main__":
    main()
