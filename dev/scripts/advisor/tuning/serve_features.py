"""Loopback-only feature cache shared by current and candidate evaluations."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from onnx_features import Features


def serve(graph, cache, port):
    runtime = Features(graph, cache=cache)
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["content-length"])))
            with lock:
                gate = body.get("gate", "lora_scale")
                if gate not in ["lora_scale", "embed_scale"]: raise ValueError("Unsupported LoRA branch")
                hidden = runtime.hidden(body["ids"], body["positions"], gate=gate)
            data = json.dumps({"hidden": hidden.astype(float).round(6).tolist()}).encode()
            self.send_response(200); self.send_header("content-type", "application/json")
            self.end_headers(); self.wfile.write(data)
        def do_GET(self):
            self.send_response(200); self.end_headers(); self.wfile.write(b"ready")
        def log_message(self, *_):
            pass
    print("Local q4 feature server ready", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("graph"); parser.add_argument("cache"); parser.add_argument("--port", type=int, default=8024)
    args = parser.parse_args(); serve(args.graph, args.cache, args.port)
