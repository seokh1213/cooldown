"""One epoch over grounded QA rows. Loss is restricted to answer tokens."""
import json
from pathlib import Path
import random
import sys
import time
import torch
import torch.nn.functional as F
from model_utils import adapter, autocast, export_adapter, load_text_model
from qa_prompts import prompt_ids
from checkpoints import Checkpoints


def training_sequence(tokenizer, row):
    prompt = prompt_ids(tokenizer, row)
    answer = tokenizer.encode(row["answer"], add_special_tokens=False) + [tokenizer.convert_tokens_to_ids("<|im_end|>")]
    return prompt + answer, len(prompt)


def answer_loss(model, tokens, start):
    device = next(model.parameters()).device
    ids = torch.tensor([tokens], device=device)
    # Compute logits only for the answer predictors; avoid a 248k-vocabulary
    # logits tensor for every context token.
    with autocast(device.type):
        hidden = model.model(input_ids=ids, attention_mask=torch.ones_like(ids), use_cache=False).last_hidden_state
        logits = model.lm_head(hidden[:, start - 1:-1])
    labels = ids[:, start:]
    return F.cross_entropy(logits.float().reshape(-1, logits.shape[-1]), labels.reshape(-1))


@torch.no_grad()
def dev_loss(model, sequences):
    model.eval()
    return sum(float(answer_loss(model, tokens, start)) for tokens, start in sequences) / len(sequences)


def train(root, device="cuda"):
    torch.manual_seed(20261005)
    root = Path(root); output = root / "candidates/sft"; output.mkdir(parents=True, exist_ok=True)
    checkpoints = Checkpoints(root, "sft", ["dev/data/qa-train.jsonl", "dev/data/qa-dev.jsonl"])
    previous = checkpoints.latest()
    causal, tokenizer = load_text_model()
    # Attach to the text model, preserving the LM output layer for masked loss.
    causal.model = adapter(causal.model, source=previous / "adapter" if previous else None, device=device); causal.to(device)
    rows = [json.loads(line) for line in (root / "dev/data/qa-train.jsonl").read_text().splitlines()]
    dev = [json.loads(line) for line in (root / "dev/data/qa-dev.jsonl").read_text().splitlines()]
    sequences = [training_sequence(tokenizer, row) for row in rows]
    validation = [training_sequence(tokenizer, row) for row in dev]
    if max(len(tokens) for tokens, _ in sequences + validation) > 1024: raise ValueError("QA context exceeds pilot budget")
    # Only the adapter should train; embedding/lm_head remain frozen.
    for name, param in causal.named_parameters():
        if "lora_" not in name: param.requires_grad_(False)
    params = [p for p in causal.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=1e-4, weight_decay=.01)
    scaler = torch.amp.GradScaler("cuda", init_scale=256, enabled=device == "cuda")
    progress = checkpoints.restore(optimizer, scaler)
    before = progress["extra"]["devBefore"] if previous else dev_loss(causal, validation)
    started = time.monotonic()
    random.Random(20261005).shuffle(sequences); causal.train(); optimizer.zero_grad()
    for step, (tokens, start) in enumerate(sequences, 1):
        if step <= progress["step"]: continue
        loss = answer_loss(causal, tokens, start)
        if not torch.isfinite(loss): raise ValueError("Non-finite SFT loss")
        scaler.scale(loss / 8).backward()
        if step % 8 == 0 or step == len(sequences):
            scaler.unscale_(optimizer); torch.nn.utils.clip_grad_norm_(params, 1)
            scaler.step(optimizer); scaler.update(); optimizer.zero_grad(set_to_none=True)
            if step != len(sequences) and checkpoints.due(step):
                checkpoints.save(causal.model, (optimizer, scaler), step, {"devBefore": before})
        if step % 80 == 0 or step == 1:
            print(json.dumps({"stage": "sft", "rows": step, "total": len(sequences), "loss": float(loss.detach()),
                              "seconds": round(time.monotonic() - started)}), flush=True)
    after = dev_loss(causal, validation)
    export_adapter(causal.model, output / "last")
    summary = {"trainRows": len(rows), "epochs": 1, "device": device, "devLossBefore": before, "devLossAfter": after,
               "scope": "Synthetic numeric-span copying; no general RAG quality claim"}
    (output / "summary.json").write_text(json.dumps(summary, indent=2))
    checkpoints.save(causal.model, (optimizer, scaler), len(sequences), {"devBefore": before, "summary": summary})
    print(json.dumps({"stage": "sftComplete", **summary}), flush=True)


if __name__ == "__main__": train(*sys.argv[1:3])
