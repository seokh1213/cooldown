"""Continue the current retrieval adapter with mined, same-language negatives."""
import json
from pathlib import Path
import sys
import time
import numpy as np
import torch
import torch.nn.functional as F
from model_utils import adapter, autocast, export_adapter, load_text_model, token_batch
from checkpoints import Checkpoints
from retrieval_order import align_mined, retrieval_batches

LANGS = ["ko_KR", "en_US", "zh_CN"]
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}


class Retriever:
    def __init__(self, root, source=None):
        causal, self.tokenizer = load_text_model()
        self.model = adapter(causal.model, source=source or root / "current-adapters/retrieval")
        self.pad = self.tokenizer.pad_token_id or self.tokenizer.eos_token_id

    def ids(self, text, lang):
        return self.tokenizer.encode(EOL[lang].format(text), add_special_tokens=False)[:256]

    def encode(self, rows):
        tokens, mask = token_batch([self.ids(text, lang) for text, lang in rows], self.pad)
        with autocast(): hidden = self.model(input_ids=tokens, attention_mask=mask, use_cache=False).last_hidden_state
        last = mask.sum(1) - 1
        return F.normalize(hidden[torch.arange(len(rows), device="cuda"), last].float(), dim=-1)

    @torch.no_grad()
    def vectors(self, rows):
        self.model.eval()
        return np.concatenate([self.encode(rows[start:start + 4]).cpu().numpy() for start in range(0, len(rows), 4)])


def doc_text(doc): return doc["title"] + "\n" + doc["text"][:600]


def score(retriever, docs, rows):
    vectors = {lang: retriever.vectors([(doc_text(d), lang) for d in docs[lang]]) for lang in LANGS}
    queries = retriever.vectors([(r["q"], r["lang"]) for r in rows])
    right = 0
    for row, vector in zip(rows, queries):
        doc = docs[row["lang"]][int((vectors[row["lang"]] @ vector).argmax())]
        right += doc["id"] in row["gold"]
    return right / len(rows), vectors


def mine(retriever, docs, rows):
    allowed = {doc for row in rows for doc in row["gold"]}
    candidates = {lang: [d for d in docs[lang] if d["id"] in allowed] for lang in LANGS}
    vectors = {lang: retriever.vectors([(doc_text(d), lang) for d in candidates[lang]]) for lang in LANGS}
    queries = retriever.vectors([(r["q"], r["lang"]) for r in rows])
    result = []
    for row, vector in zip(rows, queries):
        order = np.argsort(-(vectors[row["lang"]] @ vector))
        negatives = [candidates[row["lang"]][i]["id"] for i in order if candidates[row["lang"]][i]["id"] not in row["gold"]][:3]
        result.append({**row, "negatives": negatives})
    return result


def train(root):
    torch.manual_seed(20261005)
    root = Path(root); output = root / "candidates/retrieval"; output.mkdir(parents=True, exist_ok=True)
    read = lambda name: [json.loads(line) for line in (root / "data" / name).read_text().splitlines()]
    rows, dev = read("retrieval-train.jsonl"), read("retrieval-dev.jsonl")
    docs = {lang: json.loads((root / "data" / f"corpus-{lang}.json").read_text()) for lang in LANGS}
    lookup = {lang: {d["id"]: d for d in docs[lang]} for lang in LANGS}
    checkpoints = Checkpoints(root, "retrieval", ["dev/data/retrieval-train.jsonl", "dev/data/retrieval-dev.jsonl",
        "current-adapters/retrieval/adapter_model.safetensors"])
    previous = checkpoints.latest()
    retriever = Retriever(root, previous / "adapter" if previous else None); started = time.monotonic()
    extra = json.loads((previous / "checkpoint.json").read_text())["extra"] if previous else {}
    before = extra["devBefore"] if previous else score(retriever, docs, dev)[0]
    print(json.dumps({"stage": "retrieval", "devBefore": before}), flush=True)
    mined = align_mined(rows, extra["mined"]) if previous else mine(retriever, docs, rows)
    (output / "hard-negatives.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in mined))
    params = [p for p in retriever.model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=2e-5, weight_decay=0.01)
    scaler = torch.amp.GradScaler("cuda", init_scale=256)
    progress = checkpoints.restore(optimizer, scaler)
    # Keep batches within a language and bound document activations on a T4.
    batches = retrieval_batches(mined)
    print(json.dumps({"stage": "retrievalResume", "completedSteps": progress["step"],
                      "batchOrder": "canonical training-file order; one deterministic shuffle"}), flush=True)
    retriever.model.train()
    for step, batch in enumerate(batches, 1):
        if step <= progress["step"]: continue
        lang = batch[0]["lang"]
        selected = list(dict.fromkeys([id for row in batch for id in row["gold"]] + [row["negatives"][0] for row in batch]))
        q = retriever.encode([(r["q"], lang) for r in batch])
        d = retriever.encode([(doc_text(lookup[lang][id]), lang) for id in selected])
        logits = q @ d.T / 0.05
        positives = torch.tensor([[id in row["gold"] for id in selected] for row in batch], device="cuda")
        loss = (torch.logsumexp(logits, 1) - torch.logsumexp(logits.masked_fill(~positives, -1e4), 1)).mean()
        if not torch.isfinite(loss): raise ValueError("Non-finite retrieval loss")
        optimizer.zero_grad(set_to_none=True); scaler.scale(loss).backward(); scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(params, 1); scaler.step(optimizer); scaler.update()
        optimizer.zero_grad(set_to_none=True)
        if step != len(batches) and (step == 1 or checkpoints.due(step)):
            checkpoints.save(retriever.model, (optimizer, scaler), step, {"devBefore": before, "mined": mined})
        if step % 25 == 0 or step == 1:
            print(json.dumps({"stage": "retrieval", "step": step, "steps": len(batches), "loss": float(loss.detach()),
                              "seconds": round(time.monotonic() - started)}), flush=True)
    after, _ = score(retriever, docs, dev)
    export_adapter(retriever.model, output / "last")
    import shutil
    shutil.copytree(output / "last" if after >= before else root / "current-adapters/retrieval", output / "selected", dirs_exist_ok=True)
    summary = {"trainRows": len(rows), "devRows": len(dev), "epochs": 1, "devBefore": before,
               "devAfter": after, "selected": "trained" if after >= before else "current",
               "hardNegatives": "top non-gold documents in train partition only"}
    (output / "summary.json").write_text(json.dumps(summary, indent=2))
    checkpoints.save(retriever.model, (optimizer, scaler), len(batches),
                     {"devBefore": before, "mined": mined, "summary": summary})
    print(json.dumps({"stage": "retrievalComplete", **summary}), flush=True)


if __name__ == "__main__": train(sys.argv[1])
