"""Executed on Colab: check the deployed q4 graph before launching training."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "onnxruntime-gpu==1.30.0", "tokenizers==0.22.2", "huggingface-hub==1.2.3"],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import numpy as np
import torch
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

folder = Path("/content/cooldown")
config = json.loads((folder / "smoke-config.json").read_text())
weights = Path(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "onnx/model_q4.onnx_data"))
with weights.open("rb") as stream:
    if hashlib.file_digest(stream, "sha256").hexdigest() != config["weightsSha256"]:
        raise RuntimeError("Downloaded weights differ from frozen baseline")
import shutil
shutil.copyfile(weights, folder / "model_q4.onnx_data")
ort.preload_dlls()
options = ort.SessionOptions()
options.intra_op_num_threads = 4
options.enable_profiling = True
started = time.monotonic()
session = ort.InferenceSession(str(folder / "model_q4.onnx"), options, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
load_seconds = time.monotonic() - started
if "CUDAExecutionProvider" not in session.get_providers():
    raise RuntimeError("CUDA provider is unavailable")
tokenizer = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
special = [tokenizer.token_to_id(name) for name in ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]]
empty = {}
for item in session.get_inputs():
    if item.name in ["input_ids", "attention_mask", "num_logits_to_keep", "lora_scale", "embed_scale"]:
        continue
    empty[item.name] = np.zeros([1 if dim == "batch_size" else 0 if isinstance(dim, str) else dim for dim in item.shape], dtype=np.float32)
rows = [json.loads(line) for line in (folder / "smoke-cases.jsonl").read_text().splitlines()]
durations, lengths = [], []
for row in rows:
    question = row["questions"]["kind"]
    ids = [special[0], *tokenizer.encode(row["state"], add_special_tokens=False).ids, special[1],
           *tokenizer.encode(question["instructions"], add_special_tokens=False).ids]
    positions = []
    for name, description in question["criteria"].items():
        ids += [special[2], *tokenizer.encode(f"{name}: {description}" if description else name, add_special_tokens=False).ids, special[3]]
        positions.append(len(ids) - 1)
    ids.append(special[4])
    positions.append(len(ids) - 1)
    feeds = {**empty, "input_ids": np.array([ids], dtype=np.int64), "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
             "num_logits_to_keep": np.array(len(ids), dtype=np.int64), "lora_scale": np.array(1, dtype=np.float32),
             "embed_scale": np.array(0, dtype=np.float32)}
    started = time.monotonic()
    hidden = session.run(["hidden"], feeds)[0][0][positions]
    durations.append(time.monotonic() - started)
    lengths.append(len(ids))
    if hidden.shape != (len(positions), 1024) or not np.isfinite(hidden).all():
        raise RuntimeError("Invalid hidden features")
profile = json.loads(Path(session.end_profiling()).read_text())
providers = {}
for event in profile:
    provider = event.get("args", {}).get("provider")
    if provider:
        providers[provider] = providers.get(provider, 0) + 1
result = {"gpu": torch.cuda.get_device_name(0), "providers": session.get_providers(), "providerEvents": providers,
          "samples": len(rows), "loadSeconds": round(load_seconds, 3), "medianSeconds": round(float(np.median(durations[1:])), 3),
          "p95Seconds": round(float(np.percentile(durations[1:], 95)), 3), "promptTokens": lengths,
          "scope": "q4 hidden-feature inference smoke; not accuracy or browser WebGPU latency"}
Path("/content/cooldown-smoke.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
print("COOLDOWN_SMOKE_OK", flush=True)
