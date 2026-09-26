"""재순위 헤드 학습·평가 — kev PointerHead(q·k 1024→256)만 배운다. LoRA·그래프는 그대로(앱 판정과 같은 은닉 상태).

  uv run --python 3.13 --with torch --with numpy python scripts/llm/vector-search/rerank_train.py <학습.npz> <시험.npz> <kev head.pt> [출력 head.pt]

평가(시험 720문항, queries.jsonl 과 같은 순서): 헤드가 고른 후보(또는 해당 없음)를 보였을 때
  맞음 = 답이 있으면 정답 문서, 없으면 아무것도 안 보임 / 틀린 자료 = 틀린 문서를 보임.
"확신 문턱": 가장 높은 확률이 문턱 밑이면 "해당 없음". 문턱은 학습 자료에서 뗀 검증분에서 고른다(시험은 보지 않는다).
"""
import json, os, sys, zlib
import numpy as np, torch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "research/llm-evals/vector-search")
train_path, test_path, head_path = sys.argv[1:4]
save_path = sys.argv[4] if len(sys.argv) > 4 else None
torch.manual_seed(0)

def load(path):
    z = np.load(path)
    return torch.tensor(z["feats"].astype(np.float32)), torch.tensor(z["nopt"].astype(np.int64)), torch.tensor(z["label"].astype(np.int64)), json.load(open(path.replace(".npz", "-cands.json")))

class Head(torch.nn.Module):
    def __init__(self, st, T):
        super().__init__()
        self.q = torch.nn.Linear(1024, 256); self.k = torch.nn.Linear(1024, 256)
        self.q.load_state_dict({"weight": st["q.weight"].float(), "bias": st["q.bias"].float()})
        self.k.load_state_dict({"weight": st["k.weight"].float(), "bias": st["k.bias"].float()})
        self.T = T
    def forward(self, feats, nopt):
        qv = self.q(feats[:, -1])                       # <decide>
        kv = self.k(feats[:, :-1])                      # 선택지 + 해당 없음
        z = (kv @ qv.unsqueeze(-1)).squeeze(-1) / (256 ** 0.5) / self.T
        idx = torch.arange(z.shape[1]).unsqueeze(0)
        return z.masked_fill(idx > nopt.unsqueeze(1), -1e9)   # 0..nopt 까지(nopt 번째가 해당 없음)

ck = torch.load(head_path, map_location="cpu", weights_only=False)
st = {k.split("head.")[-1]: v for k, v in (ck["head"] if "head" in ck else ck).items()}
T = float(ck.get("temperature", 1.0) or 1.0)

Xtr, Ntr, Ytr, Ctr = load(train_path)
Xte, Nte, Yte, Cte = load(test_path)
rows = [json.loads(l) for l in open(os.path.join(OUT, "queries.jsonl"))]
current = [r["current"] for r in json.load(open(os.path.join(OUT, "current.json")))]
test_half = np.array([zlib.crc32((r["gold"][0] if r["gold"] else r["q"]).encode()) % 2 == 1 for r in rows])

def picks(head, X, N, C, tau=0.0):
    with torch.no_grad():
        p = torch.softmax(head(X, N), -1).numpy()
    out = []
    for i in range(len(C)):
        j = int(p[i].argmax())
        out.append(None if j >= int(N[i]) or p[i, j] < tau else C[i][j])
    return out, p

def score(pred, mask=None):
    mask = np.ones(len(rows), bool) if mask is None else mask
    right = np.array([(p in r["gold"]) if r["gold"] else p is None for p, r in zip(pred, rows)])
    wrong = np.array([p is not None and p not in r["gold"] for p, r in zip(pred, rows)])
    para = np.array([r["type"] == "paraphrase" for r in rows])
    return f"맞음 {right[mask].sum()}/{mask.sum()} · 틀린 자료 {wrong[mask].sum()} · 바꿔 말하기 {right[mask & para].sum()}/{(mask & para).sum()}"

def best_tau(head, X, N, Y):
    with torch.no_grad():
        p = torch.softmax(head(X, N), -1).numpy()
    best = (-1, 0.0)
    for tau in np.linspace(0, 0.95, 20):
        right = 0
        for i in range(len(Y)):
            j = int(p[i].argmax())
            j = int(N[i]) if p[i, j] < tau else j
            right += j == int(Y[i])
        if right > best[0]: best = (right, float(tau))
    return best[1]

