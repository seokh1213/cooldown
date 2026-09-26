"""재순위 헤드의 특징 — 질문 + 후보 K 건 + "해당 없음" 을 kev 선택지 꼴로 넣고, 선택지 끝(</opt>)과 <decide> 의 은닉 상태를 꺼낸다.

후보: candidates.ts 의 코드 후보(낱말·은어·BM25) + 0.8B 요약 프롬프트 벡터 상위 EXTRA 건(LoRA 끔, 앱이 받는 그래프 그대로).
은닉 상태: LoRA 켬(kev 판정과 같은 그래프·같은 계산). 한 번에 넣고 자리만 고른다(끊어 넣기와 결과가 같다 — 인과 마스크).

  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \\
    python scripts/llm/vector-search/rerank_features.py <그래프.onnx> <후보.json> <출력.npz>
"""
import json, os, re, sys, time
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "research/llm-evals/vector-search")
LANGS = ["ko_KR", "en_US", "zh_CN"]
EXTRA = 2
MAX_OPTS = 10
graph, src, dst = sys.argv[1:4]

tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
SPECIAL = ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]
S_ID, Q_ID, O_ID, C_ID, D_ID = (tok.token_to_id(t) for t in SPECIAL)
_SPECIAL_RE = re.compile(r"<\|([A-Za-z0-9_]+)\|>")
enc = lambda text: tok.encode(_SPECIAL_RE.sub(r"<¦\1¦>", text), add_special_tokens=False).ids

so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("THREADS", 6))
sess = ort.InferenceSession(graph, so, providers=["CPUExecutionProvider"])
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)

def hidden(ids, lora):
    feeds = dict(EMPTY)
    feeds["input_ids"] = np.array([ids], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    feeds["num_logits_to_keep"] = np.array(len(ids), dtype=np.int64)
    feeds["lora_scale"] = np.array(lora, dtype=np.float32)
    return sess.run(["hidden"], feeds)[0][0]

docs = {l: json.load(open(os.path.join(OUT, f"corpus-{l}.json"))) for l in LANGS}
by_id = {l: {d["id"]: d for d in docs[l]} for l in LANGS}
emb = np.load(os.path.join(OUT, "emb-qwen-eol-lora0.npz"))
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}

def summary(doc):
    first = re.split(r"(?<=[.。!?])\s|\n", doc["text"].strip(), maxsplit=1)[0]
    first = re.sub(r"[*#|`>-]+", " ", first).strip()
    return f"{doc['title']}: {first[:60]}"

INSTR = "질문의 답이 들어 있는 자료를 고르세요. 어느 자료에도 답이 없으면 '해당 없음'을 고르세요."
NONE = "해당 없음: 위 자료 어디에도 답이 없다"

rows = json.load(open(src))
feats = np.zeros((len(rows), MAX_OPTS + 2, 1024), dtype=np.float16)  # 선택지 MAX_OPTS + 해당 없음 + decide
nopt = np.zeros(len(rows), dtype=np.int16)
label = np.zeros(len(rows), dtype=np.int16)
cands_out = []
t0 = time.time()
for n, r in enumerate(rows):
    lang = r["lang"]
    q = hidden(enc(EOL[lang].format(r["q"])), 0.0)[-1]
    q = q / np.linalg.norm(q)
    order = np.argsort(-(emb[f"d_{lang}"] @ q))
    cands = list(r["cands"])
    added = 0
    for k in order:
        if added >= EXTRA or len(cands) >= MAX_OPTS: break
        cid = docs[lang][k]["id"]
        if cid not in cands: cands.append(cid); added += 1
    cands = cands[:MAX_OPTS]
    ids = [S_ID] + enc(f"질문: {r['q']}") + [Q_ID] + enc(INSTR)
    ends = []
    for cid in cands + [None]:
        ids += [O_ID] + enc(summary(by_id[lang][cid]) if cid else NONE) + [C_ID]
        ends.append(len(ids) - 1)
    ids.append(D_ID)
    h = hidden(ids, 1.0)
    k = len(cands)
    feats[n, : k + 1] = h[ends]
    feats[n, -1] = h[-1]
    nopt[n] = k
    gold = next((i for i, c in enumerate(cands) if c in r["gold"]), k)  # 없으면 "해당 없음"
    label[n] = gold
    cands_out.append(cands)
    if n % int(os.environ.get("EVERY", 100)) == 0: print(n, f"{time.time() - t0:.0f}초", len(ids), "토큰", flush=True)
np.savez(dst, feats=feats, nopt=nopt, label=label)
json.dump(cands_out, open(dst.replace(".npz", "-cands.json"), "w"), ensure_ascii=False)
print("저장", dst, feats.shape, f"{time.time() - t0:.0f}초")
