"""판정 LoRA + 검색 LoRA 를 한 그래프에 실은 것(lora_onnx.py … <embed adapter>:embed_scale)을 CPU 로 대조하고, 앱에 실을 문서 벡터를 만든다.

  1 판정   새 그래프(lora 1 · embed 0) 은닉 상태 = 옛 그래프(lora 1) 은닉 상태
  2 생성   새 그래프(0 · 0) logits = 옛 그래프(0) logits
  3 검색   새 그래프(0 · 1) 요약 프롬프트 벡터 ≈ Colab 에서 만든 emb-qwen-lora-embed-onnxq4.npz (CUDA, 같은 q4)
  4 문서 벡터를 public/models/kev/<판>/doc-vectors.{json,bin} 로(언어마다 100건 × 1024 fp16)

  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \\
    python scripts/llm/vector-search/dual_graph_check.py <옛 그래프> <새 그래프> <출력 폴더>
"""
import json, os, re, sys, time
import numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
VS = os.path.join(ROOT, "research/llm-evals/vector-search")
LANGS = ["ko_KR", "en_US", "zh_CN"]
old_path, new_path, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("THREADS", 4))
old = ort.InferenceSession(old_path, so, providers=["CPUExecutionProvider"])
new = ort.InferenceSession(new_path, so, providers=["CPUExecutionProvider"])

def empty(sess):
    e = {}
    for i in sess.get_inputs():
        if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale", "embed_scale"): continue
        e[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
    return e
E_OLD, E_NEW = empty(old), empty(new)

def run(sess, ids, outs, keep, **scales):
    f = dict(E_OLD if sess is old else E_NEW)
    f["input_ids"] = np.array([ids], dtype=np.int64)
    f["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    f["num_logits_to_keep"] = np.array(keep, dtype=np.int64)
    for k, v in scales.items(): f[k] = np.array(v, dtype=np.float32)
    return sess.run(outs, f)

# 1·2 판정·생성
rows = [json.loads(l) for l in open(os.path.join(ROOT, "research/llm-evals/kev-agent/kev-act-test.jsonl"))][:8]
dj = dg = 0.0
for r in rows:
    ids = tok.encode(r["state"], add_special_tokens=False).ids[:300]
    a = run(old, ids, ["hidden"], len(ids), lora_scale=1.0)[0]
    b = run(new, ids, ["hidden"], len(ids), lora_scale=1.0, embed_scale=0.0)[0]
    dj = max(dj, float(np.abs(a - b).max()))
    a = run(old, ids, ["logits"], 1, lora_scale=0.0)[0]
    b = run(new, ids, ["logits"], 1, lora_scale=0.0, embed_scale=0.0)[0]
    dg = max(dg, float(np.abs(a - b).max()))
print(f"1 판정 은닉 상태 최대 차 {dj:.3g} · 2 생성 logits 최대 차 {dg:.3g}", flush=True)

# 3·4 검색
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}
def vec(text, lang):
    ids = tok.encode(EOL[lang].format(text), add_special_tokens=False).ids[:512]
    h = run(new, ids, ["hidden"], 1, lora_scale=0.0, embed_scale=1.0)[0][0, -1]
    return h / (np.linalg.norm(h) + 1e-9)
docs = {l: json.load(open(os.path.join(VS, f"corpus-{l}.json"))) for l in LANGS}
t0 = time.time()
dv = {l: np.stack([vec(f"{d['title']}\n{d['text'][:600]}", l) for d in docs[l]]) for l in LANGS}
print(f"문서 벡터 {time.time() - t0:.0f}초", flush=True)
queries = [json.loads(l) for l in open(os.path.join(VS, "queries.jsonl"))]
qv = np.stack([vec(q["q"], q["lang"]) for q in queries])
print(f"질문 벡터 {time.time() - t0:.0f}초", flush=True)
np.savez(os.path.join(VS, "emb-qwen-lora-embed-dual.npz"), q=qv, **{f"d_{l}": dv[l] for l in LANGS})
ref = np.load(os.path.join(VS, "emb-qwen-lora-embed-onnxq4.npz"))
cq = (qv * ref["q"]).sum(1)
cd = np.concatenate([(dv[l] * ref[f"d_{l}"]).sum(1) for l in LANGS])
print(f"3 Colab 벡터와 코사인: 질문 최소 {cq.min():.5f} 평균 {cq.mean():.5f} · 문서 최소 {cd.min():.5f}", flush=True)

# 4 앱 파일: 언어마다 [100, 1024] fp16 을 이어 붙인다. 순서는 json 의 ids.
meta = {"dim": 1024, "dtype": "float16", "languages": {}, "prompt": EOL, "docChars": 600,
        "note": "검색 LoRA(embed_scale 1, lora_scale 0)로 만든 요약 프롬프트 마지막 자리 은닉 상태, 정규화. dual_graph_check.py"}
with open(os.path.join(out_dir, "doc-vectors.bin"), "wb") as f:
    offset = 0
    for l in LANGS:
        f.write(dv[l].astype(np.float16).tobytes())
        meta["languages"][l] = {"offset": offset, "ids": [d["id"] for d in docs[l]]}
        offset += dv[l].size
json.dump(meta, open(os.path.join(out_dir, "doc-vectors.json"), "w"), ensure_ascii=False)
print("저장", out_dir, os.path.getsize(os.path.join(out_dir, "doc-vectors.bin")), "bytes")
