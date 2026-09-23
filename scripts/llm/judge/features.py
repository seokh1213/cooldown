"""방식 A′: 원본 q4 파일 그대로. 판정 위치의 logits 중 고정 토큰 2048개를 특징으로 쓴다.

출력층이 임베딩과 묶여 있어(lm_head = embed_tokens) logits 는 마지막 은닉 상태의 선형 변환이다.
토큰 2048개를 고르면 1024차원 은닉 상태를 2048차원으로 옮긴 셈이라 정보가 줄지 않는다.
브라우저에서는 판정 위치마다 입력을 끊어 넣어 그 위치의 logits 하나만 받는다.
"""
import json, sys, time, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

SPECIAL = ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
S_ID, Q_ID, O_ID, C_ID, D_ID = (tok.token_to_id(t) for t in SPECIAL)
# 일반 어휘 구간에서 고르게 2048개. 특수·예약 토큰(248000 이후)은 임베딩이 학습되지 않았을 수 있어 뺀다.
SUBSET = np.linspace(100, 240000, 2048).astype(np.int64)
so = ort.SessionOptions(); so.intra_op_num_threads = 8
MODEL = hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "onnx/model_q4.onnx"); hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "onnx/model_q4.onnx_data")
sess = ort.InferenceSession(MODEL, so, providers=["CPUExecutionProvider"])
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)

def enc(text): return tok.encode(text, add_special_tokens=False).ids

def row(state, q):
    opts = list(q["criteria"].keys())
    ids = [S_ID] + enc(state) + [Q_ID] + enc(q["instructions"]); ends = []
    for o in opts:
        desc = q["criteria"][o]
        ids += [O_ID] + enc(o if desc is None else f"{o}: {desc}") + [C_ID]; ends.append(len(ids) - 1)
    ids.append(D_ID)
    return ids, ends, opts

def logits_at(ids, positions):
    feeds = dict(EMPTY)
    feeds["input_ids"] = np.array([ids], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    feeds["num_logits_to_keep"] = np.array(len(ids), dtype=np.int64)
    lg = sess.run(["logits"], feeds)[0][0]          # [L, V]
    return lg[positions][:, SUBSET]

def main(src, dst):
    out = []; t = time.time()
    for n, line in enumerate(open(src)):
        rec = json.loads(line)
        for qid, q in rec["questions"].items():
            if q.get("label") is None: continue
            ids, ends, opts = row(rec["state"], q)
            f = logits_at(ids, ends + [len(ids) - 1])
            out.append({"qid": qid, "decide": f[-1], "opts": f[:-1], "label": opts.index(q["label"]), "lang": rec.get("lang")})
        if n % 100 == 0: print(n, f"{time.time()-t:.0f}s", flush=True)
    np.save(dst, np.array(out, dtype=object), allow_pickle=True)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
