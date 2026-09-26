"""이름 없는 질문의 자료 찾기 — 문서·질문 벡터를 만든다(로컬 CPU, 학습 없음).

  qwen   앱이 이미 받는 Qwen3.5-0.8B q4 + kev LoRA 그래프(public/models/kev/b3-v2)의 `hidden` 출력.
         모으는 방식 mean(평균) · last(마지막 토큰) · eol(요약 프롬프트의 마지막 토큰), lora_scale 0·1
  e5     전용 임베딩 모델 intfloat/multilingual-e5-small (브라우저 판은 Xenova q8 ≈ 120MB)

  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \\
    python scripts/llm/vector-search/embed.py qwen <그래프.onnx>
  uv run --python 3.13 --with sentence-transformers --with numpy python scripts/llm/vector-search/embed.py e5

결과: research/llm-evals/vector-search/emb-<판>.npz (문서 d_<언어>, 질문 q, 질문 순서는 queries.jsonl 순서)
"""
import json, os, sys, time
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "research/llm-evals/vector-search")
LANGS = ["ko_KR", "en_US", "zh_CN"]
DOC_CHARS = 600

docs = {l: json.load(open(os.path.join(OUT, f"corpus-{l}.json"))) for l in LANGS}
queries = [json.loads(line) for line in open(os.path.join(OUT, "queries.jsonl"))]
doc_text = lambda d: f"{d['title']}\n{d['text'][:DOC_CHARS]}"

def save(name, qv, dv):
    np.savez(os.path.join(OUT, f"emb-{name}.npz"), q=qv, **{f"d_{l}": v for l, v in dv.items()})
    print("저장", name, qv.shape, flush=True)

which = sys.argv[1]
if which == "e5":
    from sentence_transformers import SentenceTransformer
    m = SentenceTransformer("intfloat/multilingual-e5-small")
    t0 = time.time()
    dv = {l: m.encode([f"passage: {doc_text(d)}" for d in docs[l]], normalize_embeddings=True, batch_size=16) for l in LANGS}
    qv = m.encode([f"query: {q['q']}" for q in queries], normalize_embeddings=True, batch_size=32)
    print(f"e5 {time.time() - t0:.0f}초")
    save("e5", qv, dv)
    sys.exit()

import onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

graph = sys.argv[2]
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
so = ort.SessionOptions(); so.intra_op_num_threads = 6
sess = ort.InferenceSession(graph, so, providers=["CPUExecutionProvider"])
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)

# 요약 프롬프트: 디코더 모델의 문장 벡터는 "한 낱말로 줄이면" 뒤 마지막 토큰이 평균보다 낫다는 보고가 있다(PromptEOL)
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}

def hidden(text, lora):
    ids = tok.encode(text, add_special_tokens=False).ids[:384]
    feeds = dict(EMPTY)
    feeds["input_ids"] = np.array([ids], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    # 토큰 수만큼 주면 `hidden` 이 모든 자리를 돌려준다(1 이면 마지막 자리만)
    feeds["num_logits_to_keep"] = np.array(len(ids), dtype=np.int64)
    feeds["lora_scale"] = np.array(lora, dtype=np.float32)
    return sess.run(["hidden"], feeds)[0][0]  # [seq, 1024]

def norm(v): return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)

for lora in (0.0, 1.0):
    t0 = time.time()
    out = {k: {"q": [], **{l: [] for l in LANGS}} for k in ("mean", "last", "eol")}
    def add(slot, text, lang):
        h = hidden(text, lora)
        out["mean"][slot].append(h.mean(0)); out["last"][slot].append(h[-1])
        out["eol"][slot].append(hidden(EOL[lang].format(text), lora)[-1])
    for l in LANGS:
        for d in docs[l]: add(l, doc_text(d), l)
        print(f"lora {lora} 문서 {l} {time.time() - t0:.0f}초", flush=True)
    for n, q in enumerate(queries):
        add("q", q["q"], q["lang"])
        if n % 100 == 0: print(f"lora {lora} 질문 {n} {time.time() - t0:.0f}초", flush=True)
    for pool, v in out.items():
        save(f"qwen-{pool}-lora{int(lora)}", norm(np.array(v["q"])), {l: norm(np.array(v[l])) for l in LANGS})
