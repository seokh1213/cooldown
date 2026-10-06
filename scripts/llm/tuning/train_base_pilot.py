"""A resumable one-epoch natural-QA pilot across three pinned small backbones."""
import gc
import json
from pathlib import Path
import random
import sys
import time
import numpy as np
import torch
from artifact_io import atomic_json
from base_pilot_model import load, loss, sequence, validation_loss
from checkpoints import Checkpoints
from evaluate_base_pilot import evaluate, publish_result
from model_utils import export_adapter


def train(root, key):
    torch.manual_seed(20261006); random.seed(20261006); np.random.seed(20261006)
    stage = "sft-" + key
    inputs = ["data/models.json", "data/natural-train.jsonl", "data/natural-dev.jsonl", "data/qa-followup.jsonl"]
    checkpoints = Checkpoints(root, stage, inputs); previous = checkpoints.latest()
    specification = json.loads((root / "data/models.json").read_text())[key]
    model, tokenizer = load(specification, previous)
    rows = [json.loads(line) for line in (root / "data/natural-train.jsonl").read_text().splitlines()]
    examples = [sequence(tokenizer, row) for row in rows]
    validation = [sequence(tokenizer, json.loads(line)) for line in (root / "data/natural-dev.jsonl").read_text().splitlines()]
    if max(len(tokens) for tokens, _ in examples + validation) > 1900: raise ValueError("Training prompt budget exceeded")
    parameters = [parameter for parameter in model.parameters() if parameter.requires_grad]
    optimizer = torch.optim.AdamW(parameters, lr=1e-4, weight_decay=.01)
    scaler = torch.amp.GradScaler("cuda", init_scale=256)
    progress = checkpoints.restore(optimizer, scaler)
    before = progress["extra"].get("devBefore")
    if before is None: before = validation_loss(model, validation)
    if previous is None: checkpoints.save(model.model, (optimizer, scaler), 0, {"devBefore": before})
    random.Random(20261006).shuffle(examples); model.train(); optimizer.zero_grad(set_to_none=True)
    started = time.monotonic()
    for step, example in enumerate(examples, 1):
        if step <= progress["step"]: continue
        value = loss(model, example)
        if not torch.isfinite(value): raise ValueError("Non-finite pilot loss")
        batch_size = min(8, len(examples) - ((step - 1) // 8) * 8)
        scaler.scale(value / batch_size).backward()
        if step % 8 == 0 or step == len(examples):
            scaler.unscale_(optimizer); torch.nn.utils.clip_grad_norm_(parameters, 1)
            scaler.step(optimizer); scaler.update(); optimizer.zero_grad(set_to_none=True)
            if checkpoints.due(step) or step == len(examples):
                checkpoints.save(model.model, (optimizer, scaler), step, {"devBefore": before})
        if step == 1 or step % 20 == 0 or step == len(examples):
            atomic_json(root / "pilot-progress.json", {"model": key, "phase": "training", "rows": step,
                "totalRows": len(examples), "loss": float(value.detach()), "seconds": round(time.monotonic() - started)})
    after = validation_loss(model, validation)
    directory = root / "candidates" / stage; directory.mkdir(parents=True, exist_ok=True)
    export_adapter(model.model, directory / "last")
    tokenizer.save_pretrained(directory / "tokenizer")
    model.config.save_pretrained(directory / "model-config")
    summary = {"base": specification, "trainRows": len(rows), "devRows": len(validation), "epochs": 1,
        "rank": 16, "alpha": 32, "learningRate": 1e-4, "accumulation": 8,
        "trainableParameters": sum(parameter.numel() for parameter in parameters),
        "trainSecondsThisSession": time.monotonic() - started, "resumedFromRow": progress["step"],
        "devLossBefore": before, "devLossAfter": after,
        "maxTrainingTokens": max(len(tokens) for tokens, _ in examples), "gpuPeakAllocated": torch.cuda.max_memory_allocated(),
        "scope": "Natural semantic numeric QA; backbone layers unchanged; fresh LoRA, no held-out training"}
    atomic_json(directory / "summary.json", summary)
    evaluate(model, tokenizer, root, key)
    publish_result(root, key, len(rows))
    del model, optimizer, parameters, scaler
    gc.collect(); torch.cuda.empty_cache(); torch.cuda.reset_peak_memory_stats()


def pipeline(root):
    root = Path(root)
    for key in ["lfm25", "qwen25", "qwen35"]:
        if (root / "candidates" / ("sft-" + key) / "evaluation.json").exists(): continue
        train(root, key)
    (root / "GPU_DONE").write_text("All three base pilots and evaluations completed")
    atomic_json(root / "pilot-progress.json", {"phase": "complete", "modelsCompleted": 3})


if __name__ == "__main__":
    try: pipeline(sys.argv[1])
    except Exception as error:
        atomic_json(Path(sys.argv[1]) / "pilot-error.json", {"error": type(error).__name__})
        raise
