"""이름 없는 질문의 자료 찾기 — 판마다 점수를 낸다.

  python3 scripts/llm/vector-search/score.py

판
  current          지금 앱(낱말: 룬·주문 이름 → 게임 메타 낱말 → 게임 원리 낱말 → 낱말 검색)
  <벡터>           질문과 같은 언어 문서 100건 중 코사인 1위. 문턱 밑이면 "자료 없음"
  current+<벡터>   지금 앱이 못 찾았을 때만 벡터(문턱 적용)

잣대
  R@1·R@3   답이 있는 질문에서 정답 문서가 1위·3위 안
  맞음      사용자가 보는 것이 맞았나: 답이 있으면 정답 문서를 보였고, 답이 없으면 아무것도 안 보였다
  오답 노출  잘못된 문서를 보인 비율(답 없는 질문에 문서를 보인 것 포함) — 틀린 자료를 보이는 것이 가장 해롭다
문턱은 절반(dev, 문서 id 로 가름)에서 고르고 나머지 절반(test)에서 잰다.
"""
import glob, json, os, zlib
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "research/llm-evals/vector-search")
LANGS = ["ko_KR", "en_US", "zh_CN"]
docs = {l: json.load(open(os.path.join(OUT, f"corpus-{l}.json"))) for l in LANGS}
ids = {l: [d["id"] for d in docs[l]] for l in LANGS}
rows = json.load(open(os.path.join(OUT, "current.json")))
N = len(rows)
dev = np.array([zlib.crc32((r["gold"][0] if r["gold"] else r["q"]).encode()) % 2 == 0 for r in rows])
pos = np.array([bool(r["gold"]) for r in rows])

def outcome(pred):
    """pred: 문서 id 또는 None. → (맞음, 오답 노출)"""
    right = np.array([(p in r["gold"]) if r["gold"] else p is None for p, r in zip(pred, rows)])
    wrong = np.array([p is not None and p not in r["gold"] for p, r in zip(pred, rows)])
    return right, wrong

def vector_preds(npz, center, cross=False):
    """cross: 질문 언어 문서만이 아니라 세 언어 문서를 다 보고 문서마다 가장 가까운 것을 쓴다(중국어 규칙 본문이 영어라)."""
    z = np.load(npz)
    q = z["q"].copy()
    top, score, r1, r3 = [None] * N, np.zeros(N), np.zeros(N, bool), np.zeros(N, bool)
    allmu = np.concatenate([z[f"d_{l}"] for l in LANGS]).mean(0)
    for l in LANGS:
        mu = allmu if cross else z[f"d_{l}"].mean(0)
        def prep(d):
            d = d.copy()
            if center:
                d = d - mu; d /= np.linalg.norm(d, axis=1, keepdims=True)
            return d
        mats = [prep(z[f"d_{k}"]) for k in (LANGS if cross else [l])]
        for i, r in enumerate(rows):
            if r["lang"] != l: continue
            v = q[i] - mu if center else q[i]
            v = v / np.linalg.norm(v)
            s = np.max(np.stack([m @ v for m in mats]), axis=0)
            order = np.argsort(-s)
            top[i] = ids[l][order[0]]; score[i] = s[order[0]]
            r1[i] = top[i] in r["gold"]; r3[i] = any(ids[l][k] in r["gold"] for k in order[:3])
    return top, score, r1, r3

CUR_WRONG = None

def best_threshold(top, score, base=None, mask=dev, strict=False):
    """dev 에서 맞음이 가장 큰 문턱. strict: 오답 노출이 지금 앱(dev)보다 늘지 않는 문턱 중에서."""
    cands = np.unique(np.round(score, 3))
    best = (-1, float(cands.max()) + 1)
    for t in cands:
        pred = [tp if s >= t else None for tp, s in zip(top, score)]
        if base is not None: pred = [b if b is not None else p for b, p in zip(base, pred)]
        right, wrong = outcome(pred)
        if strict and wrong[mask].mean() > CUR_WRONG + 1e-9: continue
        acc = right[mask].mean()
        if acc > best[0]: best = (acc, t)
    return best[1]

def line(name, pred, r1=None, r3=None):
    right, wrong = outcome(pred)
    test = ~dev
    by = {l: right[test & np.array([r["lang"] == l for r in rows])].mean() for l in LANGS}
    types = {t: right[test & np.array([r["type"] == t for r in rows])].mean() for t in ("paraphrase", "direct", "negative")}
    rr = f"{r1[pos].mean():.2f} {r3[pos].mean():.2f}" if r1 is not None else "  —    — "
    print(f"{name:28s} R@1·3 {rr} | 맞음(test) {right[test].mean():.3f} 오답노출 {wrong[test].mean():.3f} | "
          + " ".join(f"{l[:2]} {v:.2f}" for l, v in by.items()) + " | " + " ".join(f"{t[:4]} {v:.2f}" for t, v in types.items()))
    return right[test].mean()

current = [r["current"] for r in rows]
CUR_WRONG = outcome(current)[1][dev].mean()
print(f"질문 {N}(dev {dev.sum()} · test {(~dev).sum()}), 답 있는 질문 {pos.sum()}")
print("·c 중심 빼기 · ·x 세 언어 문서 · [엄격] 오답 노출이 지금 앱보다 늘지 않는 문턱")
line("current", current)
import sys
only = sys.argv[1] if len(sys.argv) > 1 else ""
for npz in sorted(glob.glob(os.path.join(OUT, "emb-*.npz"))):
    name = os.path.basename(npz)[4:-4]
    if only not in name: continue
    for center in (False, True):
        for cross in (False, True):
            tag = name + ("·c" if center else "") + ("·x" if cross else "")
            top, score, r1, r3 = vector_preds(npz, center, cross)
            t = best_threshold(top, score)
            line(tag, [tp if s >= t else None for tp, s in zip(top, score)], r1, r3)
            for strict in (False, True):
                th = best_threshold(top, score, base=current, strict=strict)
                line(("[엄격] " if strict else "") + "current+" + tag, [c if c is not None else (tp if s >= th else None) for c, tp, s in zip(current, top, score)])
