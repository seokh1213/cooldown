"""학습한 헤드를 브라우저가 읽는 꼴로 내보낸다. 입력 정규화는 가중치에 접어 넣는다.
  x' = (x - mu) / sd  →  W x' + b = (W / sd) x + (b - W (mu / sd))
"""
import json, sys, numpy as np, torch
src, out, meta_extra = sys.argv[1], sys.argv[2], json.loads(open(sys.argv[3]).read())
ck = torch.load(src, weights_only=False)
st, mu, sd = ck["state"], ck["mu"].astype(np.float64), ck["sd"].astype(np.float64)
def fold(W, b):
    W = W.double().numpy(); b = b.double().numpy()
    return (W / sd).astype(np.float32), (b - W @ (mu / sd)).astype(np.float32)
qW, qb = fold(st["q.weight"], st["q.bias"]); kW, kb = fold(st["k.weight"], st["k.bias"])
with open(out + ".bin", "wb") as f:
    for a in (qW, qb, kW, kb): f.write(np.ascontiguousarray(a).tobytes())
subset = np.linspace(100, 240000, qW.shape[1]).astype(np.int64).tolist()
meta = {"model": {"id": "onnx-community/Qwen3.5-0.8B-Text-ONNX", "dtype": "q4"}, "subset": subset,
        "dim": int(qW.shape[1]), "pointer": int(qW.shape[0]), "temperature": 1.0, **meta_extra}
json.dump(meta, open(out + ".json", "w"), ensure_ascii=False)
# 접은 가중치가 원래 계산과 같은지 한 번 대조한다
x = np.random.RandomState(0).randn(qW.shape[1]).astype(np.float32) * sd.astype(np.float32) + mu.astype(np.float32)
ref = (st["q.weight"].numpy() @ ((x - mu) / sd).astype(np.float32)) + st["q.bias"].numpy()
print("fold max|diff|", float(np.abs(qW @ x + qb - ref).max()), "bin", (qW.nbytes + qb.nbytes) * 2 / 1e6, "MB")
