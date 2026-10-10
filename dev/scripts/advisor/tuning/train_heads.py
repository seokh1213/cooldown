"""Select pointer heads on dev data, then calibrate on a separate dev subset."""
import copy
import json
from pathlib import Path
import random
import sys
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F

TASKS = {"route": {"kind", "mine"}, "topic": {"topic", "perspective"}, "act": {"act"}}


class Pointer(nn.Module):
    def __init__(self, binary, meta):
        super().__init__()
        dim, width = meta["dim"], meta["pointer"]
        raw = np.fromfile(binary, dtype=np.float32)
        self.q = nn.Linear(dim, width); self.k = nn.Linear(dim, width)
        sizes = [width * dim, width, width * dim, width]
        offset = 0
        for param, size in zip([self.q.weight, self.q.bias, self.k.weight, self.k.bias], sizes):
            param.data.copy_(torch.from_numpy(raw[offset:offset + size].reshape(param.shape).copy()))
            offset += size
        if offset != len(raw): raise ValueError("Pointer artifact size mismatch")
        self.temperature = float(meta.get("temperature", 1))
        self.scale = width ** -0.5

    def forward(self, hidden):
        return (self.k(hidden[:-1]) @ self.q(hidden[-1])) * self.scale

    def export(self, prefix, meta):
        prefix.parent.mkdir(parents=True, exist_ok=True)
        with prefix.with_suffix(".bin").open("wb") as output:
            for param in [self.q.weight, self.q.bias, self.k.weight, self.k.bias]:
                output.write(param.detach().cpu().numpy().astype(np.float32).tobytes())
        prefix.with_suffix(".json").write_text(json.dumps({**meta, "name": prefix.name,
            "temperature": self.temperature, "tuning": "head-only; dev-selected; held-out dev temperature calibration"}, ensure_ascii=False))


def samples(directory, tasks):
    result = []
    for file in sorted(Path(directory).glob("part-*.npz")):
        with np.load(file) as data:
            for i, task in enumerate(data["task"]):
                if str(task) not in tasks: continue
                hidden = data["feats"][data["offsets"][i]:data["offsets"][i + 1]].astype(np.float32)
                result.append((torch.from_numpy(hidden), int(data["labels"][i])))
    if not result: raise ValueError("Empty pointer dataset")
    return result


@torch.no_grad()
def evaluate(model, rows, temperature=1):
    logits = [model(hidden).double() / temperature for hidden, _ in rows]
    return {"accuracy": sum(int(logit.argmax()) == label for logit, (_, label) in zip(logits, rows)) / len(rows),
            "nll": float(torch.stack([F.cross_entropy(logit[None], torch.tensor([label]))
                                      for logit, (_, label) in zip(logits, rows)]).mean())}


def calibrate(model, rows):
    temperatures = np.geomspace(0.5, 4, 31)
    return float(min(temperatures, key=lambda t: evaluate(model, rows, float(t))["nll"]))


def train_one(config):
    feature_dir, heads, output, family = config
    prefix = "kev-b3e-" + family
    meta = json.loads((heads / (prefix + ".json")).read_text())
    initial = Pointer(heads / (prefix + ".bin"), meta)
    train = samples(feature_dir / "head-train", TASKS[family])
    dev = samples(feature_dir / "head-dev", TASKS[family])
    select, calibration = dev[::2], dev[1::2]
    baseline = evaluate(initial, select, initial.temperature)
    best = copy.deepcopy(initial); best_score = baseline; history = []
    for rate in [1e-5, 3e-5]:
        model = copy.deepcopy(initial); anchors = [p.detach().clone() for p in initial.parameters()]
        optimizer = torch.optim.AdamW(model.parameters(), lr=rate, weight_decay=0)
        rng = random.Random(20261005)
        for epoch in range(4):
            indices = list(range(len(train))); rng.shuffle(indices)
            for start in range(0, len(indices), 32):
                batch = [train[i] for i in indices[start:start + 32]]
                loss = torch.stack([F.cross_entropy(model(hidden)[None], torch.tensor([label])) for hidden, label in batch]).mean()
                loss += 0.01 * sum(((param - anchor) ** 2).sum() for param, anchor in zip(model.parameters(), anchors))
                optimizer.zero_grad(); loss.backward(); optimizer.step()
            score = evaluate(model, select)
            history.append({"lr": rate, "epoch": epoch + 1, **score})
            if (score["accuracy"], -score["nll"]) > (best_score["accuracy"], -best_score["nll"]):
                best, best_score = copy.deepcopy(model), score
    best.temperature = calibrate(best, calibration)
    best.export(output / prefix, meta)
    result = {"family": family, "train": len(train), "selection": len(select), "calibration": len(calibration),
              "before": baseline, "selected": best_score, "temperature": best.temperature,
              "calibrated": evaluate(best, calibration, best.temperature), "history": history}
    print(json.dumps({k: v for k, v in result.items() if k != "history"}), flush=True)
    return result


def main(features, heads, output):
    torch.set_num_threads(4); torch.manual_seed(20261005)
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    results = [train_one((Path(features), Path(heads), output, family)) for family in TASKS]
    (output / "training.json").write_text(json.dumps(results, indent=2))


if __name__ == "__main__": main(*sys.argv[1:4])
