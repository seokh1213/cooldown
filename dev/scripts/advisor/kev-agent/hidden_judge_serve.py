"""앱 판정 그래프(kev LoRA 를 덧붙인 q4)의 은닉 상태를 내주는 작은 서버 — 브라우저 워커(`loraFeatures.ts`) 대신 CPU ONNX 로.

토큰화와 판정 위치는 부르는 쪽(TS)이 앱의 `encodeJudgeRow` 로 정하고, 헤드 계산도 앱의 `scoreJudge` 로 한다.
여기는 그래프를 한 번 돌려(lora_scale 1 · embed_scale 0) 판정 위치의 은닉 상태만 돌려준다. 앱은 위치마다 조각으로
이어 넣지만 인과 모델이라 한 번에 넣은 것과 같다(수치 오차만).

  POST /hidden {"ids": [int], "positions": [int]}  →  {"hidden": [[1024 floats] × 위치 수]}

  uv run --python 3.13 --with onnxruntime --with numpy \
    python dev/scripts/advisor/kev-agent/hidden_judge_serve.py <model_q4.onnx 가 든 폴더> 8014
  (폴더에는 public/models/kev/<판>/model_q4.onnx 와 원본 가중치 model_q4.onnx_data 를 함께 둔다 — 심볼릭 링크는 ORT 가 거부한다)
"""
import json, os, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np, onnxruntime as ort

folder, port = sys.argv[1], int(sys.argv[2])
so = ort.SessionOptions(); so.intra_op_num_threads = int(os.environ.get("THREADS", 6))
sess = ort.InferenceSession(os.path.join(folder, "model_q4.onnx"), so, providers=["CPUExecutionProvider"])
EMPTY = {}
for i in sess.get_inputs():
    if i.name in ("input_ids", "attention_mask", "num_logits_to_keep", "lora_scale", "embed_scale"): continue
    EMPTY[i.name] = np.zeros([1 if d == "batch_size" else (0 if isinstance(d, str) else d) for d in i.shape], dtype=np.float32)
GATES = {i.name for i in sess.get_inputs()} & {"lora_scale", "embed_scale"}
LOCK = threading.Lock()


def hidden(ids, positions):
    feeds = dict(EMPTY)
    feeds["input_ids"] = np.array([ids], dtype=np.int64)
    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
    feeds["num_logits_to_keep"] = np.array(len(ids), dtype=np.int64)
    for g in GATES: feeds[g] = np.array(1.0 if g == "lora_scale" else 0.0, dtype=np.float32)
    with LOCK:
        h = sess.run(["hidden"], feeds)[0][0]
    return h[positions].astype(float).round(6).tolist()


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        data = json.dumps({"hidden": hidden(body["ids"], body["positions"])}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a): pass


print(f"http://127.0.0.1:{port}", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
