"""방식 A: 얼린 특징 위에 kev 의 PointerHead 만 학습한다. 헤드는 1024→256 선형 두 개와 내적."""
import math, sys, json, numpy as np, torch, torch.nn as nn
import os as _o; torch.manual_seed(int(_o.environ.get("SEED", "0")))

class PointerHead(nn.Module):
    def __init__(self, d, dp=256):
        super().__init__(); self.q, self.k = nn.Linear(d, dp), nn.Linear(d, dp); self.scale = 1 / math.sqrt(dp)
    def forward(self, hd, ho): return (self.k(ho) @ self.q(hd)) * self.scale

def load(p): return list(np.load(p, allow_pickle=True))
import os
P = os.environ.get("FEAT", "feat")
OUT = os.environ.get("OUT", "head_route_A.pt")
train, dev, test = load(f"{P}_train.npy"), load(f"{P}_dev.npy"), load(f"{P}_test.npy")
# 은닉 상태는 층 정규화 뒤라 크기가 제각각이다. 학습 자료로 잰 평균·표준편차로 맞춘다.
allv = np.concatenate([np.stack([r["decide"] for r in train]), np.concatenate([r["opts"] for r in train])])
mu, sd = allv.mean(0), allv.std(0) + 1e-6
T = lambda x: torch.tensor((x - mu) / sd, dtype=torch.float32)

def acc(head, rows):
    head.eval(); ok = {}
    with torch.no_grad():
        for r in rows:
            p = int(head(T(r["decide"]), T(r["opts"])).argmax())
            ok.setdefault(r["qid"], []).append(p == r["label"])
    return {k: f"{sum(v)}/{len(v)}" for k, v in ok.items()}, ok

def route_score(rows, head):
    # eval-route 와 같은 잣대: 갈래가 맞고, matchup 이면 내 챔피언도 맞아야 한다. 문항 순서대로 kind 뒤에 mine 이 온다.
    head.eval(); total = right = 0; i = 0
    with torch.no_grad():
        while i < len(rows):
            r = rows[i]; assert r["qid"] == "kind"
            kind_ok = int(head(T(r["decide"]), T(r["opts"])).argmax()) == r["label"]
            mine_ok = True
            if i + 1 < len(rows) and rows[i + 1]["qid"] == "mine":
                m = rows[i + 1]; mine_ok = int(head(T(m["decide"]), T(m["opts"])).argmax()) == m["label"]; i += 1
                # 정답이 matchup 이 아니면 mine 은 따지지 않는다
                if r["label"] != 0: mine_ok = True
            total += 1; right += kind_ok and mine_ok; i += 1
    return f"{right}/{total}"

head = PointerHead(train[0]["decide"].shape[0]); opt = torch.optim.AdamW(head.parameters(), lr=float(sys.argv[1]) if len(sys.argv) > 1 else 3e-4, weight_decay=0.01)
best = (-1, None)
for epoch in range(40):
    head.train(); perm = np.random.RandomState(epoch).permutation(len(train)); loss_sum = 0
    for j in perm:
        r = train[j]; logits = head(T(r["decide"]), T(r["opts"]))
        loss = nn.functional.cross_entropy(logits[None], torch.tensor([r["label"]]))
        opt.zero_grad(); loss.backward(); opt.step(); loss_sum += float(loss)
    d = route_score(dev, head); dv = int(d.split("/")[0])
    if dv > best[0]: best = (dv, {k: v.clone() for k, v in head.state_dict().items()}, epoch)
    if epoch % 5 == 4: print(f"epoch {epoch+1} loss {loss_sum/len(train):.3f} dev {d} {acc(head, dev)[0]}", flush=True)
head.load_state_dict(best[1]); print(f"고른 epoch {best[2]+1}: dev {route_score(dev, head)} · test {route_score(test, head)} {acc(head, test)[0]}")
torch.save({"state": head.state_dict(), "mu": mu, "sd": sd}, OUT)
