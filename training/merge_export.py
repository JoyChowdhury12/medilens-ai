"""Merge the LoRA adapter into the base model, convert to GGUF and write an Ollama Modelfile.

  python training/merge_export.py --base Qwen/Qwen3-4B-Instruct-2507 --adapter training/out/qwen3-4b-lora \
         --llama-cpp ~/llama.cpp --name medilens-qwen
  ollama create medilens-qwen -f training/out/medilens-qwen/Modelfile

llama.cpp: git clone https://github.com/ggml-org/llama.cpp  and  pip install -r llama.cpp/requirements.txt
"""
import argparse
import subprocess
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--llama-cpp", required=True, help="path of the llama.cpp folder")
    ap.add_argument("--name", default="medilens-qwen")
    ap.add_argument("--quant", default="q8_0", help="q8_0 (best quality) or f16")
    a = ap.parse_args()

    out = Path("training/out") / a.name
    merged = out / "merged"
    merged.mkdir(parents=True, exist_ok=True)
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16, device_map="cpu")
    model = PeftModel.from_pretrained(model, a.adapter).merge_and_unload()
    model.save_pretrained(merged, safe_serialization=True)
    AutoTokenizer.from_pretrained(a.base).save_pretrained(merged)

    gguf = out / f"{a.name}.gguf"
    subprocess.run([sys.executable, str(Path(a.llama_cpp) / "convert_hf_to_gguf.py"), str(merged), "--outfile", str(gguf),
                    "--outtype", a.quant], check=True)
    # No TEMPLATE line: Ollama reads the chat template from the GGUF.
    (out / "Modelfile").write_text(f"FROM ./{gguf.name}\nPARAMETER temperature 0.1\nPARAMETER num_ctx 2048\n", encoding="utf-8")
    print(f"\nDone. Next:\n  ollama create {a.name} -f {out / 'Modelfile'}\n"
          f"  set MEDILENS_MODEL_URL=http://localhost:11434   and   MEDILENS_MODEL_NAME={a.name}")


if __name__ == "__main__":
    main()
