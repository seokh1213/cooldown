"""Train current classifier LoRA against the exact deployed q4 projections."""
import json
from pathlib import Path
import random
import sys
import time
import numpy as np
import torch
import torch.nn.functional as F
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer
from model_utils import adapter, autocast, export_adapter, load_text_model
from onnx_features import encode_row
from quantized_weights import apply_quantized_weights
from train_heads import Pointer
from checkpoints import Checkpoints
from quantized_inputs import validate_inputs
from training_budget import quantized_limit


def training_rows(root, tokenizer):
    rows = [json.loads(line) for line in (root / "data/head-train.jsonl").read_text().splitlines()]
    encoded = []
    for row in rows:
        for task, question in row["questions"].items():
            if question.get("label") is None: continue
            ids, positions = encode_row(tokenizer, row, question)
            encoded.append((task, ids, positions, list(question["criteria"]).index(question["label"])))
    teachers = []
    for file in sorted((root / "features/head-train").glob("part-*.npz")):
        with np.load(file) as data:
            for i, label in enumerate(data["labels"]):
                hidden = data["feats"][data["offsets"][i]:data["offsets"][i + 1]].astype(np.float32)
                teachers.append((str(data["task"][i]), int(label), hidden))
    if len(encoded) != len(teachers): raise ValueError("Teacher alignment count mismatch")
    combined = []
    for (task, ids, positions, label), (teacher_task, teacher_label, teacher) in zip(encoded, teachers):
        if (task, label) != (teacher_task, teacher_label): raise ValueError("Teacher alignment mismatch")
        combined.append((task, ids, positions, label, teacher))
    return combined


def train(root):
    torch.manual_seed(20261005)
    root = Path(root); output = root / "candidates/quantized"; output.mkdir(parents=True, exist_ok=True)
    validate_inputs(root)
    tokenizer = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
    rows = training_rows(root, tokenizer); random.Random(20261005).shuffle(rows)
    available = len(rows)
    rows = rows[:quantized_limit(root, available)]
    checkpoints = Checkpoints(root, "quantized", ["data/head-train.jsonl", "model_q4.onnx",
        "current-adapters/classifier/adapter_model.safetensors"])
    previous = checkpoints.latest()
    pointers = {}
    for family in ["route", "topic", "act"]:
        prefix = root / "heads" / ("kev-b3e-" + family)
        meta = json.loads(prefix.with_suffix(".json").read_text())
        pointer = Pointer(prefix.with_suffix(".bin"), meta).to("cuda")
        for param in pointer.parameters(): param.requires_grad_(False)
        pointers[family] = pointer
    causal, _ = load_text_model()
    count = apply_quantized_weights(causal, root / "model_q4.onnx")
    model = adapter(causal.model, source=previous / "adapter" if previous else root / "current-adapters/classifier")
    del causal
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=3e-6, weight_decay=0)
    scaler = torch.amp.GradScaler("cuda", init_scale=256)
    progress = checkpoints.restore(optimizer, scaler)
    if progress["step"] > len(rows): raise ValueError("Pilot budget is below saved progress; choose a matching checkpoint")
    model.train(); optimizer.zero_grad(); started = time.monotonic()
    for step, (task, ids, positions, label, teacher) in enumerate(rows, 1):
        if step <= progress["step"]: continue
        tokens = torch.tensor([ids], device="cuda")
        with autocast():
            hidden = model(input_ids=tokens, attention_mask=torch.ones_like(tokens), use_cache=False).last_hidden_state[0, positions].float()
        pointer = pointers["route" if task in ["kind", "mine"] else "act" if task == "act" else "topic"]
        loss = F.cross_entropy(pointer(hidden)[None], torch.tensor([label], device="cuda"))
        loss += .05 * F.mse_loss(hidden, torch.tensor(teacher, device="cuda"))
        if not torch.isfinite(loss): raise ValueError("Non-finite quantization adaptation loss")
        scaler.scale(loss / 8).backward()
        if step % 8 == 0 or step == len(rows):
            scaler.unscale_(optimizer); torch.nn.utils.clip_grad_norm_(params, 1)
            scaler.step(optimizer); scaler.update(); optimizer.zero_grad(set_to_none=True)
            if step != len(rows) and checkpoints.due(step):
                checkpoints.save(model, (optimizer, scaler), step, {})
        if step % 100 == 0 or step == 1:
            print(json.dumps({"stage": "quantized", "rows": step, "total": len(rows), "loss": float(loss.detach()),
                              "seconds": round(time.monotonic() - started)}), flush=True)
    export_adapter(model, output / "last")
    summary = {"projectionCount": count, "trainingRows": len(rows), "availableTrainingRows": available,
               "epochsEquivalent": len(rows) / available, "pilot": len(rows) < available,
               "method": "LoRA adaptation on dequantized exact ONNX q4 weights, with q4 feature distillation",
               "scope": "Not full-weight QAT or bitsandbytes NF4; final accuracy must be measured after ONNX export"}
    (output / "summary.json").write_text(json.dumps(summary, indent=2))
    checkpoints.save(model, (optimizer, scaler), len(rows), summary)
    print(json.dumps({"stage": "quantizedComplete", **summary}), flush=True)


if __name__ == "__main__": train(sys.argv[1])
