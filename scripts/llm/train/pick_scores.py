"""원자 선별 헤드로 평가 칸의 후보마다 확률을 매긴다

입력: atom-pick-eval-records.ts 가 지은 JSONL(_meta 에 문항·칸·후보 문장), 그 특징 npy
(features_chunked.py, 같은 순서), 학습한 헤드(judge/train_head.py 가 저장한 .pt).
출력: {문항 id: {칸: {후보 문장: 확률}}} — eval-connector 의 atoms-kev 판이 확률 순으로 고른다.

    python pick_scores.py records.jsonl features.npy head.pt out.json
"""
import json
import math
import sys

import numpy as np
import torch
import torch.nn as nn


class PointerHead(nn.Module):
    def __init__(self, d, dp=256):
        super().__init__()
        self.q, self.k = nn.Linear(d, dp), nn.Linear(d, dp)
        self.scale = 1 / math.sqrt(dp)

    def forward(self, hd, ho):
        return (self.k(ho) @ self.q(hd)) * self.scale


records_path, feat_path, head_path, out_path = sys.argv[1:5]
records = [json.loads(line) for line in open(records_path)]
feats = list(np.load(feat_path, allow_pickle=True))
ckpt = torch.load(head_path, weights_only=False)
head = PointerHead(feats[0]["decide"].shape[0])
head.load_state_dict(ckpt["state"])
head.eval()
mu, sd = ckpt["mu"], ckpt["sd"]
T = lambda x: torch.tensor((x - mu) / sd, dtype=torch.float32)

out: dict = {}
assert len(records) == len(feats), (len(records), len(feats))
with torch.no_grad():
    for rec, f in zip(records, feats):
        probs = torch.softmax(head(T(f["decide"]), T(f["opts"])), -1).tolist()
        meta = rec["_meta"]
        out.setdefault(meta["item"], {})[meta["section"]] = dict(zip(meta["texts"], probs))
json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
print(f"{len(records)}칸 → {out_path}")
