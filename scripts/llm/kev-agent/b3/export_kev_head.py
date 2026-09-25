"""kev 헤드(head.pt)를 앱 판정 헤드 꼴(.json + .bin)로 내보낸다. 특징은 logits 가 아니라 은닉 상태(1024)다.

  python3 export_kev_head.py <head.pt> <out-prefix> <그래프 URL(앱 기준 상대)>
"""
import json, sys, numpy as np, torch
src, out, graph = sys.argv[1:4]
ck = torch.load(src, map_location="cpu", weights_only=False)
st = ck["head"]
qW, qb, kW, kb = (st[k].float().numpy() for k in ("q.weight", "q.bias", "k.weight", "k.bias"))
with open(out + ".bin", "wb") as f:
    for a in (qW, qb, kW, kb): f.write(np.ascontiguousarray(a, dtype=np.float32).tobytes())
meta = {"model": {"id": "onnx-community/Qwen3.5-0.8B-Text-ONNX", "dtype": "q4", "graph": graph}, "feature": "hidden", "subset": [],
        "dim": int(qW.shape[1]), "pointer": int(qW.shape[0]), "temperature": float(ck.get("temperature", 1.0) or 1.0),
        "name": out.rsplit("/", 1)[-1],
        "trainedOn": "kev-0.8B ← B2(route·topic) ← B3(route 9갈래 1,391 · 대화 흐름 1,959 · topic 600), 원본 Qwen3.5-0.8B-Base 에서 학습. "
                     "앱은 Instruct q4 그래프에 LoRA 를 덧붙여 쓴다(scripts/llm/kev-agent/b3/lora_onnx.py): act-test 54/60, route-large 9갈래 판정기만 316/374",
        "instructions": {}}
json.dump(meta, open(out + ".json", "w"), ensure_ascii=False)
print(qW.shape, "→", out)
