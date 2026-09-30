"""kev 판정 헤드(PointerHead: q·k 선형층 1024→256)를 추출한 특징 위에서 이어 배운다. LoRA 본체는 그대로.

앱의 `scoreJudge` 와 같은 계산이다: query = Wq·h(decide)+bq, key = Wk·h(</opt>)+bk, logit = key·query / √256 / T, softmax.
기존 헤드(kev-b3e.bin)에서 시작해 작은 학습률로 이어 배우므로 갈래·주제 판정은 거의 그대로 두고 새 칸(lookup)만 익힌다.

  uv run --python 3.13 --with torch --with numpy python train_head.py <feats-dir> <feats-dev-dir> <init.bin> <init.json> <out-prefix>
      [--epochs 4] [--lr 5e-5] [--anchor 1.0] [--upweight-lookup 1]

  anchor: 처음 가중치에서 멀어지는 것에 대한 벌점(L2). 갈래·주제를 잃지 않게 붙든다.
"""
import glob, json, os, sys
import numpy as np, torch

def arg(name, default):
    return type(default)(sys.argv[sys.argv.index(f"--{name}") + 1]) if f"--{name}" in sys.argv else default

train_dir, dev_dir, init_bin, init_json, out = sys.argv[1:6]
EPOCHS, LR, ANCHOR = arg("epochs", 4), arg("lr", 5e-5), arg("anchor", 1.0)
meta = json.load(open(init_json))
DIM, P, T = meta["dim"], meta["pointer"], float(meta.get("temperature", 1.0) or 1.0)

def load(d):
    samples = []
    for f in sorted(glob.glob(os.path.join(d, "*.npz"))):
        z = np.load(f)
        feats, off, labels, task = z["feats"].astype(np.float32), z["offsets"], z["labels"], z["task"]
        rowid = z["rowid"] if "rowid" in z else np.arange(len(labels))
        for i in range(len(labels)):
            h = feats[off[i]:off[i + 1]]
            samples.append((torch.from_numpy(h[:-1]), torch.from_numpy(h[-1]), int(labels[i]), str(task[i]), int(rowid[i])))
    return samples

train, dev = load(train_dir), load(dev_dir)
# lookup 행을 몇 배로 더 본다. 대조 행(룬 쿨타임·게임 규칙 → new)을 넣으면 "W 쿨타임 알려줘" 같은 맨 조회가 new 로 밀렸다.
UP = arg("upweight-lookup", 1)
if UP > 1: train = train + [s for s in train if s[3] == "act" and s[2] == 6] * (UP - 1)
print(f"train {len(train)} dev {len(dev)}", flush=True)

raw = np.fromfile(init_bin, dtype=np.float32)
qW = torch.from_numpy(raw[: P * DIM].reshape(P, DIM).copy()); qb = torch.from_numpy(raw[P * DIM: P * DIM + P].copy())
kW = torch.from_numpy(raw[P * DIM + P: 2 * P * DIM + P].reshape(P, DIM).copy()); kb = torch.from_numpy(raw[2 * P * DIM + P:].copy())
assert raw.size == 2 * P * DIM + 2 * P, raw.size
init = [t.clone() for t in (qW, qb, kW, kb)]
params = [torch.nn.Parameter(t) for t in (qW, qb, kW, kb)]
opt = torch.optim.AdamW(params, lr=LR, weight_decay=0.0)
scale = 1 / np.sqrt(P) / T

def logits_of(opts, decide):
    q = decide @ params[0].T + params[1]
    k = opts @ params[2].T + params[3]
    return (k @ q) * scale

def evaluate(samples):
    hit, n = {}, {}
    with torch.no_grad():
        for opts, decide, label, task, rowid in samples:
            key = task if not (task == "act" and rowid < 81) else "act:lookup-dev"
            ok = int(logits_of(opts, decide).argmax().item() == label)
            hit[key] = hit.get(key, 0) + ok; n[key] = n.get(key, 0) + 1
            if task == "act" and label == 6:
                hit["act:label=lookup"] = hit.get("act:label=lookup", 0) + ok; n["act:label=lookup"] = n.get("act:label=lookup", 0) + 1
    return {k: f"{hit[k]}/{n[k]}" for k in sorted(n)}

print("before:", evaluate(dev), flush=True)
rng = np.random.default_rng(0)
for epoch in range(EPOCHS):
    order = rng.permutation(len(train)); total = 0.0
    for start in range(0, len(order), 32):
        loss = 0.0
        for i in order[start:start + 32]:
            opts, decide, label, _, _ = train[i]
            loss = loss + torch.nn.functional.cross_entropy(logits_of(opts, decide)[None], torch.tensor([label]))
        loss = loss / min(32, len(order) - start)
        if ANCHOR > 0:
            loss = loss + ANCHOR * sum(((p - p0) ** 2).sum() for p, p0 in zip(params, init))
        opt.zero_grad(); loss.backward(); opt.step(); total += loss.item()
    print(f"epoch {epoch + 1} loss {total / (len(order) / 32):.4f} dev {evaluate(dev)}", flush=True)

with open(out + ".bin", "wb") as f:
    for p in params: f.write(np.ascontiguousarray(p.detach().numpy(), dtype=np.float32).tobytes())
meta = {**meta, "name": os.path.basename(out), "trainedOn": meta.get("trainedOn", "") + f" ← 헤드만 이어 배움(lookup 칸 추가, epochs {EPOCHS} lr {LR} anchor {ANCHOR})"}
json.dump(meta, open(out + ".json", "w"), ensure_ascii=False)
print("→", out)
