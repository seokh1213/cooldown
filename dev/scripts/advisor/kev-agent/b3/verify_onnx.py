"""LoRA 를 덧붙인 q4 ONNX(`lora_onnx.py`)가 kev 판정을 재현하는지 — CPU ONNX Runtime 으로 판정 위치의 은닉 상태를
꺼내 kev 헤드(head.pt)로 고른다. 브라우저 워커와 같은 계산(판정 위치마다 끊어 넣기)이다.

  python3 verify_onnx.py <model_q4_kev.onnx> <head.pt> <kev 요청 JSONL> [--base]
  --base  LoRA 없는 원본 그래프 출력(logits 대신 은닉 상태가 없으므로 비교용으로 lora 를 0 으로 만든 그래프가 필요) — 쓰지 않음
"""
import json, sys, time
import numpy as np, onnxruntime as ort, torch
from tokenizers import Tokenizer
from huggingface_hub import hf_hub_download

model, head_path, src = sys.argv[1:4]
LORA = 0.0 if "--no-lora" in sys.argv else 1.0
SPECIAL = ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"]
tok = Tokenizer.from_file(hf_hub_download("onnx-community/Qwen3.5-0.8B-Text-ONNX", "tokenizer.json"))
S_ID, Q_ID, O_ID, C_ID, D_ID = (tok.token_to_id(t) for t in SPECIAL)
import re
_SPECIAL_RE = re.compile(r"<\|([A-Za-z0-9_]+)\|>")
def enc(text): return tok.encode(_SPECIAL_RE.sub(r"<¦\1¦>", text), add_special_tokens=False).ids

so = ort.SessionOptions(); so.intra_op_num_threads = 8
sess = ort.InferenceSession(model, so, providers=["CPUExecutionProvider"])
OUT = [o.name for o in sess.get_outputs()]
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
want = ["hidden"] + [o for o in OUT if o.startswith("present")]

def run(ids, past, start, end):
    feeds = dict(past)
    feeds["input_ids"] = np.array([ids[start:end]], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, end), dtype=np.int64)
    feeds["num_logits_to_keep"] = np.array(1, dtype=np.int64)
    feeds["lora_scale"] = np.array(LORA, dtype=np.float32)
    res = dict(zip(want, sess.run(want, feeds)))
    nxt = {k.replace("present_conv", "past_conv").replace("present_recurrent", "past_recurrent").replace("present", "past_key_values"): v
           for k, v in res.items() if k.startswith("present")}
    return res["hidden"][0, -1], nxt

ck = torch.load(head_path, map_location="cpu", weights_only=False)
st = ck["head"] if "head" in ck else ck.get("state", ck)
st = {k.split("head.")[-1]: v for k, v in st.items()}
qW, qb, kW, kb = (st[k].float().numpy() for k in ("q.weight", "q.bias", "k.weight", "k.bias"))
T = float(ck.get("temperature", 1.0) or 1.0)
scale = 1 / np.sqrt(qW.shape[0])

def choose(state_ids, q):
    """kev 행 꼴: 상태 뒤에 질문 한 줄 [<q> 지시 <opt> 선택지 </opt> … <decide>]. 선택지마다 </opt>, 마지막 <decide>."""
    opts = list(q["criteria"].keys())
    br = [Q_ID] + enc(q["instructions"])
    ends = []
    for o in opts:
        d = q["criteria"][o]
        br += [O_ID] + enc(o if d in (None, "") else f"{o}: {d}") + [C_ID]; ends.append(len(br) - 1)
    br.append(D_ID)
    ids = state_ids + br
    past, start, hs = dict(EMPTY), 0, []
    for p in [len(state_ids) + e for e in ends] + [len(ids) - 1]:
        h, past = run(ids, past, start, p + 1); hs.append(h); start = p + 1
    hs = np.stack(hs)
    qv = qW @ hs[-1] + qb
    kv = hs[:-1] @ kW.T + kb
    z = kv @ qv * scale / T
    return opts[int(z.argmax())]

rows = [json.loads(l) for l in open(src)]
right = total = 0; t0 = time.time(); per = {}
for n, r in enumerate(rows):
    state_ids = [S_ID] + enc(r["state"])
    got = {qid: choose(state_ids, q) for qid, q in r["questions"].items()}
    kind = r["questions"].get("kind")
    if kind:
        ok = got["kind"] == kind["label"] and (kind["label"] != "matchup" or "mine" not in got or got["mine"] == r["questions"]["mine"]["label"])
    else:
        q = r["questions"]["act"]; ok = got["act"] == q["label"]
    right += ok; total += 1
    if n % 50 == 0: print(n, f"{time.time() - t0:.0f}s", f"{right}/{total}", flush=True)
print(f"맞힘 {right}/{total}")
