"""학습된 embed LoRA 를 앱과 같은 q4 ONNX 그래프(lora_onnx.py)에 덧붙여 ORT CUDA 로 벡터를 만든다.
  python embed_lora_onnx.py <adapter 폴더> <pool>   (Colab, /content/lora_onnx.py = scripts/llm/kev-agent/b3/lora_onnx.py)
출력 /content/onnx/emb-onnx-lora{0,1}.npz, 그래프 크기 출력
"""
import json, os, subprocess, sys, time
import numpy as np
adapter, pool = sys.argv[1], sys.argv[2]
subprocess.run('pip install -q onnx safetensors "onnxruntime-gpu[cuda,cudnn]" 2>&1 | tail -1', shell=True)
from huggingface_hub import hf_hub_download
R = "onnx-community/Qwen3.5-0.8B-Text-ONNX"
src = hf_hub_download(R, "onnx/model_q4.onnx"); data = hf_hub_download(R, "onnx/model_q4.onnx_data")
out = "/content/onnx"; os.makedirs(out, exist_ok=True)
subprocess.run([sys.executable, "/content/lora_onnx.py", src, adapter, out], check=True)
dst = os.path.join(out, "model_q4.onnx_data")
if os.path.islink(dst): os.remove(dst)
if not os.path.exists(dst): import shutil; shutil.copy(os.path.realpath(data), dst)
print("그래프", os.path.getsize(os.path.join(out, "model_q4.onnx")) / 1e6, "MB", flush=True)

import onnxruntime as ort
ort.preload_dlls()
from tokenizers import Tokenizer
tok = Tokenizer.from_file(hf_hub_download(R, "tokenizer.json"))
sess = ort.InferenceSession(os.path.join(out, "model_q4.onnx"), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
print("providers", sess.get_providers(), flush=True)
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
D = "/content/data"; LANGS = ["ko_KR", "en_US", "zh_CN"]
EOL = {"ko_KR": '이 글 "{}" 을 한 낱말로 줄이면:', "en_US": 'This text: "{}" means in one word:', "zh_CN": '这段话"{}"用一个词概括是：'}
docs = {l: json.load(open(f"{D}/corpus-{l}.json")) for l in LANGS}
queries = [json.loads(x) for x in open(f"{D}/queries.jsonl")]
doc_text = lambda d: f"{d['title']}\n{d['text'][:600]}"
def vec(text, lang, lora):
    s = EOL[lang].format(text) if pool == "eol" else text
    ids = tok.encode(s, add_special_tokens=False).ids[:512]
    f = dict(EMPTY)
    f["input_ids"] = np.array([ids], dtype=np.int64); f["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    f["num_logits_to_keep"] = np.array(1 if pool == "eol" else len(ids), dtype=np.int64)
    f["lora_scale"] = np.array(lora, dtype=np.float32)
    h = sess.run(["hidden"], f)[0][0]
    v = h[-1] if pool == "eol" else h.mean(0)
    return v / (np.linalg.norm(v) + 1e-9)
for lora in (1.0, 0.0):
    t0 = time.time()
    dv = {l: np.stack([vec(doc_text(d), l, lora) for d in docs[l]]) for l in LANGS}
    qv = np.stack([vec(q["q"], q["lang"], lora) for q in queries])
    np.savez(f"{out}/emb-onnx-lora{int(lora)}.npz", q=qv, **{f"d_{l}": dv[l] for l in LANGS})
    print("저장 lora", lora, f"{time.time() - t0:.0f}초", flush=True)
print("ONNXDONE", flush=True)
