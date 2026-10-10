"""헤드 학습용 특징 추출 — 앱 판정 그래프(kev LoRA 를 덧붙인 q4)의 판정 위치 은닉 상태를 행마다 꺼내 청크로 저장한다.

토큰화와 판정 위치는 앱의 `encodeJudgeRow` 와 같다(상태 · 질문 · 선택지마다 `</opt>` · 마지막 `<decide>`). 인과 모델이라
한 번에 넣고 위치만 고른다(`hidden_judge_serve.py` 와 같음). 청크(`part-NNNN.npz`)는 이미 있으면 건너뛰어 이어 갈 수 있고,
로컬은 청크가 생기는 대로 내려받는다 — Colab 세션이 회수돼도 받은 만큼은 남는다.

  python3 extract_features.py <model_q4.onnx 가 든 폴더> <rows.jsonl> <out-dir> [--chunk 400] [--cpu]

  npz: feats float16 [n_pos, 1024] (행의 판정 위치를 이어 붙임), offsets int32 [n_rows+1], labels int32 [n_rows], task str [n_rows]
"""
import json, os, re, sys, time
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

folder, src, out = sys.argv[1:4]
CHUNK = int(sys.argv[sys.argv.index("--chunk") + 1]) if "--chunk" in sys.argv else 400
os.makedirs(out, exist_ok=True)

SPECIAL = ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
S_ID, Q_ID, O_ID, C_ID, D_ID = (tok.token_to_id(t) for t in SPECIAL)
_SPECIAL_RE = re.compile(r"<\|(\w+)\|>")
def enc(text): return tok.encode(_SPECIAL_RE.sub(r"<¦\1¦>", text), add_special_tokens=False).ids

def encode_row(state, q):
    ids = [S_ID] + enc(state) + [Q_ID] + enc(q["instructions"])
    positions = []
    for name, desc in q["criteria"].items():
        ids += [O_ID] + enc(f"{name}: {desc}" if desc else name) + [C_ID]
        positions.append(len(ids) - 1)
    ids.append(D_ID)
    positions.append(len(ids) - 1)
    return ids, positions

if "--cpu" not in sys.argv:
    try: ort.preload_dlls()
    except Exception as e: print("preload_dlls:", e)
so = ort.SessionOptions(); so.intra_op_num_threads = 8
providers = ["CPUExecutionProvider"] if "--cpu" in sys.argv else ["CUDAExecutionProvider", "CPUExecutionProvider"]
sess = ort.InferenceSession(os.path.join(folder, "model_q4.onnx"), so, providers=providers)
print("providers:", sess.get_providers(), flush=True)
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale", "embed_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
GATES = {i.name for i in sess.get_inputs()} & {"lora_scale", "embed_scale"}

def hidden(ids, positions):
    feeds = dict(EMPTY)
    feeds["input_ids"] = np.array([ids], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    feeds["num_logits_to_keep"] = np.array(len(ids), dtype=np.int64)
    for g in GATES: feeds[g] = np.array(1.0 if g == "lora_scale" else 0.0, dtype=np.float32)
    return sess.run(["hidden"], feeds)[0][0][positions]

rows = [json.loads(l) for l in open(src)]
print(f"{len(rows)} rows, chunk {CHUNK}", flush=True)
t0 = time.time()
for start in range(0, len(rows), CHUNK):
    name = os.path.join(out, f"part-{start // CHUNK:04d}.npz")
    if os.path.exists(name): continue
    feats, offsets, labels, tasks, rowid = [], [0], [], [], []
    for i, r in enumerate(rows[start:start + CHUNK]):
        # 한 행에 질문이 둘일 수 있다(갈래 + 내 챔피언). 질문마다 한 표본이다
        for task, q in r["questions"].items():
            if "label" not in q: continue
            ids, positions = encode_row(r["state"], q)
            h = hidden(ids, positions).astype(np.float16)
            feats.append(h); offsets.append(offsets[-1] + len(positions))
            labels.append(list(q["criteria"].keys()).index(q["label"])); tasks.append(task); rowid.append(start + i)
    tmp = name + ".tmp.npz"
    np.savez(tmp, feats=np.concatenate(feats), offsets=np.array(offsets, dtype=np.int32), labels=np.array(labels, dtype=np.int32), task=np.array(tasks), rowid=np.array(rowid, dtype=np.int32))
    os.replace(tmp, name)
    done = min(start + CHUNK, len(rows))
    print(f"{name} rows {start}-{done} {time.time() - t0:.0f}s ({(time.time() - t0) / done:.2f}s/row)", flush=True)
open(os.path.join(out, "DONE"), "w").write(str(len(rows)))
print("done", flush=True)