print("지금 앱          ", score(current), "| test 절반", score(current, test_half))
head0 = Head(st, T)
pred0, _ = picks(head0, Xte, Nte, Cte)
print("kev 헤드 그대로(0-shot)", score(pred0), "| test 절반", score(pred0, test_half))

# 학습: 학습 자료의 10% 를 검증으로 떼어 에폭·문턱을 고른다. 씨앗 SEEDS 개를 배워 확률을 평균한다(틀린 자료 수가 씨앗마다 31~63 으로 흔들렸다).
SEEDS = int(os.environ.get("SEEDS", 5))
PENALTY = float(os.environ.get("PENALTY", 2.0))
perm = torch.randperm(len(Ytr))
val, tr = perm[: len(perm) // 10], perm[len(perm) // 10 :]
heads = []
for seed in range(SEEDS):
    torch.manual_seed(100 + seed)
    head = Head(st, T)
    opt = torch.optim.AdamW(head.parameters(), lr=3e-4, weight_decay=0.01)
    best = (-1, None, 0)
    for epoch in range(40):
        head.train()
        for b in torch.split(tr[torch.randperm(len(tr))], 64):
            loss = torch.nn.functional.cross_entropy(head(Xtr[b], Ntr[b]), Ytr[b])
            opt.zero_grad(); loss.backward(); opt.step()
        head.eval()
        with torch.no_grad():
            acc = (head(Xtr[val], Ntr[val]).argmax(-1) == Ytr[val]).float().mean().item()
        if acc > best[0]: best = (acc, {k: v.clone() for k, v in head.state_dict().items()}, epoch)
    head.load_state_dict(best[1]); head.eval()
    heads.append(head)
    print(f"씨앗 {seed}: 검증 정확도 {best[0]:.3f} (에폭 {best[2]})")

def probs(X, N):
    with torch.no_grad():
        return torch.stack([torch.softmax(h(X, N), -1) for h in heads]).mean(0).numpy()

def decide(p, N, tau):
    out = []
    for i in range(len(p)):
        j = int(p[i].argmax())
        out.append(int(N[i]) if p[i, j] < tau else j)   # N[i] 번째 = 해당 없음
    return out

# 문턱: 검증에서 (맞음 − PENALTY × 틀린 자료) 가 가장 큰 값. 틀린 자료를 보이는 것이 가장 해롭다.
pv = probs(Xtr[val], Ntr[val])
best_tau = (-1e9, 0.0)
for tau in np.linspace(0, 0.95, 39):
    d = decide(pv, Ntr[val], tau)
    right = sum(int(a) == int(b) for a, b in zip(d, Ytr[val]))
    wrong = sum(int(a) != int(b) and int(a) != int(n) for a, b, n in zip(d, Ytr[val], Ntr[val]))
    if right - PENALTY * wrong > best_tau[0]: best_tau = (right - PENALTY * wrong, float(tau))
tau = best_tau[1]
pt = probs(Xte, Nte)
to_ids = lambda d: [None if j >= int(Nte[i]) else Cte[i][j] for i, j in enumerate(d)]
pred1 = to_ids(decide(pt, Nte, 0.0))
print(f"재순위 헤드(씨앗 {SEEDS} 평균)", score(pred1), "| test 절반", score(pred1, test_half))
pred2 = to_ids(decide(pt, Nte, tau))
print(f"  + 확신 문턱 {tau:.2f}      ", score(pred2), "| test 절반", score(pred2, test_half))
for lang in ["ko_KR", "en_US", "zh_CN"]:
    m = test_half & np.array([r["lang"] == lang for r in rows])
    print(f"    {lang} 지금 앱", score(current, m), "| 헤드+문턱", score(pred2, m))
if save_path:
    torch.save({"heads": [h.state_dict() for h in heads], "temperature": T, "tau": tau}, save_path)
    json.dump(pred2, open(save_path.replace(".pt", "-pred.json"), "w"), ensure_ascii=False)
    print("저장", save_path)
