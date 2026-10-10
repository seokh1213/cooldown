"""하이브리드 검색 — 문서마다 벡터 코사인과 낱말 점수를 한 점수로 합쳐 순위를 매기고, 확신이 없으면 후보를 제시한다(A).

  합친 점수 = 코사인 + a · BM25(질문 안에서 1위 = 1) + b[단계] · (낱말 단계가 가리킨 문서면 1)
  답        합친 1위 ≥ τ
  후보(A)   답이 없고 합친 1위 ≥ τ_s 이면 상위 3건을 "혹시 이 자료를?" 으로

a·b·τ 는 시험 세트의 dev 절반(문서 id 로 가름)에서만 고른다. 이름 넣은 질문 22개는 퇴보 금지(21 이상). 평가는 test 절반·실제에 가까운
질문 44·이름 넣은 22. 입력: lexical_scores.ts 결과, 질문 벡터(embed_questions.py 또는 dual npz), 앱 문서 벡터.

  uv run --python 3.13 --with numpy python dev/scripts/advisor/vector-search/hybrid_score.py <scratch 폴더>
"""
import itertools, json, os, re, sys, zlib
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
VS = os.path.join(ROOT, "dev/research/llm-evals/vector-search")
S = sys.argv[1]
meta = json.load(open(os.path.join(ROOT, "public/models/kev/b3e/doc-vectors.json")))
raw = np.fromfile(os.path.join(ROOT, "public/models/kev/b3e/doc-vectors.bin"), dtype=np.float16).astype(np.float32)
BLOCK = {l: (v["ids"], raw[v["offset"]: v["offset"] + len(v["ids"]) * 1024].reshape(-1, 1024)) for l, v in meta["languages"].items()}
STEP = {"rule-name": "rule", "meta-word": "meta", "mech-word": "mech"}

def load(rows, lex, Q):
    """질문마다 (문서 id 목록, 코사인, BM25 정규화, 낱말 단계 문서·단계, 정답)"""
    out = []
    for r, x, q in zip(rows, lex, Q):
        ids, M = BLOCK[x["lang"]]
        cos = M @ q
        bm = np.array([x["bm25"].get(i, 0.0) for i in ids])
        bm = bm / bm.max() if bm.max() > 0 else bm
        lexi = np.array([i == x["lexical"] for i in ids], dtype=np.float32)
        out.append((ids, cos, bm, lexi, STEP.get(x["step"]), r["gold"], r.get("type")))
    return out

def decide(item, a, b, tau, tau_s):
    ids, cos, bm, lexi, step, gold, _ = item
    f = cos + a * bm + (b.get(step, 0.0) if step else 0.0) * lexi
    order = np.argsort(-f)
    if f[order[0]] >= tau: return ids[order[0]], None
    if f[order[0]] >= tau_s: return None, [ids[k] for k in order[:3]]
    return None, None

def score(items, a, b, tau, tau_s=9.0, mask=None):
    R = W = rescued = noisy = unsure = 0
    for n, it in enumerate(items):
        if mask is not None and not mask[n]: continue
        pick, sugg = decide(it, a, b, tau, tau_s)
        gold = it[5]
        R += (pick in gold) if gold else (pick is None)
        W += pick is not None and pick not in gold
        if pick is None and sugg is not None:
            unsure += 1
            if gold and any(g in sugg for g in gold): rescued += 1
            if not gold: noisy += 1
    return R, W, rescued, noisy, unsure

# 자료
test_rows = [json.loads(l) for l in open(os.path.join(VS, "queries.jsonl"))]
test = load(test_rows, json.load(open(f"{S}/lex-test.json")), np.load(os.path.join(VS, "emb-qwen-lora-embed-dual.npz"))["q"])
dev = np.array([zlib.crc32((r["gold"][0] if r["gold"] else r["q"]).encode()) % 2 == 0 for r in test_rows])
real_rows = [json.loads(l) for l in open(os.path.join(VS, "real-other.jsonl"))]
real = load(real_rows, json.load(open(f"{S}/lex-real.json")), np.fromfile(f"{S}/emb-real-other.f32", dtype=np.float32).reshape(-1, 1024))
real_mask = np.array([not r["champions"] for r in real_rows])
probe_rows = [json.loads(l) for l in open(os.path.join(VS, "direct-probe.jsonl"))]
probe = load(probe_rows, json.load(open(f"{S}/lex-probe.json")), np.load(f"{S}/emb-probe.npz")["q"])

def report(name, a, b, tau, tau_s=9.0):
    t = score(test, a, b, tau, tau_s, ~dev); r = score(real, a, b, tau, tau_s, real_mask); p = score(probe, a, b, tau, tau_s)
    print(f"{name:34s} | test {t[0]}·{t[1]} 후보 살림 {t[2]} 헛후보 {t[3]} | 실제 {r[0]}·{r[1]} 살림 {r[2]} 헛 {r[3]} | 이름넣은 {p[0]}/22·{p[1]}")

# 찾기: dev 에서 (맞음 − 틀린 자료) 최대, 이름 넣은 질문 21 이상
best = None
for a, br, bm_, bx, tau in itertools.product([0, 0.05, 0.1, 0.2, 0.3], [0, 0.1, 0.2, 0.3, 0.5], [0, 0.05, 0.1, 0.2], [0, 0.05, 0.1], [0.35, 0.39, 0.43, 0.47, 0.5, 0.55]):
    b = {"rule": br, "meta": bm_, "mech": bx}
    if score(probe, a, b, tau)[0] < 21: continue
    R, W, *_ = score(test, a, b, tau, mask=dev)
    key = R - W
    if best is None or key > best[0]: best = (key, a, b, tau)
_, A, B, TAU = best
print(f"dev 에서 고른 값: a={A} b={B} τ={TAU}")
report("벡터만(τ 0.39)", 0, {}, 0.39)
report("하이브리드 점수", A, B, TAU)
for ts in (0.25, 0.3, 0.33, 0.36):
    report(f"  + 후보 제시(τ_s {ts})", A, B, TAU, ts)
json.dump({"a": A, "b": B, "tau": TAU}, open(f"{S}/hybrid-params.json", "w"))
