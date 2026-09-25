"""앱 판정기(route-v2·topic-v1)의 특징을 내주는 작은 서버 — 브라우저 워커 대신 CPU ONNX 로.

`scripts/llm/judge/features.py` 와 같은 계산(원본 q4, 판정 위치에서 끊어 넣기, logits 2048개).
헤드 계산은 부르는 쪽(TS)이 앱의 `scoreJudge` 로 한다.

  POST /features {"state": str, "questions": [{"instructions": str, "options": [{"name", "description"}]}]}
  → {"features": [[[2048 floats] × (선택지 수 + 1)] × 질문 수]}

  uv run --python 3.13 --with onnxruntime --with tokenizers --with huggingface_hub --with numpy \
    python scripts/llm/kev-agent/app_judge_serve.py 8010
"""
import json, sys, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "judge"))
import features as F  # noqa: E402  (모델을 읽어 들인다)

LOCK = threading.Lock()


def run(state, questions):
    out = []
    for q in questions:
        crit = {o["name"]: o.get("description") for o in q["options"]}
        ids, ends, _ = F.row(state, {"instructions": q["instructions"], "criteria": crit})
        with LOCK:
            f = F.logits_at(ids, ends + [len(ids) - 1])
        out.append(f.astype(float).round(5).tolist())
    return out


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        data = json.dumps({"features": run(body["state"], body["questions"])}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a): pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    print("app judge on", port, flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
