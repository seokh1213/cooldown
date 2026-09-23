"""원자 선별 헤드 교차검증 — 자료가 적어(103칸) dev 10칸으로는 판단이 흔들린다

학습 자료(train+dev)를 합쳐 5겹으로 나누고, 겹마다 PointerHead 를 학습해 나머지를 맞힌다.
견줄 기준: 늘 첫 후보(규칙 순서 1위)를 고르는 것. 헤드가 이것을 넘어야 쓸 까닭이 있다.
마지막에 전체로 한 번 학습해 헤드를 저장한다(평가 30문항에 쓴다).

    python pick_cv.py <특징 디렉터리> <저장할 헤드.pt>
"""
import math
import sys

import numpy as np
import torch
import torch.nn as nn

torch.manual_seed(0)
feat_dir, out = sys.argv[1], sys.argv[2]
rows = list(np.load(f"{feat_dir}/pick_train.npy", allow_pickle=True)) + list(np.load(f"{feat_dir}/pick_dev.npy", allow_pickle=True))


class PointerHead(nn.Module):
    def __init__(self, d, dp=256):
        super().__init__()
        self.q, self.k = nn.Linear(d, dp), nn.Linear(d, dp)
        self.scale = 1 / math.sqrt(dp)

    def forward(self, hd, ho):
        return (self.k(ho) @ self.q(hd)) * self.scale


def fit(train, epochs=30, lr=1e-4):
    allv = np.concatenate([np.stack([r["decide"] for r in train]), np.concatenate([r["opts"] for r in train])])
    mu, sd = allv.mean(0), allv.std(0) + 1e-6
    T = lambda x: torch.tensor((x - mu) / sd, dtype=torch.float32)
    head = PointerHead(train[0]["decide"].shape[0])
    opt = torch.optim.AdamW(head.parameters(), lr=lr, weight_decay=0.01)
    for epoch in range(epochs):
        head.train()
        for j in np.random.RandomState(epoch).permutation(len(train)):
            r = train[j]
            loss = nn.functional.cross_entropy(head(T(r["decide"]), T(r["opts"]))[None], torch.tensor([r["label"]]))
            opt.zero_grad()
            loss.backward()
            opt.step()
    head.eval()
    return head, mu, sd, T


folds = 5
order = np.random.RandomState(1).permutation(len(rows))
hits = {"head": 0, "first": 0, "top2": 0}
for k in range(folds):
    test_idx = set(order[k::folds])
    train = [r for i, r in enumerate(rows) if i not in test_idx]
    test = [r for i, r in enumerate(rows) if i in test_idx]
    head, _, _, T = fit(train)
    with torch.no_grad():
        for r in test:
            scores = head(T(r["decide"]), T(r["opts"]))
            ranked = scores.argsort(descending=True).tolist()
            hits["head"] += ranked[0] == r["label"]
            hits["top2"] += r["label"] in ranked[:2]
            hits["first"] += r["label"] == 0
n = len(rows)
print(f"칸 {n} · 1순위 적중 — 헤드 {hits['head']}/{n} ({100 * hits['head'] / n:.0f}%) · 규칙 첫 후보 {hits['first']}/{n} ({100 * hits['first'] / n:.0f}%) · 헤드 상위2 안 {hits['top2']}/{n}")
head, mu, sd, _ = fit(rows)
torch.save({"state": head.state_dict(), "mu": mu, "sd": sd}, out)
print(f"저장 {out}")
